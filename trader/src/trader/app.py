"""설정으로 엔진을 조립한다."""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import Engine as DbEngine
from sqlalchemy import text

from trader.broker.paper import FeeSchedule, PaperBroker
from trader.clock import Clock, SimClock, SystemClock
from trader.config import Settings
from trader.engine import Engine, EngineConfig, StrategySlot
from trader.marketdata.base import MarketDataFeed
from trader.marketdata.context import StockSimContextProvider
from trader.marketdata.csv_replay import CsvReplayFeed
from trader.marketdata.stocksim_client import StockSimClient
from trader.marketdata.stocksim_feed import StockSimFeed
from trader.marketdata.synthetic import SyntheticFeed
from trader.risk.manager import RiskLimits, RiskManager
from trader.storage.db import InstanceLock, create_db_engine
from trader.storage.models import SCHEMA_REVISION
from trader.storage.store import SqlTradingStore
from trader.strategy.base import Strategy
from trader.strategy.intraday_score import IntradayScore
from trader.strategy.ma_cross import MovingAverageCross

log = logging.getLogger(__name__)


class SchemaMismatchError(Exception):
    pass


def check_schema(db: DbEngine) -> None:
    with db.connect() as c:
        try:
            rev = c.execute(text("SELECT version_num FROM alembic_version")).scalar()
        except Exception as e:
            raise SchemaMismatchError("alembic_version 이 없다 — 마이그레이션을 먼저 실행할 것") from e
    if rev != SCHEMA_REVISION:
        raise SchemaMismatchError(
            f"DB 스키마 버전 {rev!r} != 엔진 기대 {SCHEMA_REVISION!r} — alembic upgrade head"
        )


def stocksim_client(s: Settings) -> StockSimClient:
    return StockSimClient(s.stocksim_base_url)


def build_feed(s: Settings, clock: Clock) -> MarketDataFeed:
    if s.feed == "stocksim":
        return StockSimFeed(
            client=stocksim_client(s),
            symbols=s.symbols,
            clock=clock,
            poll_seconds=float(s.stocksim_poll_seconds),
            poll_start=s.stocksim_poll_start,
            poll_end=s.stocksim_poll_end,
        )
    if s.feed == "csv":
        assert s.feed_csv_path is not None
        return CsvReplayFeed(s.feed_csv_path)
    return SyntheticFeed(
        symbols=s.symbols,
        seed=s.synthetic_seed,
        start_price=s.synthetic_start_price,
        tick_size=s.synthetic_tick_size,
        tick_seconds=s.synthetic_tick_seconds,
        market_open=s.market_open,
        market_close=s.market_close,
        pace=s.pace,
        clock=clock,
        days=s.synthetic_days,
    )


def risk_limits(s: Settings) -> RiskLimits:
    return RiskLimits(
        max_order_value=s.risk_max_order_value,
        max_position_value=s.risk_max_position_value,
        daily_loss_limit=s.risk_daily_loss_limit,
        max_quote_age=timedelta(seconds=s.max_quote_age_seconds),
        approval_ttl=timedelta(seconds=s.risk_approval_ttl_seconds),
        slippage_bps=s.slippage_bps,
        commission_rate_buy=s.commission_rate_buy,
        enforce_market_hours=s.enforce_market_hours,
        market_open=s.market_open,
        market_close=s.market_close,
        commission_rate_sell=s.commission_rate_sell,
        sell_tax_rate=s.sell_tax_rate,
        entry_cutoff=s.entry_cutoff,
        require_atr_stop=True,
        atr_stop_mult=s.risk_atr_stop_mult,
        atr_take_mult=s.risk_atr_take_mult,
        min_risk_reward=s.risk_min_risk_reward,
        max_spread_bps=s.risk_max_spread_bps,
        near_upper_limit_pct=s.risk_near_upper_limit_pct,
    )


def build_strategies(s: Settings) -> list[StrategySlot]:
    made: dict[str, Strategy] = {
        "ma_cross": MovingAverageCross(s.strategy_fast, s.strategy_slow, s.strategy_order_value),
        "intraday_score": IntradayScore(s.strategy_order_value),
    }
    return [StrategySlot(made[name], shadow=name in s.shadow_strategies) for name in s.strategies]


def build_engine(s: Settings, *, db: DbEngine | None = None, take_lock: bool = True) -> Engine:
    db = db or create_db_engine(s.database_url.get_secret_value())
    check_schema(db)
    lock: InstanceLock | None = None
    if take_lock:
        lock = InstanceLock(db)
        lock.acquire()

    clock: Clock = SystemClock()
    feed = build_feed(s, clock)
    if s.pace == "fast":
        # 재생 모드: 가상 시계를 첫 시세 시각에 맞춘다. 이후 시세 시각을 따라 앞으로만 간다
        start = feed.start_time()
        if start is None:
            raise ValueError("재생할 시세가 없다")
        clock = SimClock(start)
        feed = build_feed(s, clock)
    store = SqlTradingStore(db)
    broker = PaperBroker(
        feed=feed,
        clock=clock,
        fees=FeeSchedule(
            commission_rate_buy=s.commission_rate_buy,
            commission_rate_sell=s.commission_rate_sell,
            sell_tax_rate=s.sell_tax_rate,
            rounding=s.fee_rounding,
        ),
        slippage_bps=s.slippage_bps,
        participation_rate=s.participation_rate,
        price_decimals=s.price_decimals,
    )
    account_id = store.ensure_account(s.account_name, broker.name, "KRW", s.paper_initial_cash, clock.now())
    context = (
        StockSimContextProvider(
            client=stocksim_client(s),
            symbols=s.symbols,
            clock=clock,
            poll_seconds=float(s.stocksim_context_seconds),
        )
        if s.feed == "stocksim"
        else None
    )
    return Engine(
        cfg=EngineConfig(
            symbols=s.symbols,
            bar_interval_s=s.bar_interval_seconds,
            max_missing_bars=s.max_missing_bars,
            quote_flush_size=s.quote_flush_size,
            killswitch_poll_s=float(s.killswitch_poll_seconds),
            health_check_s=float(s.health_check_seconds),
            eod_exit=s.eod_exit,
            session_close=s.session_close,
            extra_bar_intervals=(300,) if s.bar_interval_seconds == 60 else (),
        ),
        store=store,
        broker=broker,
        clock=clock,
        lock=lock,
        strategies=build_strategies(s),
        risk=RiskManager(risk_limits(s)),
        account_id=account_id,
        context=context,
    )
