"""시각 처리.

- 엔진 내부의 모든 시각은 tz-aware UTC 다.
- 거래일·장 시간 판단은 Asia/Seoul 로 한다.
- DB(DATETIME(6))에는 tz 정보 없이 UTC 로 저장한다.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Protocol
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")


class Clock(Protocol):
    def now(self) -> datetime:
        """현재 시각 (tz-aware UTC)."""
        ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class SimClock:
    """재생(replay) 모드용 시계. 시세 이벤트 시각으로 앞으로만 움직인다."""

    def __init__(self, start: datetime) -> None:
        self._now = ensure_utc(start)

    def now(self) -> datetime:
        return self._now

    def advance_to(self, ts: datetime) -> None:
        ts = ensure_utc(ts)
        if ts > self._now:
            self._now = ts

    def advance(self, delta: timedelta) -> None:
        self._now = self._now + delta


def ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None or dt.utcoffset() is None:
        raise ValueError(f"tz 정보가 없는 시각은 받지 않는다: {dt!r}")
    return dt.astimezone(UTC)


def to_kst(dt: datetime) -> datetime:
    return ensure_utc(dt).astimezone(KST)


def kst_trade_date(dt: datetime) -> date:
    return to_kst(dt).date()


def to_db(dt: datetime) -> datetime:
    """DB 저장용: tz 를 뗀 UTC."""
    return ensure_utc(dt).replace(tzinfo=None)


def from_db(dt: datetime) -> datetime:
    """DB 에서 읽은 naive UTC 를 tz-aware UTC 로."""
    if dt.tzinfo is not None:
        return dt.astimezone(UTC)
    return dt.replace(tzinfo=UTC)
