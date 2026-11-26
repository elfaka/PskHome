from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest

from tests.fakes import T0, ListFeed, quote
from trader.broker.base import BrokerError, OrderNotFound
from trader.broker.paper import FeeSchedule, PaperBroker
from trader.clock import SimClock
from trader.domain import (
    AccountBalance,
    ExecKind,
    ExecutionEvent,
    OrderRequest,
    OrderStatus,
    OrderType,
    Position,
    Quote,
    Side,
)
from trader.risk.approval import ApprovalError, RiskApproval, _issue

FEES = FeeSchedule(
    commission_rate_buy=Decimal("0.0001"),
    commission_rate_sell=Decimal("0.0001"),
    sell_tax_rate=Decimal("0.002"),
    rounding="down",
)


def make_broker(
    quotes: list[Quote],
    *,
    cash: str = "10000000",
    slip: str = "0",
    part: str = "1",
    positions: dict[str, Position] | None = None,
) -> tuple[PaperBroker, SimClock]:
    clock = SimClock(T0)
    b = PaperBroker(
        feed=ListFeed(quotes),
        clock=clock,
        fees=FEES,
        slippage_bps=Decimal(slip),
        participation_rate=Decimal(part),
    )
    b.restore(AccountBalance(Decimal(cash), positions or {}), [])
    return b, clock


def req(coid: str, side: Side = Side.BUY, qty: int = 10, limit: int | None = None) -> OrderRequest:
    return OrderRequest(
        client_order_id=coid,
        symbol="005930",
        side=side,
        order_type=OrderType.LIMIT if limit else OrderType.MARKET,
        qty=Decimal(qty),
        limit_price=Decimal(limit) if limit else None,
    )


def ok(r: OrderRequest, clock: SimClock) -> RiskApproval:
    return _issue(r, clock.now(), timedelta(seconds=5))


async def drain(b: PaperBroker, symbols: list[str] | None = None) -> list[ExecutionEvent]:
    """시세를 끝까지 흘리고 그동안 나온 실행 이벤트를 모은다."""
    async for _ in b.subscribe_quotes(symbols or ["005930"]):
        pass
    return [ev async for ev in b.subscribe_executions()]


async def prime(b: PaperBroker, clock: SimClock, q: Quote) -> None:
    """주문 전에 마지막 시세를 하나 넣어 둔다."""
    b._last[q.symbol] = q
    clock.advance_to(q.ts)


# ── 승인 ─────────────────────────────────────────────────────────────────


async def test_order_without_approval_is_refused() -> None:
    b, clock = make_broker([])
    await prime(b, clock, quote(70000))
    r = req("a")
    with pytest.raises(ApprovalError):
        await b.place_order(r, None)  # type: ignore[arg-type]
    with pytest.raises(ApprovalError):
        RiskApproval("x", "a", clock.now(), timedelta(seconds=5), b"forged-key-00000")
    # 다른 주문의 승인으로는 안 된다
    with pytest.raises(ApprovalError):
        await b.place_order(r, ok(req("a", qty=11), clock))
    # 만료된 승인
    stale = ok(r, clock)
    clock.advance(timedelta(seconds=6))
    with pytest.raises(ApprovalError):
        await b.place_order(r, stale)


async def test_duplicate_client_order_id_refused() -> None:
    b, clock = make_broker([])
    await prime(b, clock, quote(70000))
    r = req("a")
    await b.place_order(r, ok(r, clock))
    with pytest.raises(BrokerError):
        await b.place_order(r, ok(r, clock))


# ── 체결 ─────────────────────────────────────────────────────────────────


async def test_market_buy_fills_on_next_quote_with_slippage_and_fees() -> None:
    b, clock = make_broker([quote(70000, sec=1, ask=70100)], slip="10")  # 10bp
    await prime(b, clock, quote(69000))
    r = req("a", qty=10)
    st = await b.place_order(r, ok(r, clock))
    assert st.status is OrderStatus.NEW
    evs = await drain(b)
    assert [e.kind for e in evs] == [ExecKind.ACCEPTED, ExecKind.FILL]
    f = evs[1].fill
    assert f is not None
    # 매도호가 70100 × 1.001 = 70170.1 → 불리하게 올림 70171
    assert f.price == Decimal(70171)
    assert f.commission == Decimal(70)  # 701,710 × 0.0001 = 70.171 → 절사
    assert f.tax == 0
    assert f.slippage == Decimal(710)  # (70171 - 70100) × 10
    bal = await b.get_balance()
    assert bal.cash == Decimal(10_000_000) - Decimal(701_710) - 70
    assert bal.positions["005930"].qty == 10


async def test_market_sell_pays_tax_and_realizes_pnl() -> None:
    b, clock = make_broker(
        [quote(71000, sec=1, bid=70900)],
        slip="0",
        positions={"005930": Position("005930", Decimal(10), Decimal(70000))},
    )
    await prime(b, clock, quote(71000))
    r = req("s", Side.SELL, qty=10)
    await b.place_order(r, ok(r, clock))
    evs = await drain(b)
    f = evs[-1].fill
    assert f is not None and f.price == Decimal(70900)
    assert f.commission == Decimal(70)  # 709,000 × 0.0001 = 70.9 → 절사
    assert f.tax == Decimal(1418)  # 709,000 × 0.002
    bal = await b.get_balance()
    assert "005930" not in bal.positions
    assert bal.cash == Decimal(10_000_000) + Decimal(709_000) - 70 - 1418


