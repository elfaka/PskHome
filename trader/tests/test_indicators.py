from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from tests.fakes import T0
from trader.domain import Bar
from trader.indicators import IndicatorBook


def bar(
    i: int, close: str | int, high: str | int | None = None, low: str | int | None = None, vol: int = 100
) -> Bar:
    c = Decimal(close)
    return Bar(
        "005930",
        60,
        T0 + timedelta(minutes=i),
        c,
        Decimal(high) if high is not None else c,
        Decimal(low) if low is not None else c,
        c,
        Decimal(vol),
    )


def test_rsi_all_gains_is_100_and_mixed_is_between() -> None:
    b = IndicatorBook()
    for i in range(15):
        s = b.add(bar(i, 100 + i))
    assert s.rsi14 == Decimal(100)
    b = IndicatorBook()
    for i in range(30):
        s = b.add(bar(i, 100 + (i % 2)))
    assert s.rsi14 is not None and Decimal(40) < s.rsi14 < Decimal(60)


def test_atr_from_true_range() -> None:
    b = IndicatorBook()
    for i in range(14):
        s = b.add(bar(i, 100, high=102, low=98))
    assert s.atr14 == Decimal(4)


def test_vwap_is_volume_weighted_and_resets_daily() -> None:
    b = IndicatorBook()
    b.add(bar(0, 100, vol=100))
    s = b.add(bar(1, 200, vol=300))
    assert s.vwap == Decimal(175)
    s = b.add(bar(60 * 24, 50, vol=10))  # 다음날
    assert s.vwap == Decimal(50)


def test_macd_and_sma_warmup() -> None:
    b = IndicatorBook()
    for i in range(34):  # EMA26 26봉 + 시그널 9봉 - 1
        s = b.add(bar(i, 100))
    assert s.macd == 0 and s.macd_signal == 0 and s.macd_hist == 0
    assert s.sma20 == Decimal(100)
    b = IndicatorBook()
    s = b.add(bar(0, 100))
    assert s.macd is None and s.sma20 is None and s.rsi14 is None


def test_volume_ratio() -> None:
    b = IndicatorBook()
    for i in range(20):
        b.add(bar(i, 100, vol=100))
    s = b.add(bar(20, 100, vol=300))
    assert s.volume_ratio == Decimal(3)


def test_no_float_anywhere() -> None:
    b = IndicatorBook()
    for i in range(40):
        s = b.add(bar(i, 100 + i % 3, high=105, low=95))
    for v in (s.rsi14, s.atr14, s.vwap, s.macd, s.sma20):
        assert isinstance(v, Decimal)
