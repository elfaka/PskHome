"""CSV 재생 시세.

형식 (헤더 필수, bid/ask 는 비워도 된다)
    ts,symbol,price,volume,bid,ask
    2026-11-26T09:00:00+09:00,005930,70000,120,69900,70000

- ts 는 시간대(오프셋)가 반드시 있어야 한다. 없으면 KST 로 가정하지 않고 오류를 낸다.
- 숫자는 문자열 그대로 Decimal 로 읽는다 (float 을 거치지 않는다).
- 시각이 뒤로 가거나, 가격이 0 이하이거나, 거래량이 음수면 FeedDataError.
"""

from __future__ import annotations

import csv
from collections.abc import AsyncIterator
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from trader.clock import ensure_utc
from trader.domain import Quote
from trader.marketdata.base import FeedDataError

REQUIRED = ("ts", "symbol", "price", "volume")


def _dec(row: dict[str, str], key: str, line: int, *, optional: bool = False) -> Decimal | None:
    raw = (row.get(key) or "").strip()
    if not raw:
        if optional:
            return None
        raise FeedDataError(f"{line}행: {key} 가 비어 있다")
    try:
        d = Decimal(raw)
    except InvalidOperation as e:
        raise FeedDataError(f"{line}행: {key} 숫자 형식 오류 {raw!r}") from e
    if not d.is_finite():
        raise FeedDataError(f"{line}행: {key} 값 오류 {raw!r}")
    return d


def parse_row(row: dict[str, str], line: int) -> Quote:
    try:
        ts = ensure_utc(datetime.fromisoformat(row["ts"].strip()))
    except (KeyError, ValueError) as e:
        raise FeedDataError(f"{line}행: ts 는 시간대 포함 ISO-8601 이어야 한다 ({row.get('ts')!r})") from e
    symbol = (row.get("symbol") or "").strip()
    if not symbol:
        raise FeedDataError(f"{line}행: symbol 이 비어 있다")
    price = _dec(row, "price", line)
    volume = _dec(row, "volume", line)
    assert price is not None and volume is not None
    if price <= 0:
        raise FeedDataError(f"{line}행: 가격은 0보다 커야 한다")
    if volume < 0:
        raise FeedDataError(f"{line}행: 거래량은 음수일 수 없다")
    bid = _dec(row, "bid", line, optional=True)
    ask = _dec(row, "ask", line, optional=True)
    if bid is not None and ask is not None and bid > ask:
        raise FeedDataError(f"{line}행: 매수호가가 매도호가보다 높다")
    return Quote(symbol=symbol, ts=ts, price=price, volume=volume, bid=bid, ask=ask, source="csv")


class CsvReplayFeed:
    source = "csv"

    def __init__(self, path: Path) -> None:
        self._path = path

    def start_time(self) -> datetime | None:
        with self._path.open(newline="", encoding="utf-8") as f:
            for i, row in enumerate(csv.DictReader(f), start=2):
                return parse_row(row, i).ts
        return None

    async def stream(self) -> AsyncIterator[Quote]:
        last_ts: datetime | None = None
        with self._path.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
            if missing:
                raise FeedDataError(f"CSV 헤더에 {missing} 가 없다")
            for i, row in enumerate(reader, start=2):
                q = parse_row(row, i)
                if last_ts is not None and q.ts < last_ts:
                    raise FeedDataError(f"{i}행: 시각이 뒤로 갔다 ({q.ts} < {last_ts})")
                last_ts = q.ts
                yield q
