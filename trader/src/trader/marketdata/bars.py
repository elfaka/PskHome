"""틱 → 봉 집계와 데이터 누락 감지."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from trader.clock import kst_trade_date
from trader.domain import Bar, Quote


def bucket_start(ts: datetime, interval_s: int) -> datetime:
    epoch = int(ts.timestamp())
    return datetime.fromtimestamp(epoch - epoch % interval_s, UTC)


@dataclass(slots=True)
class _Building:
    start: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal


@dataclass(frozen=True, slots=True)
class BarUpdate:
    bar: Bar
    # 직전 완성 봉과의 사이에 빈 봉이 몇 개였나 (같은 거래일 기준)
    missing_before: int


class BarAggregator:
    """종목별로 interval_s 봉을 만든다. 다음 구간의 틱이 오면 이전 봉이 완성된다."""

    def __init__(self, interval_s: int) -> None:
        self.interval_s = interval_s
        self._building: dict[str, _Building] = {}
        self._last_done: dict[str, datetime] = {}

    def add(self, q: Quote) -> BarUpdate | None:
        start = bucket_start(q.ts, self.interval_s)
        cur = self._building.get(q.symbol)
        done: BarUpdate | None = None
        if cur is not None and start > cur.start:
            done = self._close(q.symbol, cur)
            cur = None
        if cur is None:
            self._building[q.symbol] = _Building(start, q.price, q.price, q.price, q.price, q.volume)
        elif start == cur.start:
            cur.high = max(cur.high, q.price)
            cur.low = min(cur.low, q.price)
            cur.close = q.price
            cur.volume += q.volume
        return done

    def _close(self, symbol: str, b: _Building) -> BarUpdate:
        prev = self._last_done.get(symbol)
        missing = 0
        if prev is not None and kst_trade_date(prev) == kst_trade_date(b.start):
            gap = (b.start - prev) // timedelta(seconds=self.interval_s) - 1
            missing = max(0, gap)
        self._last_done[symbol] = b.start
        bar = Bar(symbol, self.interval_s, b.start, b.open, b.high, b.low, b.close, b.volume)
        return BarUpdate(bar, missing)
