"""위험 관리 승인 증표.

Broker.place_order 는 RiskApproval 없이 호출할 수 없고, RiskApproval 은 이 모듈의
`_issue()` 로만 만들어진다 (RiskManager 만 호출한다). 승인에는 주문 내용 해시와
발급 시각이 담겨, 브로커는 `verify()` 로 "이 주문 그대로, 방금" 승인됐는지 확인한다.

파이썬에서 완전한 접근 차단은 불가능하므로, 이것은 실수로 우회 경로가 생기는 것을 막는
구조적 장치다. 추가로 tests/test_no_bypass.py 가 호출 위치를 정적으로 검사한다.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from trader.domain import OrderRequest

_ISSUER_KEY = secrets.token_bytes(16)


class ApprovalError(Exception):
    pass


@dataclass(frozen=True, slots=True)
class RiskApproval:
    fingerprint: str
    client_order_id: str
    issued_at: datetime
    ttl: timedelta
    _key: bytes = field(repr=False, compare=False)

    def __post_init__(self) -> None:
        if self._key is not _ISSUER_KEY:
            raise ApprovalError("RiskApproval 은 RiskManager 만 발급할 수 있다")


def _issue(req: OrderRequest, now: datetime, ttl: timedelta) -> RiskApproval:
    return RiskApproval(
        fingerprint=req.fingerprint(),
        client_order_id=req.client_order_id,
        issued_at=now,
        ttl=ttl,
        _key=_ISSUER_KEY,
    )


def verify(req: OrderRequest, approval: object, now: datetime) -> None:
    """브로커 구현체가 주문을 받기 전에 반드시 호출한다."""
    if not isinstance(approval, RiskApproval) or approval._key is not _ISSUER_KEY:
        raise ApprovalError("위험 관리 승인 없는 주문")
    if approval.client_order_id != req.client_order_id or approval.fingerprint != req.fingerprint():
        raise ApprovalError("승인된 주문과 내용이 다르다")
    if now - approval.issued_at > approval.ttl or now < approval.issued_at - timedelta(seconds=1):
        raise ApprovalError("승인 유효 시간이 지났다")
