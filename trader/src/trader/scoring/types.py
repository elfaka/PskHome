from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

from trader.money import ZERO


@dataclass(frozen=True, slots=True)
class ScorePart:
    name: str
    points: Decimal
    max_points: Decimal
    note: str
    available: bool = True


@dataclass(frozen=True, slots=True)
class ComponentScore:
    """가격 점수·맥락 점수 같은 묶음."""

    kind: str  # price / context
    parts: tuple[ScorePart, ...]
    source: str  # rules / ml / ...
    model_version: str

    @property
    def points(self) -> Decimal:
        return sum((p.points for p in self.parts), ZERO)

    @property
    def max_points(self) -> Decimal:
        return sum((p.max_points for p in self.parts), ZERO)

    @property
    def available(self) -> bool:
        return any(p.available for p in self.parts)

    def to_record(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "source": self.source,
            "model_version": self.model_version,
            "points": self.points,
            "max": self.max_points,
        }


class IssueStatus(StrEnum):
    NOT_CONFIGURED = "NOT_CONFIGURED"  # 이슈 점수 공급부가 없다 (지금) → 0점, 매매는 막지 않는다
    OK = "OK"
    STALE = "STALE"  # 공급부는 있는데 최근 판단이 없다 → 신규 매수 금지
    FAILED = "FAILED"  # 오류·시간 초과·형식 오류 → 신규 매수 금지


@dataclass(frozen=True, slots=True)
class IssueAssessment:
    status: IssueStatus
    points: Decimal = ZERO
    max_points: Decimal = Decimal(10)
    # 악재 거부권: 매수 금지 + 보유분 청산
    veto: bool = False
    reasons: tuple[str, ...] = ()
    source: str = "none"
    model_version: str = "-"
    as_of: datetime | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def blocks_entry(self) -> bool:
        return self.veto or self.status in (IssueStatus.FAILED, IssueStatus.STALE)

    def to_record(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "points": self.points,
            "max": self.max_points,
            "veto": self.veto,
            "reasons": list(self.reasons),
            "source": self.source,
            "model_version": self.model_version,
            "as_of": self.as_of,
        }
