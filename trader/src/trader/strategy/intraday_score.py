"""장중 종합 점수 전략 (100점). 1단계에서는 **그림자 모드** — 신호와 성과만 기록하고 주문하지 않는다.

| 항목 | 배점 | 데이터 | 1단계 |
|---|---|---|---|
| 기술 지표 | 30 | 1분봉 지표 (VWAP·SMA20·MACD·RSI·거래량) | 있음 |
| 수급 | 25 | 장중 외국인·기관 누적 순매수 (지연·집계) | stocksim 시세일 때 |
| 시장 | 20 | 코스피 등락률 | stocksim 시세일 때 |
| 글로벌 | 15 | 미국 변동성(VIX, 15분 지연) | stocksim 시세일 때 |
| 뉴스·공시 | 10 | LLM 해석 (3단계) | 없음 |

데이터가 없거나 오래된 항목은 0점이다 (있는 항목만으로 환산하지 않는다).

| 점수 | 보유 없음 | 보유 중 |
|---|---|---|
| 80 이상 + VWAP 위 + 거래량 1.5배 이상 | BUY | HOLD |
| 65~79 | WAIT (매수 관찰) | HOLD |
| 31~64 | WAIT | HOLD |
| 30 이하 | WAIT (매도 관찰) | EXIT |

점수 기준은 초기 실험값이다. 성과 기록(signal_performance)을 보고 조정한다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from trader.domain import Bar
from trader.indicators import IndicatorSnapshot
from trader.marketdata.context import MarketContext
from trader.money import ZERO, floor_shares
from trader.strategy.base import Action, Decision, MarketView, PortfolioView

FLOW_MAX_AGE = timedelta(minutes=20)
INDEX_MAX_AGE = timedelta(minutes=15)
VIX_MAX_AGE = timedelta(days=4)  # 미국 장 기준 값이라 주말을 넘길 수 있다
VIX_POINTS = {"CALM": 15, "NORMAL": 10, "ELEVATED": 4, "FEAR": 0}


@dataclass(frozen=True, slots=True)
class Part:
    points: int
    max_points: int
    note: str
    available: bool = True


def score_technical(ind: IndicatorSnapshot | None) -> Part:
    if ind is None or None in (ind.vwap, ind.sma20, ind.macd_hist, ind.rsi14, ind.volume_ratio):
        return Part(0, 30, "기술 지표 준비 중", available=False)
    assert ind.vwap is not None and ind.sma20 is not None and ind.macd_hist is not None
    assert ind.rsi14 is not None and ind.volume_ratio is not None
    pts, notes = 0, []
    if ind.close > ind.vwap:
        pts += 8
        notes.append("VWAP 위")
    if ind.close > ind.sma20:
        pts += 6
        notes.append("20봉 평균 위")
    if ind.macd_hist > 0:
        pts += 6
        notes.append("MACD 상승")
    if Decimal(50) <= ind.rsi14 <= Decimal(70):
        pts += 6
        notes.append(f"RSI {ind.rsi14:.0f} 강세 구간")
    elif Decimal(40) <= ind.rsi14 < Decimal(50):
        pts += 3
        notes.append(f"RSI {ind.rsi14:.0f} 중립")
    if ind.volume_ratio >= Decimal("1.5"):
        pts += 4
        notes.append(f"거래량 {ind.volume_ratio:.1f}배")
    return Part(pts, 30, ", ".join(notes) or "기술 지표 약세")


def score_flow(ctx: MarketContext, symbol: str, now: datetime) -> Part:
    sc = ctx.symbols.get(symbol)
    if sc is None or not sc.flows or now - sc.flows[-1].at > FLOW_MAX_AGE:
        return Part(0, 25, "수급 데이터 없음·지연", available=False)
    last = sc.flows[-1]
    pts = 0
    buyers = [n for n, v in (("외국인", last.foreigner), ("기관", last.institution)) if v > 0]
    if len(buyers) == 2:
        pts += 15
    elif len(buyers) == 1:
        pts += 8
    note = f"순매수: {', '.join(buyers) or '없음'}"
    if len(sc.flows) >= 2:
        prev = sc.flows[-2]
        if last.foreigner + last.institution > prev.foreigner + prev.institution:
            pts += 10
            note += ", 외국인+기관 순매수 증가"
    return Part(pts, 25, note)


def score_market(ctx: MarketContext, now: datetime) -> Part:
    if ctx.kospi_change_rate is None or ctx.kospi_ts is None or now - ctx.kospi_ts > INDEX_MAX_AGE:
        return Part(0, 20, "코스피 데이터 없음·지연", available=False)
    r = ctx.kospi_change_rate
    pts = 20 if r > Decimal("0.005") else 14 if r > 0 else 8 if r > Decimal("-0.005") else 0
    return Part(pts, 20, f"코스피 {r * 100:+.2f}%")


def score_global(ctx: MarketContext, now: datetime) -> Part:
    if ctx.vix_level is None or ctx.vix_ts is None or now - ctx.vix_ts > VIX_MAX_AGE:
        return Part(0, 15, "VIX 데이터 없음·지연", available=False)
    return Part(VIX_POINTS.get(ctx.vix_level, 0), 15, f"VIX {ctx.vix_value} ({ctx.vix_level})")


def score_news() -> Part:
    return Part(0, 10, "뉴스·공시 해석 없음 (3단계)", available=False)


class IntradayScore:
    def __init__(self, order_value: Decimal, strategy_id: str = "intraday_score") -> None:
        self.id = strategy_id
        self.order_value = order_value
        self.warmup_bars = 35  # MACD 시그널까지

    def reset(self, symbol: str) -> None:
        return None  # 지표 상태는 엔진의 IndicatorBook 이 갖는다

    def on_bar(self, bar: Bar, view: PortfolioView, market: MarketView | None = None) -> Decision:
        market = market or MarketView(now=bar.start_ts)
        ind = market.indicators
        parts = {
            "technical": score_technical(ind),
            "flow": score_flow(market.context, bar.symbol, market.now),
            "market": score_market(market.context, market.now),
            "global": score_global(market.context, market.now),
            "news": score_news(),
        }
        total = Decimal(sum(p.points for p in parts.values()))
        inputs = {
            "parts": {
                k: {"points": p.points, "max": p.max_points, "note": p.note, "available": p.available}
                for k, p in parts.items()
            },
            "indicators": None
            if ind is None
            else {
                "close": ind.close,
                "vwap": ind.vwap,
                "sma20": ind.sma20,
                "rsi14": ind.rsi14,
                "macd_hist": ind.macd_hist,
                "atr14": ind.atr14,
                "volume_ratio": ind.volume_ratio,
            },
            "position": view.position_qty,
        }
        reasons = tuple(f"{k}: {p.points}/{p.max_points} {p.note}" for k, p in parts.items())
        valid_until = bar.start_ts + timedelta(seconds=bar.interval_s * 6)
        confidence = (total / 100).quantize(Decimal("0.0001"))

        def make(
            action: Action, reason: str, qty: Decimal | None = None, invalidation: tuple[str, ...] = ()
        ) -> Decision:
            return Decision(
                action,
                reason,
                qty=qty,
                inputs=inputs,
                score=total,
                confidence=confidence,
                reasons=reasons,
                invalidation=invalidation,
                valid_until=valid_until,
            )

        holding = view.position_qty > 0
        if not parts["technical"].available:
            return make("HOLD" if holding else "WAIT", "지표 준비 중")

        assert ind is not None and ind.vwap is not None and ind.volume_ratio is not None
        if holding:
            sellable = view.position_qty - view.open_sell_qty
            if total <= 30 and sellable > 0:
                return make("EXIT", f"점수 {total} ≤ 30", qty=sellable, invalidation=("점수 45 이상 회복",))
            return make("HOLD", f"점수 {total}")

        if (
            total >= 80
            and ind.close > ind.vwap
            and ind.volume_ratio >= Decimal("1.5")
            and view.open_buy_qty == ZERO
        ):
            qty = floor_shares(self.order_value / bar.close)
            if qty >= 1:
                return make(
                    "BUY",
                    f"점수 {total} ≥ 80, VWAP 위, 거래량 {ind.volume_ratio:.1f}배",
                    qty=qty,
                    invalidation=("VWAP 하회", "외국인·기관 순매도 전환", "거래량 감소"),
                )
        label = "매수 관찰" if total >= 65 else "매도 관찰" if total <= 30 else "관망"
        return make("WAIT", f"점수 {total} {label}")
