"""엔진: 시세 → 봉·지표 → 전략 판단 → 주문 게이트웨이, 그리고 체결 반영·감시.

동시에 도는 것
- 시세 루프: 시세 1건을 끝까지 처리한 다음에 다음 시세를 받는다
- 체결 루프: 브로커 실행 이벤트를 DB 에 반영한다. 실패하면 엔진을 멈춘다
- 감시 루프: 단일 인스턴스 락, DB 헬스, 킬스위치, 화면 설정·전략 스위치를 주기적으로 확인하고 상태 신호를 남긴다
- 맥락 루프: (stocksim 일 때) 지수·VIX·수급·상하한가를 받는다

전략
- 주문하는 전략은 하나, 나머지는 그림자(신호·성과만 기록)
- 신호(BUY/SELL/EXIT)마다 5·15·30분·장마감 성과를 남긴다

규칙 청산 (전략·AI 를 거치지 않는다)
- 매수 때 위험 관리가 정한 손절·목표가에 닿으면 EXIT
- eod_exit 시각(KST)이 되면 보유분 EXIT

멈춤 규칙
- 기록과 실제가 어긋날 수 있는 오류(FatalEngineError, 락 상실, 체결 기록 실패)는 즉시 종료(exit 2).
  컨테이너가 재시작되면 recovery 가 DB 와 브로커를 맞춘다.
- DB 일시 장애, 데이터 이상은 신규 주문만 막고 계속 돈다.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass, field, replace
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from trader.broker.base import Broker, OrderNotFound
from trader.broker.paper import PaperBroker
from trader.clock import KST, Clock, SimClock, kst_trade_date, to_kst
from trader.control import HEARTBEAT_KEY, RuntimeControls, SettingsChange, fee_schedule, risk_limits
from trader.domain import ExecKind, ExecutionEvent, OrderStatus, Quote, Side
from trader.execution.gateway import FatalEngineError, OrderGateway, OrderIntent
from trader.indicators import IndicatorBook
from trader.logging_setup import log_fields
from trader.marketdata.bars import BarAggregator, BarUpdate, bucket_start
from trader.marketdata.context import ContextProvider, NullContextProvider
from trader.money import ZERO
from trader.performance import direction_of, evaluate, horizons_for
from trader.recovery import RecoveryReport, recover
from trader.risk.health import TradingHealth
from trader.risk.killswitch import KillSwitch
from trader.risk.manager import RiskContext, RiskManager, equity
from trader.storage.db import InstanceLock
from trader.storage.store import TradingStore
from trader.strategy.base import ORDER_ACTIONS, Decision, MarketView, PortfolioView, Strategy

log = logging.getLogger(__name__)

EXIT_OK = 0
EXIT_FATAL = 2
RISK_EXIT_ID = "risk_exit"
EOD_EXIT_ID = "eod_exit"


@dataclass(frozen=True, slots=True)
class EngineConfig:
    symbols: list[str]
    bar_interval_s: int
    max_missing_bars: int
    quote_flush_size: int
    killswitch_poll_s: float
    health_check_s: float
    eod_exit: time | None = None
    session_close: time = time(15, 30)
    # 기록용 보조 봉 (예: 5분봉)
    extra_bar_intervals: tuple[int, ...] = ()


@dataclass(slots=True)
class StrategySlot:
    strategy: Strategy
    shadow: bool


@dataclass(slots=True)
class _Protect:
    stop: Decimal | None
    take: Decimal | None


@dataclass(slots=True)
class _ExitState:
    pending: dict[str, str] = field(default_factory=dict)  # symbol → client_order_id


class Engine:
    def __init__(
        self,
        *,
        cfg: EngineConfig,
        store: TradingStore,
        broker: Broker,
        clock: Clock,
        lock: InstanceLock | None,
        strategies: list[StrategySlot],
        risk: RiskManager,
        account_id: int,
        context: ContextProvider | None = None,
        controls: RuntimeControls | None = None,
        info: dict[str, object] | None = None,
    ) -> None:
        if sum(1 for s in strategies if not s.shadow) > 1:
            raise ValueError("주문하는 전략은 하나만 둘 수 있다")
        self.cfg = cfg
        self.store = store
        self.broker = broker
        self.clock = clock
        self.lock = lock
        self.strategies = strategies
        self.account_id = account_id
        self.context: ContextProvider = context or NullContextProvider()
        self.risk = risk
        self.controls = controls
        self.info = info or {}
        self.started_at: datetime | None = None
        self.health = TradingHealth()
        self.killswitch = KillSwitch(store, cfg.killswitch_poll_s)
        self.quotes: dict[str, Quote] = {}
        self.bars = BarAggregator(cfg.bar_interval_s)
        self.extra_bars = [BarAggregator(i) for i in cfg.extra_bar_intervals]
        self.indicators: dict[str, IndicatorBook] = {s: IndicatorBook() for s in cfg.symbols}
        self.positions: dict[str, Decimal] = {}
        self.protect: dict[str, _Protect] = {}
        self.exits = _ExitState()
        # 그림자 전략의 가상 보유 (전략, 종목) → 수량. 그림자 BUY 로 생기고 EXIT/SELL 로 줄어든다.
        # 실제 계좌 보유와 섞지 않는다 — 그래야 그림자 전략의 신호 성과가 자기 판단만 반영한다. 거래일마다 초기화
        self.shadow_pos: dict[tuple[str, str], Decimal] = {}
        self._shadow_day: date | None = None
        self.gateway = OrderGateway(
            store=store,
            broker=broker,
            risk=risk,
            clock=clock,
            account_id=account_id,
            context=self._risk_context,
        )
        self._quote_buf: list[Quote] = []
        self._day: date | None = None
        self._day_start_equity: Decimal | None = None
        self._recovering: dict[str, int] = {}
        self._fatal: BaseException | None = None
        self._halt_handled = False
        self.recovery: RecoveryReport | None = None
        self.stats = {"quotes": 0, "bars": 0, "decisions": 0, "orders_sent": 0, "fills": 0, "exits": 0}

    @property
    def strategy(self) -> Strategy:
        """주문하는 전략 (없으면 첫 전략)."""
        for s in self.strategies:
            if not s.shadow:
                return s.strategy
        return self.strategies[0].strategy

    # ── 실행 ─────────────────────────────────────────────────────────────

    async def run(self) -> int:
        self.started_at = self.clock.now()
        self.killswitch.refresh(force=True)
        if self.controls is not None:
            self._poll_controls(force=True)
            self.controls.publish(self.clock.now(), dict(self.info))
        restore = self.broker.restore if isinstance(self.broker, PaperBroker) else None
        self.recovery = await recover(
            store=self.store,
            broker=self.broker,
            account_id=self.account_id,
            killswitch=self.killswitch,
            now=self.clock.now(),
            restore=restore,
        )
        self._load_positions()
        self._restore_shadow_positions()
        self._warm_up()
        exec_task = asyncio.create_task(self._execution_loop(), name="executions")
        watch_task = asyncio.create_task(self._watch_loop(), name="watchdog")
        ctx_task = asyncio.create_task(self.context.run(), name="context")
        code = EXIT_OK
        try:
            async for q in self.broker.subscribe_quotes(self.cfg.symbols):
                self._raise_if_fatal(exec_task)
                await self._on_quote(q)
                # 이 시세로 생긴 체결 이벤트를 먼저 반영하게 차례를 넘긴다
                await asyncio.sleep(0)
            await exec_task
            self._raise_if_fatal(exec_task)
        except FatalEngineError as e:
            log.critical("fatal — stopping engine", extra=log_fields(err=str(e)))
            self._safe_risk_event("FATAL", {"err": str(e)})
            code = EXIT_FATAL
        except Exception as e:
            log.exception("unexpected error — stopping engine")
            self._safe_risk_event("ENGINE_ERROR", {"err": repr(e)[:500]})
            code = EXIT_FATAL
        finally:
            for t in (watch_task, exec_task, ctx_task):
                t.cancel()
            for t in (watch_task, exec_task, ctx_task):
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await t
            self._flush_quotes()
            await self.broker.close()
            if self.lock is not None:
                self.lock.release()
        log.info("engine stopped", extra=log_fields(code=code, **self.stats))
        return code

    def _raise_if_fatal(self, exec_task: asyncio.Task[None]) -> None:
        if self._fatal is not None:
            raise FatalEngineError(str(self._fatal)) from self._fatal
        if exec_task.done() and not exec_task.cancelled() and exec_task.exception():
            raise FatalEngineError(str(exec_task.exception()))

    def _load_positions(self) -> None:
        bal = self.store.load_balance(self.account_id)
        self.positions = {s: p.qty for s, p in bal.positions.items() if p.qty > 0}
        for sym in self.positions:
            stop, take = self.store.latest_entry_levels(self.account_id, sym)
            self.protect[sym] = _Protect(stop, take)

    def _warm_up(self) -> None:
        """DB 에 쌓인 최근 봉으로 지표·전략을 채운다. 다음 봉과 이어지지 않으면 누락 감지가 다시 초기화한다."""
        need = max(s.strategy.warmup_bars for s in self.strategies)
        for sym in self.cfg.symbols:
            try:
                bars = self.store.recent_bars(sym, self.cfg.bar_interval_s, max(need, 40))
            except Exception:
                log.exception("warm-up read failed", extra=log_fields(symbol=sym))
                continue
            view = PortfolioView(ZERO, ZERO, ZERO)
            for b in bars:
                snap = self.indicators[sym].add(b)
                for slot in self.strategies:
                    # 판단은 버린다 — 과거 봉으로 주문하지 않는다
                    slot.strategy.on_bar(b, view, MarketView(now=b.start_ts, indicators=snap))

    # ── 시세 ─────────────────────────────────────────────────────────────

    async def _on_quote(self, q: Quote) -> None:
        if isinstance(self.clock, SimClock):
            self.clock.advance_to(q.ts)
        self.stats["quotes"] += 1

        prev = self.quotes.get(q.symbol)
        if q.price <= 0 or q.volume < 0 or (prev is not None and q.ts < prev.ts):
            self.health.data_issues[q.symbol] = "잘못된 시세"
            self._safe_risk_event("DATA_INVALID", {"price": q.price, "ts": q.ts}, symbol=q.symbol)
            return
        self.quotes[q.symbol] = q

        self._quote_buf.append(q)
        if len(self._quote_buf) >= self.cfg.quote_flush_size:
            self._flush_quotes()

        await self._poll_killswitch()
        self._update_day_baseline()

        for agg in self.extra_bars:
            done = agg.add(q)
            if done is not None:
                self._record_bar(done)

        upd = self.bars.add(q)
        if upd is not None:
            await self._on_bar(upd)

        await self._rule_exits(q)

    def _flush_quotes(self) -> None:
        if not self._quote_buf:
            return
        try:
            self.store.record_quotes(self._quote_buf, self.clock.now())
            self._quote_buf.clear()
        except Exception as e:
            self._db_failed("record_quotes", e)
            # 무한히 쌓이지 않게 오래된 것은 버린다 (DB 장애 중엔 어차피 주문이 막힌다)
            del self._quote_buf[: -self.cfg.quote_flush_size * 10]

    def _update_day_baseline(self) -> None:
        today = kst_trade_date(self.clock.now())
        if self._day == today and self._day_start_equity is not None:
            return
        if self._day != today:
            self._day, self._day_start_equity = today, None
        try:
            existing = self.store.get_daily_start_equity(self.account_id, today)
            if existing is None:
                eq = equity(self.store.load_balance(self.account_id), self.quotes)
                if eq is None:
                    return  # 보유 종목 시세가 아직 없다 — 다음 시세에서 다시
                existing = self.store.set_daily_start_equity(self.account_id, today, eq, self.clock.now())
            self._day_start_equity = existing
        except Exception as e:
            self._db_failed("daily baseline", e)

    def _record_bar(self, upd: BarUpdate) -> None:
        try:
            self.store.record_bar(upd.bar)
        except Exception as e:
            self._db_failed("record_bar", e)

    # ── 봉·지표·전략 ─────────────────────────────────────────────────────

    async def _on_bar(self, upd: BarUpdate) -> None:
        bar, sym = upd.bar, upd.bar.symbol
        self.stats["bars"] += 1
        self._record_bar(upd)

        book = self.indicators[sym]
        if upd.missing_before >= self.cfg.max_missing_bars:
            book.reset()
            for slot in self.strategies:
                slot.strategy.reset(sym)
            self.health.data_issues[sym] = f"봉 누락 {upd.missing_before}개"
            self._recovering[sym] = max(s.strategy.warmup_bars for s in self.strategies)
            self._safe_risk_event(
                "DATA_GAP", {"missing": upd.missing_before, "bar": bar.start_ts}, symbol=sym
            )
        elif sym in self._recovering:
            self._recovering[sym] -= 1
            if self._recovering[sym] <= 0:
                del self._recovering[sym]
                self.health.data_issues.pop(sym, None)
        elif self.health.data_issues.get(sym) == "잘못된 시세":
            self.health.data_issues.pop(sym, None)

        snap = book.add(bar)
        self._evaluate_performance()

        try:
            view = self._portfolio_view(sym)
        except Exception as e:
            self._db_failed("portfolio view", e)
            return
        market = MarketView(now=self.clock.now(), indicators=snap, context=self.context.snapshot())
        self._roll_shadow_day()
        for slot in self.strategies:
            slot_view = view
            if slot.shadow:
                slot_view = PortfolioView(self.shadow_pos.get((slot.strategy.id, sym), ZERO), ZERO, ZERO)
            await self._run_strategy(
                slot,
                bar.start_ts,
                bar.start_ts + timedelta(seconds=bar.interval_s),
                sym,
                bar.close,
                slot.strategy.on_bar(bar, slot_view, market),
            )

    async def _run_strategy(
        self, slot: StrategySlot, bar_ts: datetime, bar_end: datetime, sym: str, close: Decimal, d: Decision
    ) -> None:
        strategy = slot.strategy
        try:
            did = self.store.insert_decision(
                ts=self.clock.now(),
                strategy_id=strategy.id,
                symbol=sym,
                bar_ts=bar_ts,
                action=d.action,
                reason=d.reason,
                inputs={**d.inputs, "signal_qty": d.qty},
                detail={
                    "shadow": slot.shadow,
                    "score": d.score,
                    "confidence": d.confidence,
                    "valid_until": d.valid_until,
                    "reasons": list(d.reasons) or None,
                    "invalidation": list(d.invalidation) or None,
                },
            )
            if d.action in ORDER_ACTIONS:
                self.store.insert_signal_performance(
                    did,
                    sym,
                    direction_of(d.action),
                    bar_end,
                    close,
                    horizons_for(bar_end, self.cfg.session_close),
                )
        except Exception as e:
            # 판단 기록이 없으면 주문하지 않는다
            self._db_failed("insert_decision", e)
            return
        self.stats["decisions"] += 1
        if d.action not in ORDER_ACTIONS or d.qty is None:
            return
        if d.action == "BUY" and self.controls is not None and not self.controls.enabled(strategy.id):
            # 꺼진 전략은 신규 매수만 하지 않는다. 매도·청산 신호와 규칙 청산은 그대로 간다
            try:
                self.store.update_decision_risk(
                    did, "STRATEGY_OFF", "전략이 꺼져 있다 — 신규 매수 안 함", None
                )
            except Exception as e:
                self._db_failed("strategy off note", e)
            return
        if slot.shadow:
            self._apply_shadow(strategy.id, sym, d.action, d.qty)
            try:
                self.store.update_decision_risk(did, "SHADOW", "그림자 전략 — 주문하지 않음", None)
            except Exception as e:
                self._db_failed("shadow note", e)
            return

        intent = OrderIntent(
            strategy_id=strategy.id,
            symbol=sym,
            side=Side.BUY if d.action == "BUY" else Side.SELL,
            qty=d.qty,
            signal_ts=bar_ts,
        )
        await self._submit(intent, did, d.action)

    async def _submit(self, intent: OrderIntent, decision_id: int | None, action: str) -> str | None:
        try:
            res = await self.gateway.submit(intent, decision_id)
        except FatalEngineError:
            raise
        except Exception as e:
            self._db_failed("submit", e)
            return None
        if res.outcome == "SENT":
            self.stats["orders_sent"] += 1
            if intent.side is Side.SELL:
                self.exits.pending[intent.symbol] = res.client_order_id
        log.info(
            "decision",
            extra=log_fields(
                symbol=intent.symbol,
                action=action,
                strategy=intent.strategy_id,
                outcome=res.outcome,
                detail=res.reason,
                coid=res.client_order_id,
            ),
        )
        return res.outcome

    def _portfolio_view(self, sym: str) -> PortfolioView:
        bal = self.store.load_balance(self.account_id)
        opens = [o for o in self.store.list_open_orders(self.account_id) if o.symbol == sym]
        return PortfolioView(
            position_qty=bal.qty(sym),
            open_buy_qty=sum((o.remaining_qty for o in opens if o.side is Side.BUY), ZERO),
            open_sell_qty=sum((o.remaining_qty for o in opens if o.side is Side.SELL), ZERO),
        )

    def _risk_context(self) -> RiskContext:
        self.killswitch.refresh(force=True)
        today = kst_trade_date(self.clock.now())
        ctx = self.context.snapshot()
        atr = {s: b.last.atr14 for s, b in self.indicators.items() if b.last is not None and b.last.atr14}
        upper = {
            s: c.upper_limit
            for s, c in ctx.symbols.items()
            if c.upper_limit is not None and c.limits_date == today
        }
        return RiskContext(
            now=self.clock.now(),
            halted=self.killswitch.halted,
            health=self.health,
            balance=self.store.load_balance(self.account_id),
            open_orders=self.store.list_open_orders(self.account_id),
            quotes=dict(self.quotes),
            day_start_equity=self._day_start_equity if self._day == today else None,
            atr=atr,
            upper_limits=upper,
            provides_price_limits=ctx.provides_price_limits,
        )

    # ── 그림자 가상 보유 ─────────────────────────────────────────────────

    def _apply_shadow(self, strategy_id: str, sym: str, action: str, qty: Decimal) -> None:
        key = (strategy_id, sym)
        cur = self.shadow_pos.get(key, ZERO)
        cur = cur + qty if action == "BUY" else cur - qty
        if cur > 0:
            self.shadow_pos[key] = cur
        else:
            self.shadow_pos.pop(key, None)

    def _roll_shadow_day(self) -> None:
        today = kst_trade_date(self.clock.now())
        if self._shadow_day != today:
            self._shadow_day = today
            self.shadow_pos.clear()

    def _restore_shadow_positions(self) -> None:
        """재시작 시 오늘 기록된 그림자 신호를 다시 적용해 가상 보유를 되살린다."""
        ids = [s.strategy.id for s in self.strategies if s.shadow]
        if not ids:
            return
        now = self.clock.now()
        self._shadow_day = kst_trade_date(now)
        day_start = datetime.combine(self._shadow_day, time(0, 0), KST)
        try:
            rows = self.store.shadow_signals_since(ids, day_start)
        except Exception:
            log.exception("shadow restore failed — 그림자 가상 보유를 비운 채로 시작한다")
            return
        for strategy_id, sym, action, qty in rows:
            if qty is not None and qty > 0:
                self._apply_shadow(strategy_id, sym, action, qty)

    # ── 규칙 청산 (손절·목표가·장 마감) ───────────────────────────────────

    async def _rule_exits(self, q: Quote) -> None:
        sym = q.symbol
        held = self.positions.get(sym, ZERO)
        if held <= 0 or sym in self.exits.pending:
            return
        reason = None
        strategy_id = RISK_EXIT_ID
        p = self.protect.get(sym)
        if p is not None and p.stop is not None and q.price <= p.stop:
            reason = f"손절가 {p.stop} 도달 ({q.price})"
        elif p is not None and p.take is not None and q.price >= p.take:
            reason = f"목표가 {p.take} 도달 ({q.price})"
        elif self.cfg.eod_exit is not None:
            k = to_kst(q.ts)
            if k.weekday() < 5 and k.time() >= self.cfg.eod_exit:
                reason, strategy_id = f"장 마감 전 청산 ({self.cfg.eod_exit:%H:%M})", EOD_EXIT_ID
        if reason is None:
            return

        signal_ts = bucket_start(q.ts, 60)
        try:
            did = self.store.insert_decision(
                ts=self.clock.now(),
                strategy_id=strategy_id,
                symbol=sym,
                bar_ts=signal_ts,
                action="EXIT",
                reason=reason,
                inputs={"price": q.price, "held": held},
            )
        except Exception as e:
            self._db_failed("insert_decision", e)
            return
        self.stats["exits"] += 1
        outcome = await self._submit(
            OrderIntent(strategy_id=strategy_id, symbol=sym, side=Side.SELL, qty=held, signal_ts=signal_ts),
            did,
            "EXIT",
        )
        if outcome == "DUPLICATE":
            # 이번 분에 이미 낸 청산이 있다 — 체결·취소 이벤트를 기다린다
            self.exits.pending.setdefault(sym, "duplicate")

    # ── 신호 성과 ────────────────────────────────────────────────────────

    def _evaluate_performance(self) -> None:
        # 만기 시각까지의 봉이 다 완성됐는지 보려면 한 봉 간격만큼 여유를 둔다
        cutoff = self.clock.now() - timedelta(seconds=self.cfg.bar_interval_s)
        try:
            for row in self.store.due_performance(cutoff):
                bars = self.store.bars_between(
                    row["symbol"], self.cfg.bar_interval_s, row["signal_ts"], row["due_ts"]
                )
                self.store.complete_performance(
                    row["id"], evaluate(row["ref_price"], int(row["direction"]), bars), self.clock.now()
                )
        except Exception as e:
            self._db_failed("performance", e)

    # ── 체결 ─────────────────────────────────────────────────────────────

    async def _execution_loop(self) -> None:
        async for ev in self.broker.subscribe_executions():
            try:
                self._apply_execution(ev)
            except Exception as e:
                self._fatal = e
                log.critical("execution record failed", extra=log_fields(coid=ev.client_order_id, err=str(e)))
                raise

    def _apply_execution(self, ev: ExecutionEvent) -> None:
        now = self.clock.now()
        sym = ev.order.symbol
        if ev.kind is ExecKind.FILL:
            assert ev.fill is not None
            if self.store.apply_fill(self.account_id, ev.fill, ev.order.status, now):
                self.stats["fills"] += 1
                sign = 1 if ev.fill.side is Side.BUY else -1
                self.positions[sym] = self.positions.get(sym, ZERO) + sign * ev.fill.qty
                if self.positions[sym] <= 0:
                    self.positions.pop(sym, None)
                    self.protect.pop(sym, None)
                    self.exits.pending.pop(sym, None)
                elif ev.fill.side is Side.BUY:
                    stop, take = self.store.latest_entry_levels(self.account_id, sym)
                    self.protect[sym] = _Protect(stop, take)
                log.info(
                    "fill",
                    extra=log_fields(
                        coid=ev.client_order_id,
                        side=ev.fill.side,
                        qty=ev.fill.qty,
                        price=ev.fill.price,
                        status=ev.order.status,
                    ),
                )
        else:
            self.store.update_order(
                ev.order, ev.kind.value, now, {"reason": ev.reason} if ev.reason else None
            )
        # 청산 주문이 체결 없이 끝나면 다시 청산을 시도할 수 있게 한다
        if not ev.order.status.is_open and self.exits.pending.get(sym) == ev.client_order_id:
            self.exits.pending.pop(sym, None)

    # ── 감시·킬스위치 ────────────────────────────────────────────────────

    async def _watch_loop(self) -> None:
        while True:
            await asyncio.sleep(self.cfg.health_check_s)
            if self.lock is not None and not await asyncio.to_thread(self.lock.still_held):
                self._fatal = FatalEngineError("단일 인스턴스 락을 잃었다 (DB 연결 끊김)")
                log.critical("instance lock lost")
                return
            try:
                self.store.ping()
                if not self.health.db_ok:
                    log.warning("db recovered")
                    self.health.mark_db_ok()
            except Exception as e:
                self._db_failed("ping", e)
            await self._poll_killswitch()
            self._poll_controls()
            self._heartbeat()

    async def _poll_killswitch(self) -> None:
        self.killswitch.refresh()
        if self.killswitch.halted and not self._halt_handled:
            self._halt_handled = True
            await self.cancel_all_open(f"killswitch: {self.killswitch.reason}")
        elif not self.killswitch.halted:
            self._halt_handled = False

    async def cancel_all_open(self, reason: str) -> None:
        """미체결 주문 일괄 취소. 실패한 건은 위험 이벤트로 남기고 킬스위치는 유지된다."""
        try:
            opens = self.store.list_open_orders(self.account_id)
        except Exception as e:
            self._db_failed("list_open_orders", e)
            self._halt_handled = False  # 다음 감시 주기에 다시 시도
            return
        for o in opens:
            try:
                if o.status is OrderStatus.PENDING_NEW:
                    try:
                        await self.broker.get_order(o.client_order_id)
                    except OrderNotFound:
                        self.store.update_order(
                            replace(o, status=OrderStatus.CANCELED, reject_reason="halt before send"),
                            "HALT_CANCELED",
                            self.clock.now(),
                        )
                        continue
                await self.broker.cancel_order(o.client_order_id)
            except Exception as e:  # BrokerError 포함 — 한 건 실패가 나머지 취소를 막지 않게
                self._safe_risk_event(
                    "CANCEL_FAILED",
                    {"err": str(e)[:200], "reason": reason},
                    symbol=o.symbol,
                    coid=o.client_order_id,
                )
        log.warning("cancel-all done", extra=log_fields(count=len(opens), reason=reason))

    # ── 화면 제어·상태 신호 ──────────────────────────────────────────────

    def _poll_controls(self, *, force: bool = False) -> None:
        if self.controls is None:
            return
        change = self.controls.poll(self.clock.now(), force=force)
        if change is not None:
            self.apply_settings(change)

    def apply_settings(self, change: SettingsChange) -> None:
        """검증을 통과한 새 설정을 다음 판단·체결부터 적용한다."""
        assert self.controls is not None
        s = change.settings
        self.risk.limits = risk_limits(s)  # 진입 마감(entry_cutoff) 포함
        if self.cfg.eod_exit != s.eod_exit:
            self.cfg = replace(self.cfg, eod_exit=s.eod_exit)
        if isinstance(self.broker, PaperBroker):
            self.broker.update_costs(fee_schedule(s), s.slippage_bps, s.participation_rate)
        for slot in self.strategies:
            if hasattr(slot.strategy, "order_value"):
                slot.strategy.order_value = s.strategy_order_value
        self.controls.applied(change, self.clock.now())

    def _heartbeat(self) -> None:
        now = self.clock.now()
        value: dict[str, object] = {
            "at": now.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "mode": self.info.get("mode", "paper"),
            "feed": self.info.get("feed"),
            "db_ok": self.health.db_ok,
            "halted": self.killswitch.halted,
            "data_issues": dict(self.health.data_issues),
            "last_quote_at": {s: q.ts.isoformat() for s, q in self.quotes.items()},
            "strategies": {
                slot.strategy.id: {
                    "shadow": slot.shadow,
                    "enabled": self.controls.enabled(slot.strategy.id) if self.controls else True,
                }
                for slot in self.strategies
            },
            "stats": dict(self.stats),
        }
        try:
            self.store.set_engine_state(HEARTBEAT_KEY, value, now, "engine")
        except Exception as e:
            self._db_failed("heartbeat", e)

    # ── 공통 ─────────────────────────────────────────────────────────────

    def _db_failed(self, where: str, e: Exception) -> None:
        if self.health.db_ok:
            log.error("db failure — new orders blocked", extra=log_fields(where=where, err=str(e)[:200]))
        self.health.mark_db_failure(f"{where}: {e}"[:200])

    def _safe_risk_event(
        self, kind: str, detail: dict[str, object], *, symbol: str | None = None, coid: str | None = None
    ) -> None:
        try:
            self.store.record_risk_event(
                kind, self.clock.now(), symbol=symbol, client_order_id=coid, detail=detail
            )
        except Exception as e:
            self._db_failed("record_risk_event", e)
