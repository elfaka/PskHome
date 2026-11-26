from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from decimal import Decimal

from tests.fakes import T0
from trader.domain import Bar
from trader.indicators import IndicatorSnapshot
from trader.marketdata.context import FlowPoint, MarketContext, SymbolContext
from trader.performance import evaluate, horizons_for
from trader.strategy.base import MarketView, PortfolioView
from trader.strategy.intraday_score import IntradayScore

FLAT = PortfolioView(Decimal(0), Decimal(0), Decimal(0))


def bar(i: int, close: int, high: int | None = None, low: int | None = None) -> Bar:
    c = Decimal(close)
    return Bar(
        "005930",
        60,
        T0 + timedelta(minutes=i),
        c,
        Decimal(high or close),
        Decimal(low or close),
        c,
        Decimal(10),
    )


# ── 성과 ─────────────────────────────────────────────────────────────────


def test_horizons_include_session_close_only_before_it() -> None:
    hs = dict(horizons_for(T0, time(15, 30)))  # T0 = KST 09:30
    assert hs["5m"] == T0 + timedelta(minutes=5)
    assert hs["close"] == datetime(2026, 11, 26, 6, 30, tzinfo=UTC)
    late = datetime(2026, 11, 26, 6, 40, tzinfo=UTC)  # KST 15:40
    assert "close" not in dict(horizons_for(late, time(15, 30)))


def test_evaluate_buy_and_sell_directions() -> None:
    bars = [bar(0, 101, high=105, low=99), bar(1, 102, high=103, low=97)]
    buy = evaluate(Decimal(100), 1, bars)
    assert buy["status"] == "DONE"
    assert buy["return_pct"] == Decimal("0.02")
    assert buy["mfe_pct"] == Decimal("0.05") and buy["mae_pct"] == Decimal("-0.03")
    sell = evaluate(Decimal(100), -1, bars)
    assert sell["return_pct"] == Decimal("-0.02")  # 판 뒤에 올랐다 → 손해
    assert sell["mfe_pct"] == Decimal("0.03") and sell["mae_pct"] == Decimal("-0.05")
    assert evaluate(Decimal(100), 1, [])["status"] == "NO_DATA"


# ── 점수 전략 ─────────────────────────────────────────────────────────────


def strong_ind(close: int = 70_000) -> IndicatorSnapshot:
    c = Decimal(close)
    return IndicatorSnapshot(
        close=c,
        bars=40,
        sma20=c - 500,
        rsi14=Decimal(60),
        macd=Decimal(5),
        macd_signal=Decimal(2),
        macd_hist=Decimal(3),
        atr14=Decimal(100),
        vwap=c - 300,
        volume_ratio=Decimal(2),
    )


def full_ctx(now: datetime) -> MarketContext:
    return MarketContext(
        kospi_change_rate=Decimal("0.008"),
        kospi_ts=now - timedelta(minutes=1),
        vix_value=Decimal(13),
        vix_level="CALM",
        vix_ts=now - timedelta(hours=10),
        symbols={
            "005930": SymbolContext(
                flows=(
                    FlowPoint(now - timedelta(minutes=10), Decimal(100), Decimal(50)),
                    FlowPoint(now - timedelta(minutes=5), Decimal(300), Decimal(80)),
                )
            )
        },
    )


def test_score_buy_when_all_available_parts_are_strong() -> None:
    s = IntradayScore(Decimal(1_000_000))
    b = bar(0, 70_000)
    d = s.on_bar(b, FLAT, MarketView(now=T0, indicators=strong_ind(), context=full_ctx(T0)))
    # 기술 30 + 수급 25 + 시장 20 + 글로벌 15 + 뉴스 0 = 90
    assert d.score == Decimal(90)
    assert d.action == "BUY" and d.qty == Decimal(14)
    assert d.confidence == Decimal("0.9")
    assert any(r.startswith("news: 0/10") for r in d.reasons)
    assert d.invalidation and d.valid_until == T0 + timedelta(minutes=6)


def test_missing_parts_score_zero_so_no_buy() -> None:
    """데이터가 없는 항목은 0점 — 기술 지표만으로는 80점에 닿지 않는다."""
    s = IntradayScore(Decimal(1_000_000))
    d = s.on_bar(bar(0, 70_000), FLAT, MarketView(now=T0, indicators=strong_ind()))
    assert d.score == Decimal(30) and d.action == "WAIT"
    assert d.inputs["parts"]["flow"]["available"] is False


def test_stale_context_is_unavailable() -> None:
    s = IntradayScore(Decimal(1_000_000))
    old = full_ctx(T0 - timedelta(hours=1))
    d = s.on_bar(bar(0, 70_000), FLAT, MarketView(now=T0, indicators=strong_ind(), context=old))
    assert d.inputs["parts"]["flow"]["available"] is False
    assert d.inputs["parts"]["market"]["available"] is False


def test_exit_when_holding_and_score_collapses() -> None:
    s = IntradayScore(Decimal(1_000_000))
    weak = IndicatorSnapshot(
        close=Decimal(70_000),
        bars=40,
        sma20=Decimal(71_000),
        rsi14=Decimal(30),
        macd=Decimal(-5),
        macd_signal=Decimal(-1),
        macd_hist=Decimal(-4),
        atr14=Decimal(100),
        vwap=Decimal(71_000),
        volume_ratio=Decimal(1),
    )
    holding = PortfolioView(Decimal(10), Decimal(0), Decimal(0))
    d = s.on_bar(bar(0, 70_000), holding, MarketView(now=T0, indicators=weak))
    assert d.action == "EXIT" and d.qty == Decimal(10)
    assert s.on_bar(bar(0, 70_000), FLAT, MarketView(now=T0, indicators=weak)).action == "WAIT"
