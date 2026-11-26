"""이슈 점수 — 뉴스·공시 해석. 지금은 공급부가 없고(NOT_CONFIGURED), 3단계에서 LLM 공급부가 들어온다.

LLM 공급부를 만들 때 (3단계)
- LLM 호출은 전략 안에서 하지 않는다. 별도 작업(5분 주기 + 이벤트)이 판단을 만들어 두고,
  전략은 `latest()` 로 마지막 판단만 읽는다 (봉마다 LLM 을 부르지 않는다)
- 응답은 정해진 JSON 스키마로만 받는다. 형식 오류·시간 초과·오류 → FAILED
- 판단이 max_age 보다 오래되면 STALE
- FAILED·STALE 이면 신규 매수를 막는다 (AI 실패 시 매매 안 함). 보유분 청산은 막지 않는다
- 처음에는 매수 신호보다 **악재 거부권(veto)** 용도로 쓴다
- 입력(기사·공시 원문 식별자), 응답, 모델 버전, 이후 결과를 모두 기록한다
- 기사 본문의 지시문은 데이터로만 다룬다 (프롬프트 인젝션). LLM 에 API 키·주문 함수를 주지 않는다
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Protocol

from trader.scoring.types import IssueAssessment, IssueStatus

log = logging.getLogger(__name__)


class IssueScorer(Protocol):
    source: str
    model_version: str

    def latest(self, symbol: str, now: datetime) -> IssueAssessment: ...


class NoIssueScorer:
    """이슈 점수 공급부 없음 (1·2단계)."""

    source = "none"
    model_version = "-"

    def latest(self, symbol: str, now: datetime) -> IssueAssessment:
        return IssueAssessment(IssueStatus.NOT_CONFIGURED, reasons=("뉴스·공시 해석 없음 (3단계)",))


def safe_latest(scorer: IssueScorer, symbol: str, now: datetime) -> IssueAssessment:
    """공급부 예외는 FAILED 로 바꾼다 — 실패가 전략을 멈추지도, 매수를 허용하지도 않게."""
    try:
        a = scorer.latest(symbol, now)
    except Exception as e:
        log.warning("issue scorer failed", extra={"fields": {"symbol": symbol, "err": str(e)[:200]}})
        return IssueAssessment(
            IssueStatus.FAILED,
            reasons=(f"이슈 점수 실패: {type(e).__name__}",),
            source=getattr(scorer, "source", "?"),
            model_version=getattr(scorer, "model_version", "?"),
        )
    if not isinstance(a, IssueAssessment) or a.points < 0 or a.points > a.max_points:
        return IssueAssessment(IssueStatus.FAILED, reasons=("이슈 점수 형식 오류",))
    return a
