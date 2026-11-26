"""결합 규칙 — 가격·맥락·이슈 점수를 합쳐 신호를 정한다. 규칙 코드이며 AI 가 아니다.

| 조건 | 보유 없음 | 보유 중 |
|---|---|---|
| 이슈 거부권(악재) | WAIT | EXIT |
| 합계 ≥ buy_threshold + 가격 점수 있음 + VWAP 위 + 거래량 비율 ≥ min_volume_ratio + 이슈가 매수를 막지 않음 | BUY | HOLD |
| 합계 ≥ watch_threshold | WAIT (매수 관찰) | HOLD |
| 합계 ≤ exit_threshold | WAIT (매도 관찰) | EXIT |
| 그 외 | WAIT | HOLD |

데이터가 없는 항목은 0점이다 (있는 항목만으로 환산하지 않는다).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Literal

from trader.indicators import IndicatorSnapshot
from trader.scoring.types import ComponentScore, IssueAssessment, IssueStatus

Verdict = Literal["BUY", "WAIT", "HOLD", "EXIT"]


@dataclass(frozen=True, slots=True)
class CombinationRule:
    buy_threshold: Decimal = Decimal(80)
    watch_threshold: Decimal = Decimal(65)
    exit_threshold: Decimal = Decimal(30)
    min_volume_ratio: Decimal = Decimal("1.5")


@dataclass(frozen=True, slots=True)
class Combined:
    verdict: Verdict
    total: Decimal
    reason: str
    invalidation: tuple[str, ...] = ()


def combine(
    rule: CombinationRule,
    *,
    price: ComponentScore,
    context: ComponentScore,
    issue: IssueAssessment,
    indicators: IndicatorSnapshot | None,
    holding: bool,
    can_add: bool,
    now: datetime,
) -> Combined:
    total = price.points + context.points + issue.points

    if issue.veto:
        why = f"이슈 거부권: {', '.join(issue.reasons) or '악재'}"
        return Combined("EXIT" if holding else "WAIT", total, why)

    if holding:
        if total <= rule.exit_threshold:
            return Combined("EXIT", total, f"합계 {total} ≤ {rule.exit_threshold}", ("합계 45 이상 회복",))
        return Combined("HOLD", total, f"합계 {total}")

    if not price.available or indicators is None:
        return Combined("WAIT", total, "가격 점수 없음 (지표 준비 중 또는 모델 실패)")

    if total >= rule.buy_threshold and can_add:
        blockers = []
        if indicators.vwap is None or indicators.close <= indicators.vwap:
            blockers.append("VWAP 아래")
        if indicators.volume_ratio is None or indicators.volume_ratio < rule.min_volume_ratio:
            blockers.append("거래량 부족")
        if issue.blocks_entry:
            blockers.append(f"이슈 점수 {issue.status.value}")
        if not blockers:
            return Combined(
                "BUY",
                total,
                f"합계 {total} ≥ {rule.buy_threshold}, VWAP 위, 거래량 {indicators.volume_ratio:.1f}배",
                ("VWAP 하회", "외국인·기관 순매도 전환", "거래량 감소", "악재 공시"),
            )
        return Combined("WAIT", total, f"합계 {total} 이지만 매수 보류: {', '.join(blockers)}")

    if issue.status in (IssueStatus.FAILED, IssueStatus.STALE):
        return Combined("WAIT", total, f"합계 {total}, 이슈 점수 {issue.status.value}")
    label = (
        "매수 관찰"
        if total >= rule.watch_threshold
        else "매도 관찰"
        if total <= rule.exit_threshold
        else "관망"
    )
    return Combined("WAIT", total, f"합계 {total} {label}")
