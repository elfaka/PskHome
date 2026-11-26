from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal

import pytest

from tests.fakes import T0, quote
from trader.domain import AccountBalance, OrderRequest, OrderState, OrderStatus, OrderType, Position, Side
from trader.risk.approval import verify
from trader.risk.health import TradingHealth
from trader.risk.manager import RiskContext, RiskLimits, RiskManager

LIMITS = RiskLimits(
    max_order_value=Decimal(1_000_000),
    max_position_value=Decimal(1_500_000),
    daily_loss_limit=Decimal(100_000),
    max_quote_age=timedelta(seconds=5),
    approval_ttl=timedelta(seconds=5),
    slippage_bps=Decimal(0),
    commission_rate_buy=Decimal("0.0001"),
    enforce_market_hours=True,
    market_open=time(9, 0),
    market_close=time(15, 20),
)
RM = RiskManager(LIMITS)


def ctx(**kw: object) -> RiskContext:
    base: dict[str, object] = {
        "now": T0,
        "halted": False,
        "health": TradingHealth(),
        "balance": AccountBalance(Decimal(10_000_000)),
        "open_orders": [],
        "quotes": {"005930": quote(10_000)},
        "day_start_equity": Decimal(10_000_000),
        "atr": {"005930": Decimal(100)},
    }
    base.update(kw)
    return RiskContext(**base)  # type: ignore[arg-type]


def buy(qty: int = 10, coid: str = "c1") -> OrderRequest:
    return OrderRequest(coid, "005930", Side.BUY, OrderType.MARKET, Decimal(qty))


def sell(qty: int = 10) -> OrderRequest:
    return OrderRequest("s1", "005930", Side.SELL, OrderType.MARKET, Decimal(qty))


def test_approves_normal_order_and_approval_is_bound_to_request() -> None:
    d = RM.evaluate(buy(), ctx())
    assert d.approved and d.approval is not None
    verify(buy(), d.approval, T0)
    with pytest.raises(Exception, match="내용이 다르다"):
        verify(buy(qty=11), d.approval, T0)


@pytest.mark.parametrize(
    "kw, code",
    [
        ({"halted": True}, "HALTED"),
        ({"health": TradingHealth(engine_error="feed failed")}, "ENGINE_ERROR"),
        ({"health": TradingHealth(db_ok=False)}, "DB_UNHEALTHY"),
        ({"health": TradingHealth(data_issues={"005930": "gap"})}, "DATA_UNHEALTHY"),
        ({"quotes": {}}, "NO_QUOTE"),
        ({"now": T0 + timedelta(seconds=6)}, "STALE_QUOTE"),
        ({"now": T0 - timedelta(seconds=6)}, "STALE_QUOTE"),
        ({"day_start_equity": None}, "NO_DAY_BASELINE"),
    ],
)
def test_blocking_conditions(kw: dict[str, object], code: str) -> None:
    d = RM.evaluate(buy(), ctx(**kw))
    assert not d.approved and d.code == code and d.approval is None


def test_market_hours_kst() -> None:
    after_close = datetime(2026, 11, 26, 6, 21, tzinfo=UTC)  # KST 15:21
    q = {"005930": quote(10_000, base=after_close)}
    assert RM.evaluate(buy(), ctx(now=after_close, quotes=q)).code == "MARKET_CLOSED"
    saturday = datetime(2026, 11, 28, 1, 0, tzinfo=UTC)
    q = {"005930": quote(10_000, base=saturday)}
    assert RM.evaluate(buy(), ctx(now=saturday, quotes=q)).code == "MARKET_CLOSED"


def test_max_order_value() -> None:
    assert RM.evaluate(buy(100), ctx()).approved  # 1,000,000 = 한도
    assert RM.evaluate(buy(101), ctx()).code == "MAX_ORDER_VALUE"


def test_max_order_value_uses_slippage_and_ask() -> None:
    rm = RiskManager(replace(LIMITS, slippage_bps=Decimal(100)))
    q = {"005930": quote(10_000, ask=10_000)}
    assert rm.evaluate(buy(100), ctx(quotes=q)).code == "MAX_ORDER_VALUE"  # 100 × 10,100


def test_position_limit_counts_holdings_and_open_buys() -> None:
    bal = AccountBalance(Decimal(10_000_000), {"005930": Position("005930", Decimal(80), Decimal(10_000))})
    assert RM.evaluate(buy(70), ctx(balance=bal)).approved  # (80+70) × 10,000 = 1.5M
    assert RM.evaluate(buy(71), ctx(balance=bal)).code == "MAX_POSITION_VALUE"
    pending = OrderState("o", "005930", Side.BUY, OrderType.MARKET, Decimal(10), None, OrderStatus.NEW)
    assert RM.evaluate(buy(70), ctx(balance=bal, open_orders=[pending])).code == "MAX_POSITION_VALUE"


def test_cash_check_reserves_open_buys() -> None:
    bal = AccountBalance(Decimal(1_000_000))
    start = Decimal(1_000_000)
    assert RM.evaluate(buy(99), ctx(balance=bal, day_start_equity=start)).approved
    pending = OrderState(
        "o", "000660", Side.BUY, OrderType.LIMIT, Decimal(1), Decimal(500_000), OrderStatus.NEW
    )
    assert (
        RM.evaluate(buy(99), ctx(balance=bal, open_orders=[pending], day_start_equity=start)).code
        == "INSUFFICIENT_CASH"
    )


