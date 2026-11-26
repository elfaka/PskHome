"""장중 종합 점수 전략 — 가격 점수 · 맥락 점수 · 이슈 점수를 결합 규칙으로 합친다 (1단계: 그림자 모드).

    차트 → 가격 점수(30, 지금 규칙 / 4단계 ML) ─┐
    수급·지수·VIX → 맥락 점수(60)               ├→ 결합 규칙 → (위험 관리 → 주문)
    뉴스·공시 → 이슈 점수(10, 3단계 LLM)       ─┘

각 공급부는 생성자에서 바꿔 끼운다. 결합 규칙은 trader/scoring/combine.py.
점수 기준은 초기 실험값이다. 성과 기록(signal_performance)을 보고 조정한다.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from trader.domain import Bar
from trader.money import ZERO, floor_shares
from trader.scoring.combine import CombinationRule, combine
from trader.scoring.context import RuleContextScorer
from trader.scoring.issue import IssueScorer, NoIssueScorer, safe_latest
from trader.scoring.price import PriceScorer, RulePriceScorer
from trader.strategy.base import Decision, MarketView, PortfolioView


class IntradayScore:
    def __init__(
        self,
        order_value: Decimal,
        strategy_id: str = "intraday_score",
        *,
        price: PriceScorer | None = None,
        issue: IssueScorer | None = None,
        rule: CombinationRule | None = None,
    ) -> None:
        self.id = strategy_id
        self.order_value = order_value
        self.warmup_bars = 35  # MACD 시그널까지
        self.price: PriceScorer = price or RulePriceScorer()
        self.context = RuleContextScorer()
        self.issue: IssueScorer = issue or NoIssueScorer()
        self.rule = rule or CombinationRule()

    def reset(self, symbol: str) -> None:
        return None  # 지표 상태는 엔진의 IndicatorBook 이 갖는다

    def on_bar(self, bar: Bar, view: PortfolioView, market: MarketView | None = None) -> Decision:
        market = market or MarketView(now=bar.start_ts)
        ind = market.indicators
        try:
            price = self.price.score(bar.symbol, ind, market.now)
        except Exception:
            # 가격 점수 공급부(ML 등) 실패 → 가격 점수 없음 → 결합 규칙이 매수하지 않는다
            price = RulePriceScorer().score(bar.symbol, None, market.now)
        context = self.context.score(bar.symbol, market.context, market.now)
        issue = safe_latest(self.issue, bar.symbol, market.now)

        holding = view.position_qty > 0
        result = combine(
            self.rule,
            price=price,
            context=context,
            issue=issue,
            indicators=ind,
            holding=holding,
            can_add=view.open_buy_qty == ZERO,
            now=market.now,
        )

        parts = {p.name: p for p in (*price.parts, *context.parts)}
        inputs = {
            "parts": {
                **{
                    k: {"points": p.points, "max": p.max_points, "note": p.note, "available": p.available}
                    for k, p in parts.items()
                },
                "news": {
                    "points": issue.points,
                    "max": issue.max_points,
                    "note": "; ".join(issue.reasons),
                    "available": issue.status.value == "OK",
                },
            },
            "components": {
                "price": price.to_record(),
                "context": context.to_record(),
                "issue": issue.to_record(),
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
        reasons = (
            *(f"{p.name}: {p.points}/{p.max_points} {p.note}" for p in parts.values()),
            f"news: {issue.points}/{issue.max_points} {'; '.join(issue.reasons) or issue.status.value}",
        )

        qty: Decimal | None = None
        if result.verdict == "BUY":
            qty = floor_shares(self.order_value / bar.close)
            if qty < 1:
                result = type(result)("WAIT", result.total, "주문 금액이 1주보다 작다")
                qty = None
        elif result.verdict == "EXIT":
            sellable = view.position_qty - view.open_sell_qty
            qty = sellable if sellable > 0 else None
            if qty is None:
                result = type(result)("HOLD", result.total, "청산 대상이지만 이미 매도 주문 중")

        return Decision(
            result.verdict,
            result.reason,
            qty=qty,
            inputs=inputs,
            score=result.total,
            confidence=(result.total / 100).quantize(Decimal("0.0001")),
            reasons=reasons,
            invalidation=result.invalidation,
            valid_until=bar.start_ts + timedelta(seconds=bar.interval_s * 6),
        )
