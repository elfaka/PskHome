"""stocksim 실시세 공급 — 백엔드의 최근 체결·호가를 주기적으로 받아 Quote 로 바꾼다.

- 체결 목록은 최신 50건이라, 바쁜 종목은 폴링 사이의 체결 일부를 놓칠 수 있다.
  그만큼 틱 거래량이 실제보다 작게 잡혀 부분 체결 모델은 보수적으로 동작한다.
- 처음 폴링에서는 과거 체결을 쏟아내지 않고 가장 최근 1건만 내보낸다.
- 실패하면 그 주기는 건너뛴다. 시세가 끊기면 위험 관리의 시세 신선도 검사가 신규 주문을 막는다.
- 장 시간 근처(poll_window)에만 폴링해 백엔드·토스 호출을 아낀다.
"""

from __future__ import annotations

import asyncio
import logging
import time as _time
from collections import Counter
from collections.abc import AsyncIterator
from datetime import datetime, time
from decimal import Decimal

from trader.clock import Clock, to_kst
from trader.domain import Quote
from trader.marketdata.stocksim_client import StockSimClient, StockSimError, dec, parse_ts

log = logging.getLogger(__name__)


def best_bid_ask(book: dict[str, object]) -> tuple[Decimal | None, Decimal | None]:
    bids = book.get("bids") or []
    asks = book.get("asks") or []
    bid = dec(bids[0]["price"]) if isinstance(bids, list) and bids else None
    # asks 는 높은 가격순 → 최우선 매도호가는 마지막
    ask = dec(asks[-1]["price"]) if isinstance(asks, list) and asks else None
    return bid, ask


class _Cursor:
    """종목별로 이미 내보낸 체결을 기억한다 (같은 초에 같은 가격·수량 체결이 여러 건일 수 있다)."""

    def __init__(self) -> None:
        self.last_ts: datetime | None = None
        self.seen_at_last: Counter[tuple[Decimal, Decimal]] = Counter()

    def new_trades(
        self, trades: list[tuple[datetime, Decimal, Decimal]]
    ) -> list[tuple[datetime, Decimal, Decimal]]:
        """trades: 오래된 순. 처음 호출이면 가장 최근 1건만 돌려준다."""
        if not trades:
            return []
        if self.last_ts is None:
            fresh = trades[-1:]
        else:
            fresh = []
            already = Counter(self.seen_at_last)
            for t in trades:
                if t[0] < self.last_ts:
                    continue
                key = (t[1], t[2])
                if t[0] == self.last_ts and already[key] > 0:
                    already[key] -= 1
                    continue
                fresh.append(t)
        newest = trades[-1][0]
        if self.last_ts is None or newest >= self.last_ts:
            self.last_ts = newest
            self.seen_at_last = Counter((p, v) for ts, p, v in trades if ts == newest)
        return fresh


class StockSimFeed:
    source = "stocksim"

    def __init__(
        self,
        *,
        client: StockSimClient,
        symbols: list[str],
        clock: Clock,
        poll_seconds: float,
        poll_start: time,
        poll_end: time,
    ) -> None:
        self.client = client
        self.symbols = symbols
        self.clock = clock
        self.poll_seconds = poll_seconds
        self.poll_start = poll_start
        self.poll_end = poll_end
        self._cursors = {s: _Cursor() for s in symbols}
        self._last_warn = 0.0

    def start_time(self) -> datetime | None:
        return None  # 실시간 공급

    def _in_window(self) -> bool:
        k = to_kst(self.clock.now())
        return k.weekday() < 5 and self.poll_start <= k.time() < self.poll_end

    async def poll_once(self) -> list[Quote]:
        out: list[Quote] = []
        for sym in self.symbols:
            try:
                trades_raw, book = await asyncio.gather(self.client.trades(sym), self.client.orderbook(sym))
                trades = sorted(
                    ((parse_ts(t["time"]), dec(t["price"]), dec(t["volume"])) for t in trades_raw),
                    key=lambda x: x[0],
                )
                bid, ask = best_bid_ask(book)
            except (StockSimError, KeyError, TypeError, ArithmeticError) as e:
                self._warn(f"stocksim poll failed for {sym}: {e}")
                continue
            for ts, price, volume in self._cursors[sym].new_trades(trades):
                if price <= 0 or volume < 0:
                    self._warn(f"잘못된 체결 무시: {sym} {price} {volume}")
                    continue
                out.append(Quote(sym, ts, price, volume, bid=bid, ask=ask, source=self.source))
        out.sort(key=lambda q: q.ts)
        return out

    def _warn(self, msg: str) -> None:
        now = _time.monotonic()
        if now - self._last_warn > 30:
            self._last_warn = now
            log.warning(msg)

    async def stream(self) -> AsyncIterator[Quote]:
        try:
            while True:
                if self._in_window():
                    for q in await self.poll_once():
                        yield q
                    await asyncio.sleep(self.poll_seconds)
                else:
                    await asyncio.sleep(30)
        finally:
            await self.client.close()