def test_no_short_selling() -> None:
    bal = AccountBalance(Decimal(0), {"005930": Position("005930", Decimal(10), Decimal(10_000))})
    ctx_ = ctx(balance=bal, day_start_equity=Decimal(100_000))
    assert RM.evaluate(sell(10), ctx_).approved
    assert RM.evaluate(sell(11), ctx_).code == "INSUFFICIENT_POSITION"
    pending = OrderState("o", "005930", Side.SELL, OrderType.MARKET, Decimal(5), None, OrderStatus.NEW)
    assert RM.evaluate(sell(6), replace(ctx_, open_orders=[pending])).code == "INSUFFICIENT_POSITION"


def test_daily_loss_limit_includes_unrealized() -> None:
    bal = AccountBalance(Decimal(9_000_000), {"005930": Position("005930", Decimal(100), Decimal(10_000))})
    # 평가 = 9,000,000 + 100 × 9,000 = 9,900,000 → 손실 100,000 = 한도
    q = {"005930": quote(9_000)}
    assert RM.evaluate(buy(1), ctx(balance=bal, quotes=q)).code == "DAILY_LOSS_LIMIT"
    q = {"005930": quote(9_001)}
    assert RM.evaluate(buy(1), ctx(balance=bal, quotes=q)).approved


def test_reducing_sell_passes_loss_limit_cutoff_and_order_size() -> None:
    """보유분을 줄이는 매도는 손실 한도·진입 마감·1회 금액으로 막지 않는다 (청산을 막으면 더 위험하다)."""
    rm = RiskManager(replace(LIMITS, entry_cutoff=time(9, 0)))
    bal = AccountBalance(Decimal(0), {"005930": Position("005930", Decimal(500), Decimal(20_000))})
    d = rm.evaluate(
        sell(500), ctx(balance=bal, day_start_equity=Decimal(100_000_000))
    )  # 손실 큼, 5,000,000 원어치
    assert d.approved and d.reason == "reducing"
    # 데이터 이상이어도 청산은 된다. 단 킬스위치·DB 오류·오래된 시세는 막는다
    assert rm.evaluate(
        sell(1), ctx(balance=bal, health=TradingHealth(data_issues={"005930": "gap"}))
    ).approved
    assert rm.evaluate(sell(1), ctx(balance=bal, halted=True)).code == "HALTED"
    assert rm.evaluate(sell(1), ctx(balance=bal, health=TradingHealth(db_ok=False))).code == "DB_UNHEALTHY"
    assert rm.evaluate(sell(1), ctx(balance=bal, now=T0 + timedelta(seconds=9))).code == "STALE_QUOTE"


def test_entry_cutoff_blocks_new_buys() -> None:
    rm = RiskManager(replace(LIMITS, entry_cutoff=time(9, 30)))  # T0 = KST 09:30
    assert rm.evaluate(buy(), ctx()).code == "ENTRY_CUTOFF"
    rm = RiskManager(replace(LIMITS, entry_cutoff=time(9, 31)))
    assert rm.evaluate(buy(), ctx()).approved


def test_atr_levels_and_risk_reward() -> None:
    d = RM.evaluate(buy(), ctx())
    assert d.approved
    assert d.levels["entry_price"] == Decimal(10_000)
    assert d.levels["stop_loss"] == Decimal(9_850)  # 10,000 - 1.5 × 100
    assert d.levels["take_profit"] == Decimal(10_300)  # 10,000 + 3 × 100
    assert Decimal("1.9") < d.levels["risk_reward"] < Decimal(2)
    # 비용이 크면 손익비가 기준 아래로 → 거부하되 계산값은 남긴다
    costly = RiskManager(
        replace(LIMITS, commission_rate_sell=Decimal("0.003"), sell_tax_rate=Decimal("0.002"))
    )
    d = costly.evaluate(buy(), ctx())
    assert d.code == "LOW_RISK_REWARD" and "stop_loss" in d.levels
    assert RM.evaluate(buy(), ctx(atr={})).code == "NO_STOP"
    assert RiskManager(replace(LIMITS, require_atr_stop=False)).evaluate(buy(), ctx(atr={})).approved


def test_spread_and_price_limits() -> None:
    wide = {"005930": quote(10_000, bid=9_900, ask=10_100)}  # 200bp
    assert RM.evaluate(buy(), ctx(quotes=wide)).code == "WIDE_SPREAD"
    near = ctx(provides_price_limits=True, upper_limits={"005930": Decimal(10_100)})
    assert RM.evaluate(buy(), near).code == "NEAR_UPPER_LIMIT"
    assert RM.evaluate(buy(), ctx(provides_price_limits=True)).code == "NO_PRICE_LIMIT"
    ok = ctx(provides_price_limits=True, upper_limits={"005930": Decimal(13_000)})
    assert RM.evaluate(buy(), ok).approved


def test_fractional_qty_rejected() -> None:
    r = OrderRequest("f", "005930", Side.BUY, OrderType.MARKET, Decimal("1.5"))
    assert RM.evaluate(r, ctx()).code == "INVALID_QTY"


def test_stop_and_take_are_rounded_conservatively_to_ticks() -> None:
    d = RM.evaluate(buy(), ctx(atr={"005930": Decimal("33.3333")}))
    # 10,000 - 1.5 × 33.3333 = 9,950.00005 → 올림 9,951 / 10,000 + 3 × 33.3333 = 10,099.9999 → 내림 10,099
    assert d.levels["stop_loss"] == Decimal(9951)
    assert d.levels["take_profit"] == Decimal(10099)
