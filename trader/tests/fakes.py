"""테스트 더블."""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterable
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from trader.domain import Quote

T0 = datetime(2026, 11, 26, 0, 30, tzinfo=UTC)  # KST 09:30


class ListFeed:
    """미리 정한 시세를 순서대로 내보낸다."""

    source = "test"

    def __init__(self, quotes: Iterable[Quote]) -> None:
        self._quotes = list(quotes)

    def start_time(self) -> datetime | None:
        return self._quotes[0].ts if self._quotes else None

    async def stream(self) -> AsyncIterator[Quote]:
        for q in self._quotes:
            yield q


def quote(
    price: str | int,
    *,
    sec: int = 0,
    volume: str | int = 1000,
    symbol: str = "005930",
    bid: str | int | None = None,
    ask: str | int | None = None,
    base: datetime = T0,
) -> Quote:
    return Quote(
        symbol=symbol,
        ts=base + timedelta(seconds=sec),
        price=Decimal(price),
        volume=Decimal(volume),
        bid=None if bid is None else Decimal(bid),
        ask=None if ask is None else Decimal(ask),
        source="test",
    )