async def test_partial_fills_by_participation() -> None:
    quotes = [quote(70000, sec=i, volume=8) for i in range(1, 4)]  # 틱당 8 × 0.5 = 4주
    b, clock = make_broker(quotes, part="0.5")
    await prime(b, clock, quote(70000))
    r = req("a", qty=10)
    await b.place_order(r, ok(r, clock))
    evs = await drain(b)
    fills = [e for e in evs if e.kind is ExecKind.FILL]
    assert [f.fill.qty for f in fills if f.fill] == [Decimal(4), Decimal(4), Decimal(2)]
    assert [f.order.status for f in fills] == [
        OrderStatus.PARTIALLY_FILLED,
        OrderStatus.PARTIALLY_FILLED,
        OrderStatus.FILLED,
    ]
    assert len({f.fill.exec_id for f in fills if f.fill}) == 3


async def test_limit_buy_waits_until_price_reaches_limit() -> None:
    quotes = [quote(70500, sec=1), quote(70200, sec=2), quote(69900, sec=3)]
    b, clock = make_broker(quotes, slip="50")
    await prime(b, clock, quote(70500))
    r = req("a", qty=1, limit=70000)
    await b.place_order(r, ok(r, clock))
    evs = await drain(b)
    fills = [e.fill for e in evs if e.fill]
    assert len(fills) == 1
    assert fills[0].ts == T0 + timedelta(seconds=3)
    # 69900 × 1.005 = 70249.5 이지만 지정가를 넘지 않는다
    assert fills[0].price == Decimal(70000)


async def test_cancel_open_order() -> None:
    b, clock = make_broker([quote(70500, sec=1)])
    await prime(b, clock, quote(70500))
    r = req("a", qty=1, limit=60000)
    await b.place_order(r, ok(r, clock))
    st = await b.cancel_order("a")
    assert st.status is OrderStatus.CANCELED
    assert await b.list_open_orders() == []
    evs = await drain(b)
    assert [e.kind for e in evs] == [ExecKind.ACCEPTED, ExecKind.CANCELED]
    with pytest.raises(OrderNotFound):
        await b.cancel_order("nope")


async def test_rejects_insufficient_cash_and_position() -> None:
    b, clock = make_broker([], cash="100000")
    await prime(b, clock, quote(70000))
    r = req("a", qty=2)
    st = await b.place_order(r, ok(r, clock))
    assert st.status is OrderStatus.REJECTED and st.reject_reason == "주문 가능 현금 부족"
    s = req("s", Side.SELL, qty=1)
    st = await b.place_order(s, ok(s, clock))
    assert st.status is OrderStatus.REJECTED and st.reject_reason == "매도 가능 수량 부족"
    frac = OrderRequest("f", "005930", Side.BUY, OrderType.MARKET, Decimal("0.5"))
    st = await b.place_order(frac, ok(frac, clock))
    assert st.status is OrderStatus.REJECTED


async def test_buy_fills_only_affordable_qty_and_cancels_rest() -> None:
    # 접수 시점엔 충분했지만 체결 시점 가격이 뛰었다
    b, clock = make_broker([quote(100000, sec=1)], cash="300000")
    await prime(b, clock, quote(70000))
    r = req("a", qty=4)
    await b.place_order(r, ok(r, clock))
    evs = await drain(b)
    fill_ev = next(e for e in evs if e.fill)
    assert fill_ev.fill is not None and fill_ev.fill.qty == 2
    assert evs[-1].kind is ExecKind.CANCELED
    assert (await b.get_balance()).cash >= 0


async def test_day_order_expires_next_trading_day() -> None:
    next_day = quote(70000, sec=0, base=T0 + timedelta(days=1))
    b, clock = make_broker([next_day])
    await prime(b, clock, quote(70000))
    r = req("a", qty=1, limit=60000)
    await b.place_order(r, ok(r, clock))
    evs = await drain(b)
    assert evs[-1].kind is ExecKind.CANCELED
    assert evs[-1].order.reject_reason == "DAY 주문 만료"


async def test_quotes_for_other_symbols_ignored() -> None:
    b, _ = make_broker([quote(1, symbol="000660"), quote(70000, sec=1)])
    seen = [q.symbol async for q in b.subscribe_quotes(["005930"])]
    assert seen == ["005930"]


async def test_restore_skips_pending_new() -> None:
    from trader.domain import OrderState

    clock = SimClock(T0)
    b = PaperBroker(
        feed=ListFeed([]), clock=clock, fees=FEES, slippage_bps=Decimal(0), participation_rate=Decimal(1)
    )
    pending = OrderState("p", "005930", Side.BUY, OrderType.MARKET, Decimal(1), None, OrderStatus.PENDING_NEW)
    acked = OrderState("n", "005930", Side.BUY, OrderType.LIMIT, Decimal(1), Decimal(1), OrderStatus.NEW)
    b.restore(AccountBalance(Decimal(1000)), [pending, acked])
    assert [o.client_order_id for o in await b.list_open_orders()] == ["n"]
    with pytest.raises(OrderNotFound):
        await b.get_order("p")
