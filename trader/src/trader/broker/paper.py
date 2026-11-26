"""PaperBroker — 가상 체결 브로커.

체결 모델
- 주문은 접수 후 **다음 시세부터** 체결된다 (접수 시점 시세로 바로 체결하지 않는다).
- 시장가: 매수는 매도호가(없으면 체결가)에, 매도는 매수호가(없으면 체결가)에 슬리피지를
  불리하게 더한 가격. 호가 자릿수로 맞출 때도 불리하게 올림/내림.
- 지정가: 기준가가 지정가에 닿으면 체결. 체결가는 슬리피지를 적용하되 지정가를 넘지 않는다.
- 부분 체결: 시세 1틱의 거래량 × participation_rate 까지만 체결된다 (같은 종목 주문은 접수 순).
- 매수 체결 시점에 현금이 모자라면 살 수 있는 만큼만 체결하고 나머지는 취소한다.
- 당일(DAY) 주문은 KST 거래일이 바뀌면 취소된다.
- 수수료·세금은 설정값(비율, 원 단위 처리 규칙)으로만 계산한다.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, replace
from datetime import date
from decimal import Decimal

from trader.broker.base import BrokerError, OrderNotFound
from trader.clock import Clock, kst_trade_date
from trader.domain import (
    AccountBalance,
    ExecKind,
    ExecutionEvent,
    Fill,
    OrderRequest,
    OrderState,
    OrderStatus,
    OrderType,
    Position,
    Quote,
    Side,
)
from trader.marketdata.base import MarketDataFeed
from trader.money import ZERO, RoundingMode, floor_shares, q_amount, round_cash, round_price_against_us
from trader.risk.approval import RiskApproval, verify

log = logging.getLogger(__name__)

BPS = Decimal(10000)


@dataclass(frozen=True, slots=True)
class FeeSchedule:
    commission_rate_buy: Decimal
    commission_rate_sell: Decimal
    sell_tax_rate: Decimal
    rounding: RoundingMode

    def commission(self, side: Side, notional: Decimal) -> Decimal:
        rate = self.commission_rate_buy if side is Side.BUY else self.commission_rate_sell
        return round_cash(notional * rate, self.rounding)

    def tax(self, side: Side, notional: Decimal) -> Decimal:
        if side is Side.BUY:
            return ZERO
        return round_cash(notional * self.sell_tax_rate, self.rounding)


@dataclass(slots=True)
class _PaperOrder:
    state: OrderState
    trade_date: date


def exec_id_for(client_order_id: str, filled_before: Decimal) -> str:
    """체결 ID. 주문별 누적 체결수량이 늘어나기만 하므로 재시작 후에도 겹치지 않는다."""
    h = hashlib.sha256(client_order_id.encode()).hexdigest()[:32]
    return f"P-{h}-{format(filled_before.normalize(), 'f')}"[:64]


class PaperBroker:
    name = "paper"

    def __init__(
        self,
        *,
        feed: MarketDataFeed,
        clock: Clock,
        fees: FeeSchedule,
        slippage_bps: Decimal,
        participation_rate: Decimal,
        price_decimals: int = 0,
    ) -> None:
        self._feed = feed
        self._clock = clock
        self._fees = fees
        self._slip = slippage_bps / BPS
        self._participation = participation_rate
        self._price_decimals = price_decimals
        self._cash = ZERO
        self._positions: dict[str, Position] = {}
        self._orders: dict[str, _PaperOrder] = {}
        self._last: dict[str, Quote] = {}
        self._exec_q: asyncio.Queue[ExecutionEvent | None] = asyncio.Queue()
        self._restored = False

    # ── 복구 ─────────────────────────────────────────────────────────────

    def restore(self, balance: AccountBalance, open_orders: list[OrderState]) -> None:
        """DB 에서 읽은 잔고와 (브로커가 접수했던) 미체결 주문으로 상태를 되살린다."""
        if self._restored:
            raise BrokerError("restore 는 한 번만 호출한다")
        self._cash = balance.cash
        self._positions = dict(balance.positions)
        today = kst_trade_date(self._clock.now())
        for o in open_orders:
            if o.status is OrderStatus.PENDING_NEW:
                continue  # 접수 전 주문은 브로커에 없다
            self._orders[o.client_order_id] = _PaperOrder(o, today)
        self._restored = True

    # ── 조회 ─────────────────────────────────────────────────────────────

    async def get_quote(self, symbol: str) -> Quote:
        q = self._last.get(symbol)
        if q is None:
            raise BrokerError(f"시세 없음: {symbol}")
        return q

    async def get_balance(self) -> AccountBalance:
        return AccountBalance(
            cash=self._cash, positions={k: v for k, v in self._positions.items() if v.qty != 0}
        )

    async def get_order(self, client_order_id: str) -> OrderState:
        o = self._orders.get(client_order_id)
        if o is None:
            raise OrderNotFound(client_order_id)
        return o.state

    async def list_open_orders(self) -> list[OrderState]:
        return [o.state for o in self._orders.values() if o.state.status.is_open]

    # ── 주문 ─────────────────────────────────────────────────────────────

    async def place_order(self, req: OrderRequest, approval: RiskApproval) -> OrderState:
        now = self._clock.now()
        verify(req, approval, now)
        if req.client_order_id in self._orders:
            raise BrokerError(f"중복 client_order_id: {req.client_order_id}")

        state = OrderState(
            client_order_id=req.client_order_id,
            symbol=req.symbol,
            side=req.side,
            order_type=req.order_type,
            qty=req.qty,
            limit_price=req.limit_price,
            status=OrderStatus.NEW,
            broker_order_id=f"paper-{req.client_order_id}"[:64],
            tif=req.tif,
            strategy_id=req.strategy_id,
        )
        reason = self._precheck(req)
        if reason:
            state = replace(state, status=OrderStatus.REJECTED, reject_reason=reason)
            self._orders[req.client_order_id] = _PaperOrder(state, kst_trade_date(now))
            self._emit(ExecutionEvent(ExecKind.REJECTED, req.client_order_id, now, state, reason=reason))
            return state
        self._orders[req.client_order_id] = _PaperOrder(state, kst_trade_date(now))
        self._emit(ExecutionEvent(ExecKind.ACCEPTED, req.client_order_id, now, state))
        return state

    def _precheck(self, req: OrderRequest) -> str | None:
        if req.qty != floor_shares(req.qty):
            return "주식 수량은 정수여야 한다"
        if req.side is Side.SELL:
            held = self._positions.get(req.symbol, Position(req.symbol, ZERO, ZERO)).qty
            reserved = sum(
                (
                    o.state.remaining_qty
                    for o in self._orders.values()
                    if o.state.status.is_open and o.state.symbol == req.symbol and o.state.side is Side.SELL
                ),
                ZERO,
            )
            if req.qty > held - reserved:
                return "매도 가능 수량 부족"
            return None
        last = self._last.get(req.symbol)
        ref = req.limit_price if req.limit_price is not None else (last.ask or last.price) if last else None
        if ref is None:
            return "시세가 없어 주문 금액을 추정할 수 없다"
        est = ref * req.qty * (1 + self._slip)
        reserved_cash = sum(
            (
                self._reserve(o.state)
                for o in self._orders.values()
                if o.state.status.is_open and o.state.side is Side.BUY
            ),
            ZERO,
        )
        if est + self._fees.commission(Side.BUY, est) > self._cash - reserved_cash:
            return "주문 가능 현금 부족"
        return None

    def _reserve(self, o: OrderState) -> Decimal:
        last = self._last.get(o.symbol)
        ref = o.limit_price if o.limit_price is not None else ((last.ask or last.price) if last else ZERO)
        return ref * o.remaining_qty * (1 + self._slip)

    async def cancel_order(self, client_order_id: str) -> OrderState:
        o = self._orders.get(client_order_id)
        if o is None:
            raise OrderNotFound(client_order_id)
        if not o.state.status.is_open:
            return o.state
        now = self._clock.now()
        o.state = replace(o.state, status=OrderStatus.CANCELED)
        self._emit(
            ExecutionEvent(ExecKind.CANCELED, client_order_id, now, o.state, reason="canceled by request")
        )
        return o.state

    # ── 실시간 ───────────────────────────────────────────────────────────

    async def subscribe_quotes(self, symbols: list[str]) -> AsyncIterator[Quote]:
        wanted = set(symbols)
        try:
            async for q in self._feed.stream():
                if q.symbol not in wanted:
                    continue
                self._last[q.symbol] = q
                self._match(q)
                yield q
        finally:
            self._exec_q.put_nowait(None)

    async def subscribe_executions(self) -> AsyncIterator[ExecutionEvent]:
        while True:
            ev = await self._exec_q.get()
            if ev is None:
                return
            yield ev

    async def close(self) -> None:
        self._exec_q.put_nowait(None)

    def _emit(self, ev: ExecutionEvent) -> None:
        self._exec_q.put_nowait(ev)

    # ── 체결 ─────────────────────────────────────────────────────────────

    def _match(self, q: Quote) -> None:
        now = q.ts
        today = kst_trade_date(now)
        available = floor_shares(q.volume * self._participation)
        for coid, o in list(self._orders.items()):
            st = o.state
            if st.symbol != q.symbol or not st.status.is_open:
                continue
            if o.trade_date < today:
                o.state = replace(st, status=OrderStatus.CANCELED, reject_reason="DAY 주문 만료")
                self._emit(ExecutionEvent(ExecKind.CANCELED, coid, now, o.state, reason="day order expired"))
                continue
            if available <= 0:
                continue
            buying = st.side is Side.BUY
            ref = (q.ask or q.price) if buying else (q.bid or q.price)
            if st.order_type is OrderType.LIMIT:
                assert st.limit_price is not None
                if (buying and ref > st.limit_price) or (not buying and ref < st.limit_price):
                    continue
            slipped = ref * (1 + self._slip) if buying else ref * (1 - self._slip)
            price = round_price_against_us(slipped, buying=buying, places=self._price_decimals)
            if st.order_type is OrderType.LIMIT:
                assert st.limit_price is not None
                price = min(price, st.limit_price) if buying else max(price, st.limit_price)
            qty = min(st.remaining_qty, available)

            cancel_rest = False
            if buying:
                qty = self._affordable(price, qty)
                if qty < min(st.remaining_qty, available):
                    cancel_rest = True
                if qty <= 0:
                    o.state = replace(st, status=OrderStatus.CANCELED, reject_reason="체결 시점 현금 부족")
                    self._emit(
                        ExecutionEvent(ExecKind.CANCELED, coid, now, o.state, reason="insufficient cash")
                    )
                    continue
            else:
                held = self._positions.get(st.symbol, Position(st.symbol, ZERO, ZERO)).qty
                qty = min(qty, held)
                if qty <= 0:
                    o.state = replace(st, status=OrderStatus.CANCELED, reject_reason="보유 수량 없음")
                    self._emit(ExecutionEvent(ExecKind.CANCELED, coid, now, o.state, reason="no position"))
                    continue

            self._fill(o, q, price, ref, qty)
            available -= qty
            if cancel_rest and o.state.status.is_open:
                o.state = replace(o.state, status=OrderStatus.CANCELED, reject_reason="체결 시점 현금 부족")
                self._emit(ExecutionEvent(ExecKind.CANCELED, coid, now, o.state, reason="insufficient cash"))

    def _affordable(self, price: Decimal, qty: Decimal) -> Decimal:
        while qty > 0:
            notional = price * qty
            if notional + self._fees.commission(Side.BUY, notional) <= self._cash:
                return qty
            # 대략적인 최대 수량으로 한 번에 줄인 뒤 1주씩 맞춘다
            approx = floor_shares(self._cash / (price * (1 + self._fees.commission_rate_buy)))
            qty = min(qty - 1, approx)
        return ZERO

    def _fill(self, o: _PaperOrder, q: Quote, price: Decimal, ref: Decimal, qty: Decimal) -> None:
        st = o.state
        notional = price * qty
        commission = self._fees.commission(st.side, notional)
        tax = self._fees.tax(st.side, notional)
        filled_before = st.filled_qty
        new_filled = filled_before + qty
        prev_value = (st.avg_fill_price or ZERO) * filled_before
        avg = q_amount((prev_value + notional) / new_filled)
        status = OrderStatus.FILLED if new_filled == st.qty else OrderStatus.PARTIALLY_FILLED

        pos = self._positions.get(st.symbol, Position(st.symbol, ZERO, ZERO))
        if st.side is Side.BUY:
            new_qty = pos.qty + qty
            new_avg = q_amount((pos.qty * pos.avg_price + notional) / new_qty)
            self._positions[st.symbol] = Position(st.symbol, new_qty, new_avg, pos.realized_pnl)
            self._cash -= notional + commission + tax
        else:
            new_qty = pos.qty - qty
            realized = q_amount(pos.realized_pnl + (price - pos.avg_price) * qty)
            self._positions[st.symbol] = Position(
                st.symbol, new_qty, pos.avg_price if new_qty else ZERO, realized
            )
            self._cash += notional - commission - tax

        o.state = replace(st, filled_qty=new_filled, avg_fill_price=avg, status=status)
        fill = Fill(
            exec_id=exec_id_for(st.client_order_id, filled_before),
            client_order_id=st.client_order_id,
            symbol=st.symbol,
            side=st.side,
            ts=q.ts,
            qty=qty,
            price=price,
            commission=commission,
            tax=tax,
            slippage=q_amount(abs(price - ref) * qty),
        )
        self._emit(ExecutionEvent(ExecKind.FILL, st.client_order_id, q.ts, o.state, fill=fill))
