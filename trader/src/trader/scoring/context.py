"""시장 맥락 점수 — 수급 25 · 시장(코스피) 20 · 글로벌(VIX) 15. 모두 지연·집계 데이터라 시각을 확인한다."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from trader.marketdata.context import MarketContext
from trader.scoring.types import ComponentScore, ScorePart

FLOW_MAX_AGE = timedelta(minutes=20)
INDEX_MAX_AGE = timedelta(minutes=15)
VIX_MAX_AGE = timedelta(days=4)  # 미국 장 기준 값이라 주말을 넘길 수 있다
VIX_POINTS = {"CALM": 15, "NORMAL": 10, "ELEVATED": 4, "FEAR": 0}


class RuleContextScorer:
    source = "rules"
    model_version = "rules-v1"

    def score(self, symbol: str, ctx: MarketContext, now: datetime) -> ComponentScore:
        return ComponentScore(
            "context",
            (self._flow(ctx, symbol, now), self._market(ctx, now), self._global(ctx, now)),
            self.source,
            self.model_version,
        )

    @staticmethod
    def _flow(ctx: MarketContext, symbol: str, now: datetime) -> ScorePart:
        sc = ctx.symbols.get(symbol)
        if sc is None or not sc.flows or now - sc.flows[-1].at > FLOW_MAX_AGE:
            return ScorePart("flow", Decimal(0), Decimal(25), "수급 데이터 없음·지연", available=False)
        last = sc.flows[-1]
        buyers = [n for n, v in (("외국인", last.foreigner), ("기관", last.institution)) if v > 0]
        pts = 15 if len(buyers) == 2 else 8 if len(buyers) == 1 else 0
        note = f"순매수: {', '.join(buyers) or '없음'}"
        if len(sc.flows) >= 2:
            prev = sc.flows[-2]
            if last.foreigner + last.institution > prev.foreigner + prev.institution:
                pts += 10
                note += ", 외국인+기관 순매수 증가"
        return ScorePart("flow", Decimal(pts), Decimal(25), note)

    @staticmethod
    def _market(ctx: MarketContext, now: datetime) -> ScorePart:
        if ctx.kospi_change_rate is None or ctx.kospi_ts is None or now - ctx.kospi_ts > INDEX_MAX_AGE:
            return ScorePart("market", Decimal(0), Decimal(20), "코스피 데이터 없음·지연", available=False)
        r = ctx.kospi_change_rate
        pts = 20 if r > Decimal("0.005") else 14 if r > 0 else 8 if r > Decimal("-0.005") else 0
        return ScorePart("market", Decimal(pts), Decimal(20), f"코스피 {r * 100:+.2f}%")

    @staticmethod
    def _global(ctx: MarketContext, now: datetime) -> ScorePart:
        if ctx.vix_level is None or ctx.vix_ts is None or now - ctx.vix_ts > VIX_MAX_AGE:
            return ScorePart("global", Decimal(0), Decimal(15), "VIX 데이터 없음·지연", available=False)
        pts = VIX_POINTS.get(ctx.vix_level, 0)
        return ScorePart("global", Decimal(pts), Decimal(15), f"VIX {ctx.vix_value} ({ctx.vix_level})")
