"""엔진: 시세 → 봉 → 전략 판단 → 주문 게이트웨이, 그리고 체결 반영·감시.

동시에 도는 것
- 시세 루프: 시세 1건을 끝까지 처리한 다음에 다음 시세를 받는다
- 체결 루프: 브로커 실행 이벤트를 DB 에 반영한다. 실패하면 엔진을 멈춘다
- 감시 루프: 단일 인스턴스 락, DB 헬스, 킬스위치를 주기적으로 확인한다

멈춤 규칙
- 기록과 실제가 어긋날 수 있는 오류(FatalEngineError, 락 상실, 체결 기록 실패)는 즉시 종료(exit 2).
  컨테이너가 재시작되면 recovery 가 DB 와 브로커를 맞춘다.
- DB 일시 장애, 데이터 이상은 신규 주문만 막고 계속 돈다.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass, replace
from datetime import date
from decimal import Decimal

from trader.broker.base import Broker, OrderNotFound
from trader.broker.paper import PaperBroker
from trader.clock import Clock, SimClock, kst_trade_date
from trader.domain import ExecKind, ExecutionEvent, OrderStatus, Quote, Side
from trader.execution.gateway import FatalEngineError, OrderGateway, OrderIntent
from trader.logging_setup import log_fields
from trader.marketdata.bars import BarAggregator, BarUpdate
from trader.money import ZERO
from trader.recovery import RecoveryReport, recover
from trader.risk.health import TradingHealth
from trader.risk.killswitch import KillSwitch
from trader.risk.manager import RiskContext, RiskManager, equity
from trader.storage.db import InstanceLock
from trader.storage.store import TradingStore
from trader.strategy.base import PortfolioView, Strategy

log = logging.getLogger(__name__)

EXIT_OK = 0
EXIT_FATAL = 2


@dataclass(frozen=True, slots=True)
class EngineConfig:
    symbols: list[str]
    bar_interval_s: int
    max_missing_bars: int
    quote_flush_size: int
    killswitch_poll_s: float
    health_check_s: float


class Engine:
    def __init__(
        self,
        *,
        cfg: EngineConfig,
        store: TradingStore,
        broker: Broker,
        clock: Clock,
        lock: InstanceLock | None,
        strategy: Strategy,
        risk: RiskManager,
        account_id: int,
    ) -> None:
        self.cfg = cfg
        self.store = store
        self.broker = broker
        self.clock = clock
        self.lock = lock
        self.strategy = strategy
        self.account_id = account_id
        self.health = TradingHealth()
        self.killswitch = KillSwitch(store, cfg.killswitch_poll_s)
        self.quotes: dict[str, Quote] = {}
        self.bars = BarAggregator(cfg.bar_interval_s)
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
        self.stats = {"quotes": 0, "bars": 0, "decisions": 0, "orders_sent": 0, "fills": 0}

    # ── 실행 ─────────────────────────────────────────────────────────────

    async def run(self) -> int:
        self.killswitch.refresh(force=True)
        restore = self.broker.restore if isinstance(self.broker, PaperBroker) else None
        self.recovery = await recover(
            store=self.store,
            broker=self.broker,
            account_id=self.account_id,
            killswitch=self.killswitch,
            now=self.clock.now(),
            restore=restore,
        )
        self._warm_up()
        exec_task = asyncio.create_task(self._execution_loop(), name="executions")
        watch_task = asyncio.create_task(self._watch_loop(), name="watchdog")
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
            watch_task.cancel()
            exec_task.cancel()
            for t in (watch_task, exec_task):
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

    def _warm_up(self) -> None:
        """DB 에 쌓인 최근 봉으로 전략 지표를 채운다. 다음 봉과 이어지지 않으면 누락 감지가 다시 초기화한다."""
        for sym in self.cfg.symbols:
            try:
                bars = self.store.recent_bars(sym, self.cfg.bar_interval_s, self.strategy.warmup_bars)
            except Exception:
                log.exception("warm-up read failed", extra=log_fields(symbol=sym))
                continue
            view = PortfolioView(ZERO, ZERO, ZERO)
            for b in bars:
                self.strategy.on_bar(b, view)  # 판단은 버린다 — 과거 봉으로 주문하지 않는다

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

        upd = self.bars.add(q)
        if upd is not None:
            await self._on_bar(upd)

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

    # ── 봉·전략 ──────────────────────────────────────────────────────────

    async def _on_bar(self, upd: BarUpdate) -> None:
        bar, sym = upd.bar, upd.bar.symbol
        self.stats["bars"] += 1
        try:
            self.store.record_bar(bar)
        except Exception as e:
            self._db_failed("record_bar", e)

        if upd.missing_before >= self.cfg.max_missing_bars:
            self.strategy.reset(sym)
            self.health.data_issues[sym] = f"봉 누락 {upd.missing_before}개"
            self._recovering[sym] = self.strategy.warmup_bars
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

        try:
            view = self._portfolio_view(sym)
        except Exception as e:
            self._db_failed("portfolio view", e)
            return
        decision = self.strategy.on_bar(bar, view)
        try:
            did = self.store.insert_decision(
                ts=self.clock.now(),
                strategy_id=self.strategy.id,
                symbol=sym,
                bar_ts=bar.start_ts,
                action=decision.action,
                reason=decision.reason,
                inputs=decision.inputs,
            )
        except Exception as e:
            # 판단 기록이 없으면 주문하지 않는다
            self._db_failed("insert_decision", e)
            return
        self.stats["decisions"] += 1
        if decision.action == "HOLD" or decision.qty is None:
            return

        intent = OrderIntent(
            strategy_id=self.strategy.id,
            symbol=sym,
            side=Side.BUY if decision.action == "BUY" else Side.SELL,
            qty=decision.qty,
            signal_ts=bar.start_ts,
        )
        try:
            res = await self.gateway.submit(intent, did)
        except FatalEngineError:
            raise
        except Exception as e:
            self._db_failed("submit", e)
            return
        if res.outcome == "SENT":
            self.stats["orders_sent"] += 1
        log.info(
            "decision",
            extra=log_fields(
                symbol=sym,
                action=decision.action,
                reason=decision.reason,
                outcome=res.outcome,
                detail=res.reason,
                coid=res.client_order_id,
            ),
        )

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
        return RiskContext(
            now=self.clock.now(),
            halted=self.killswitch.halted,
            health=self.health,
            balance=self.store.load_balance(self.account_id),
            open_orders=self.store.list_open_orders(self.account_id),
            quotes=dict(self.quotes),
            day_start_equity=self._day_start_equity if self._day == today else None,
        )

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
        if ev.kind is ExecKind.FILL:
            assert ev.fill is not None
            if self.store.apply_fill(self.account_id, ev.fill, ev.order.status, now):
                self.stats["fills"] += 1
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
