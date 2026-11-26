from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from tests.fakes import T0
from trader.domain import Bar
from trader.strategy.base import PortfolioView
from trader.strategy.ma_cross import MovingAverageCross

FLAT = PortfolioView(Decimal(0), Decimal(0), Decimal(0))


def bar(i: int, close: int) -> Bar:
    c = Decimal(close)
    return Bar("005930", 60, T0 + timedelta(minutes=i), c, c, c, c, Decimal(100))


def run(strategy: MovingAverageCross, closes: list[int], view: PortfolioView = FLAT) -> list[str]:
    return [strategy.on_bar(bar(i, c), view).action for i, c in enumerate(closes)]


def test_golden_cross_buys_with_order_value() -> None:
    s = MovingAverageCross(2, 4, Decimal(1_000_000))
    actions = run(s, [100, 100, 100, 100, 90, 90, 120])
    assert actions == ["HOLD", "HOLD", "HOLD", "HOLD", "HOLD", "HOLD", "BUY"]
    d = s.on_bar(bar(7, 130), FLAT)
    assert d.action == "HOLD"  # 교차는 한 번만


def test_buy_qty_is_floor_of_value() -> None:
    s = MovingAverageCross(2, 4, Decimal(1_000_000))
    for i, c in enumerate([100, 100, 100, 100, 90, 90]):
        s.on_bar(bar(i, c * 1000), FLAT)
    d = s.on_bar(bar(6, 120_000), FLAT)
    assert d.action == "BUY" and d.qty == Decimal(8)  # 1,000,000 / 120,000 = 8.33
    assert d.inputs["fast_ma"] == Decimal(105_000)


def test_dead_cross_sells_sellable_qty() -> None:
    s = MovingAverageCross(2, 4, Decimal(1_000_000))
    holding = PortfolioView(Decimal(10), Decimal(0), Decimal(3))
    actions = run(s, [100, 100, 100, 100, 110, 110, 80], holding)
    assert actions[-1] == "SELL"
    s2 = MovingAverageCross(2, 4, Decimal(1_000_000))
    for i, c in enumerate([100, 100, 100, 100, 110, 110]):
        s2.on_bar(bar(i, c), holding)
    assert s2.on_bar(bar(6, 80), holding).qty == Decimal(7)


def test_no_buy_when_already_holding_or_pending() -> None:
    s = MovingAverageCross(2, 4, Decimal(1_000_000))
    pending = PortfolioView(Decimal(0), Decimal(5), Decimal(0))
    assert run(s, [100, 100, 100, 100, 90, 90, 120], pending)[-1] == "HOLD"


def test_reset_requires_new_warmup() -> None:
    s = MovingAverageCross(2, 4, Decimal(1_000_000))
    run(s, [100, 100, 100, 100, 100])
    s.reset("005930")
    assert s.on_bar(bar(10, 100), FLAT).reason.startswith("warming up 1/")
