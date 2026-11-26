"""주문 게이트웨이 — 주문이 브로커로 가는 **유일한** 경로.

순서
1. client_order_id 를 (전략, 종목, 신호 봉 시각, 방향)에서 결정적으로 만든다
   → 재시작 후 같은 신호가 다시 나와도 같은 ID 라서 DB UNIQUE 에 걸린다
2. 위험 관리 평가 → 결과를 전략 판단 기록에 남긴다
3. 승인된 주문을 PENDING_NEW 로 DB 에 커밋한다. 여기서 실패하면 브로커로 보내지 않는다
4. 브로커에 보낸다
5. 브로커 응답을 DB 에 기록한다. 여기서 실패하면 (주문은 나갔는데 기록이 없으므로) 엔진을 멈춘다
"""

from __future__ import annotations

import hashlib
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from trader.broker.base import Broker, BrokerError
from trader.clock import Clock
from trader.domain import OrderRequest, OrderState, OrderStatus, OrderType, Side
from trader.risk.manager import RiskContext, RiskManager
from trader.storage.store import DuplicateOrderError, TradingStore

log = logging.getLogger(__name__)


class FatalEngineError(Exception):
    """계속 돌리면 기록과 실제가 어긋날 수 있는 오류. 엔진은 멈추고 재시작 복구로 넘어간다."""


@dataclass(frozen=True, slots=True)
class OrderIntent:
    """전략이 내는 주문 의도. 브로커와 무관하다."""

    strategy_id: str
    symbol: str
    side: Side
    qty: Decimal
    signal_ts: datetime
    order_type: OrderType = OrderType.MARKET
    limit_price: Decimal | None = None


@dataclass(frozen=True, slots=True)
class SubmitResult:
    outcome: str  # SENT / REJECTED / DUPLICATE / BROKER_REJECTED / BROKER_ERROR
    client_order_id: str
    reason: str | None = None
    state: OrderState | None = None


def make_client_order_id(
    account_id: int, strategy_id: str, symbol: str, signal_ts: datetime, side: Side
) -> str:
    """같은 계좌·전략·종목·신호 봉·방향이면 항상 같은 ID. 계좌가 다르면 다른 ID (DB UNIQUE 는 전역이다)."""
    stamp = signal_ts.strftime("%Y%m%dT%H%M%S")
    key = f"{account_id}|{strategy_id}|{symbol}|{signal_ts.isoformat()}|{side.value}"
    h = hashlib.sha256(key.encode()).hexdigest()[:10]
    return f"{strategy_id[:16]}-{symbol[:12]}-{stamp}-{side.value[0]}-{h}"


class OrderGateway:
    def __init__(
        self,
        *,
        store: TradingStore,
        broker: Broker,
        risk: RiskManager,
        clock: Clock,
        account_id: int,
        context: Callable[[], RiskContext],
    ) -> None:
        self._store = store
        self._broker = broker
        self._risk = risk
        self._clock = clock
        self._account_id = account_id
        self._context = context

    async def submit(self, intent: OrderIntent, decision_id: int | None) -> SubmitResult:
        coid = make_client_order_id(
            self._account_id, intent.strategy_id, intent.symbol, intent.signal_ts, intent.side
        )
        req = OrderRequest(
            client_order_id=coid,
            symbol=intent.symbol,
            side=intent.side,
            order_type=intent.order_type,
            qty=intent.qty,
            limit_price=intent.limit_price,
            strategy_id=intent.strategy_id,
        )

        if self._store.order_exists(coid):
            self._note(decision_id, "DUPLICATE", "같은 신호의 주문이 이미 있다", coid)
            return SubmitResult("DUPLICATE", coid, "already exists")

        ctx = self._context()
        decision = self._risk.evaluate(req, ctx)
        if not decision.approved or decision.approval is None:
            self._note(decision_id, "REJECTED", f"{decision.code}: {decision.reason}", None)
            self._store.record_risk_event(
                "ORDER_REJECTED",
                ctx.now,
                symbol=req.symbol,
                client_order_id=coid,
                detail={"code": decision.code, "reason": decision.reason, "value": decision.order_value},
            )
            return SubmitResult("REJECTED", coid, decision.code)

        # DB 선기록. 실패 시 브로커로 보내지 않는다 (예외는 호출자에게 — 호출자는 DB 장애로 처리)
        try:
            self._store.insert_order(self._account_id, self._broker.name, req, decision_id, ctx.now)
        except DuplicateOrderError:
            self._note(decision_id, "DUPLICATE", "같은 신호의 주문이 이미 있다", coid)
            return SubmitResult("DUPLICATE", coid, "already exists")
        self._note(decision_id, "APPROVED", None, coid)

        try:
            state = await self._broker.place_order(req, decision.approval)
        except BrokerError as e:
            now = self._clock.now()
            if e.uncertain:
                # 접수 여부를 모른다 → PENDING_NEW 로 두고 신규 주문을 멈춘 뒤 복구에서 브로커 조회로 정리
                raise FatalEngineError(f"주문 접수 여부 불확실: {coid}: {e}") from e
            failed = OrderState(
                coid,
                req.symbol,
                req.side,
                req.order_type,
                req.qty,
                req.limit_price,
                OrderStatus.REJECTED,
                reject_reason=f"broker error: {e}"[:255],
            )
            self._record_or_die(failed, "BROKER_ERROR", now)
            return SubmitResult("BROKER_ERROR", coid, str(e))

        self._record_or_die(
            state, "ACK" if state.status is not OrderStatus.REJECTED else "REJECTED", self._clock.now()
        )
        if state.status is OrderStatus.REJECTED:
            return SubmitResult("BROKER_REJECTED", coid, state.reject_reason, state)
        log.info(
            "order sent",
            extra={"fields": {"coid": coid, "symbol": req.symbol, "side": req.side, "qty": req.qty}},
        )
        return SubmitResult("SENT", coid, None, state)

    def _note(self, decision_id: int | None, result: str, reason: str | None, coid: str | None) -> None:
        if decision_id is not None:
            self._store.update_decision_risk(decision_id, result, reason, coid)

    def _record_or_die(self, state: OrderState, event: str, now: datetime) -> None:
        try:
            self._store.update_order(state, event, now)
        except Exception as e:
            raise FatalEngineError(f"주문 응답 기록 실패: {state.client_order_id}") from e
