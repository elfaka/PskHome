"""가격 점수 · 이슈 점수 · 결합 규칙."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from tests.fakes import T0
from tests.test_performance_and_score import FLAT, bar, full_ctx, strong_ind
from trader.indicators import IndicatorSnapshot
from trader.scoring.issue import safe_latest
from trader.scoring.price import RulePriceScorer
from trader.scoring.types import ComponentScore, IssueAssessment, IssueStatus, ScorePart
from trader.strategy.base import MarketView, PortfolioView
from trader.strategy.intraday_score import IntradayScore

HOLDING = PortfolioView(Decimal(10), Decimal(0), Decimal(0))


class FixedIssue:
    source = "test-llm"
    model_version = "fake-1"

    def __init__(self, a: IssueAssessment) -> None:
        self.a = a

    def latest(self, symbol: str, now: datetime) -> IssueAssessment:
        return self.a


class BrokenIssue:
    source = "test-llm"
    model_version = "fake-1"

    def latest(self, symbol: str, now: datetime) -> IssueAssessment:
        raise TimeoutError("llm timeout")


class FakeMlPrice:
    """4단계 ML 공급부 자리 — 같은 0~30 점 척도."""

    source = "ml"
    model_version = "lgbm-2026-11-test"

    def __init__(self, points: int, fail: bool = False) -> None:
        self.points, self.fail = points, fail

    def score(self, symbol: str, indicators: IndicatorSnapshot | None, now: datetime) -> ComponentScore:
        if self.fail:
            raise RuntimeError("model file missing")
        return ComponentScore(
            "price",
            (ScorePart("ml", Decimal(self.points), Decimal(30), "모델 예측"),),
            self.source,
            self.model_version,
        )


def run(strategy: IntradayScore, view: PortfolioView = FLAT) -> object:
    return strategy.on_bar(
        bar(0, 70_000), view, MarketView(now=T0, indicators=strong_ind(), context=full_ctx(T0))
    )


def good_issue(points: int = 10, veto: bool = False) -> IssueAssessment:
    return IssueAssessment(
        IssueStatus.OK, Decimal(points), veto=veto, reasons=("반도체 수출 호조",), source="test-llm"
    )


def test_issue_points_add_to_total_and_are_recorded() -> None:
    d = run(IntradayScore(Decimal(1_000_000), issue=FixedIssue(good_issue(10))))
    assert d.score == Decimal(100) and d.action == "BUY"  # type: ignore[attr-defined]
    comp = d.inputs["components"]  # type: ignore[attr-defined]
    assert comp["issue"]["status"] == "OK" and comp["issue"]["source"] == "test-llm"
    assert comp["price"]["source"] == "rules" and comp["price"]["model_version"] == "rules-v1"


def test_veto_blocks_buy_and_exits_holding() -> None:
    bad = IssueAssessment(IssueStatus.OK, Decimal(0), veto=True, reasons=("횡령 공시",))
    s = IntradayScore(Decimal(1_000_000), issue=FixedIssue(bad))
    flat = run(s)
    assert flat.action == "WAIT" and "거부권" in flat.reason  # type: ignore[attr-defined]
    held = run(s, HOLDING)
    assert held.action == "EXIT" and held.qty == Decimal(10)  # type: ignore[attr-defined]


def test_ai_failure_or_stale_blocks_new_entries_only() -> None:
    for scorer in (BrokenIssue(), FixedIssue(IssueAssessment(IssueStatus.STALE))):
        s = IntradayScore(Decimal(1_000_000), issue=scorer)  # type: ignore[arg-type]
        d = run(s)
        assert d.action == "WAIT" and "매수 보류" in d.reason  # type: ignore[attr-defined]
        # 보유분은 실패 때문에 강제 청산하지 않는다
        assert run(s, HOLDING).action == "HOLD"  # type: ignore[attr-defined]


def test_safe_latest_rejects_malformed_assessment() -> None:
    weird = IssueAssessment(IssueStatus.OK, Decimal(50))  # 만점(10) 초과
    assert safe_latest(FixedIssue(weird), "005930", T0).status is IssueStatus.FAILED
    assert safe_latest(BrokenIssue(), "005930", T0).status is IssueStatus.FAILED


def test_price_scorer_is_swappable_and_failure_means_no_buy() -> None:
    ml = IntradayScore(Decimal(1_000_000), price=FakeMlPrice(30))
    d = run(ml)
    assert d.action == "BUY"  # type: ignore[attr-defined]
    assert d.inputs["components"]["price"]["model_version"] == "lgbm-2026-11-test"  # type: ignore[attr-defined]
    broken = IntradayScore(Decimal(1_000_000), price=FakeMlPrice(30, fail=True))
    d = run(broken)
    assert d.action == "WAIT" and "가격 점수 없음" in d.reason  # type: ignore[attr-defined]


def test_rule_price_scorer_without_indicators_is_unavailable() -> None:
    s = RulePriceScorer().score("005930", None, T0)
    assert not s.available and s.points == 0 and s.max_points == 30
