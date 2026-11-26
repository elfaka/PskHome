"""가격 점수 — 차트 데이터만 본다. 지금은 규칙, 4단계에서 ML 모델(LightGBM 등)이 같은 자리에 들어온다.

ML 공급부를 만들 때
- `score()` 는 엔진이 이미 계산한 봉·지표만 받는다. 미래 봉을 볼 수 없다
- 같은 0~30 점 척도로 돌려주고, source="ml", model_version 에 학습 데이터 기간·버전을 적는다
- 모델 로드 실패·예측 실패는 available=False (0점) — 가격 점수가 없으면 결합 규칙이 매수하지 않는다
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Protocol

from trader.indicators import IndicatorSnapshot
from trader.scoring.types import ComponentScore, ScorePart

MAX_POINTS = Decimal(30)


class PriceScorer(Protocol):
    source: str
    model_version: str

    def score(self, symbol: str, indicators: IndicatorSnapshot | None, now: datetime) -> ComponentScore: ...


class RulePriceScorer:
    """VWAP·20봉 평균·MACD·RSI·거래량으로 30점."""

    source = "rules"
    model_version = "rules-v1"

    def score(self, symbol: str, indicators: IndicatorSnapshot | None, now: datetime) -> ComponentScore:
        return ComponentScore("price", (self._technical(indicators),), self.source, self.model_version)

    @staticmethod
    def _technical(ind: IndicatorSnapshot | None) -> ScorePart:
        if ind is None or None in (ind.vwap, ind.sma20, ind.macd_hist, ind.rsi14, ind.volume_ratio):
            return ScorePart("technical", Decimal(0), MAX_POINTS, "기술 지표 준비 중", available=False)
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
        return ScorePart("technical", Decimal(pts), MAX_POINTS, ", ".join(notes) or "기술 지표 약세")
