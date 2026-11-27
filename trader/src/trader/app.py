"""설정으로 엔진을 조립한다."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Engine as DbEngine
from sqlalchemy import text

from trader.broker.paper import PaperBroker
from trader.clock import Clock, SimClock, SystemClock
from trader.config import BootSettings, Settings
from trader.control import RuntimeControls, fee_schedule, resolve_settings, risk_limits, static_info
from trader.engine import Engine, EngineConfig, StrategySlot
from trader.marketdata.base import MarketDataFeed
from trader.marketdata.context import StockSimContextProvider
from trader.marketdata.csv_replay import CsvReplayFeed
from trader.marketdata.stocksim_client import StockSimClient
from trader.marketdata.stocksim_feed import StockSimFeed
from trader.marketdata.synthetic import SyntheticFeed
from trader.risk.manager import RiskManager
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


def build_strategies(s: Settings) -> list[StrategySlot]:
    made: dict[str, Strategy] = {
        "ma_cross": MovingAverageCross(s.strategy_fast, s.strategy_slow, s.strategy_order_value),
        "intraday_score": IntradayScore(s.strategy_order_value),
    }
    return [StrategySlot(made[name], shadow=name in s.shadow_strategies) for name in s.strategies]


def build_engine(
    config: Settings | Mapping[str, Any],
    *,
    db: DbEngine | None = None,
    take_lock: bool = True,
    explicit: tuple[str, ...] = (),
) -> Engine:
    """엔진을 조립한다.

    config 는 trader.env 값(`load_env_values()`) 또는 완성된 Settings(테스트). 운영 설정(TUNABLE)은 DB 가 원본이다 —
    인스턴스 락을 잡은 뒤 DB `settings` 를 읽고, 없으면 config 의 값을 처음 한 번 옮긴다 (`control.resolve_settings`).
    explicit 은 trader.env 에 실제로 적힌 키 (DB 값 때문에 무시되는 키를 알리는 용도).
    """
    env: dict[str, Any] = config.model_dump() if isinstance(config, Settings) else dict(config)
    boot = BootSettings.model_validate(env)
    db = db or create_db_engine(boot.database_url.get_secret_value())
    check_schema(db)
    lock: InstanceLock | None = None
    if take_lock:
        lock = InstanceLock(db)
        lock.acquire()

    try:
        resolved = resolve_settings(SqlTradingStore(db), env, datetime.now(UTC), explicit=explicit)
    except Exception:
        if lock is not None:
            lock.release()
        raise
    s = resolved.settings
    if resolved.env_ignored:
        log.warning(
            "trader.env 의 운영 설정은 무시된다: DB(화면) 값을 쓴다",
            extra={"fields": {"keys": list(resolved.env_ignored)}},
        )

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
        fees=fee_schedule(s),
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
        controls=RuntimeControls(
            store,
            s,
            version=resolved.version,
            env_ignored=resolved.env_ignored,
            rejected=resolved.rejected,
            poll_seconds=float(s.health_check_seconds),
        ),
        info=static_info(s),
    )
