"""시세 공급 인터페이스. CSV 재생·모의 생성·(이후) 증권사 실시간 시세가 이것을 구현한다."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime
from typing import Protocol

from trader.domain import Quote


class MarketDataFeed(Protocol):
    source: str

    def start_time(self) -> datetime | None:
        """재생 모드에서 첫 시세 시각 (가상 시계 시작점). 실시간 공급이면 None."""
        ...

    def stream(self) -> AsyncIterator[Quote]:
        """시각 순서대로 시세를 내보낸다. 공급이 끝나면 iterator 가 끝난다."""
        ...


class FeedDataError(Exception):
    """잘못된 시세 데이터 (형식 오류, 음수 가격, 시각 역행 등)."""
