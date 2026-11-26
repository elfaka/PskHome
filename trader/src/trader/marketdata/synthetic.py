"""모의 생성 시세.

가격은 호가 단위의 정수 배로만 움직인다 (float 을 쓰지 않는다). 시드가 같으면 결과가 같다.
추세 구간이 번갈아 나오도록 일정 시간마다 방향 편향을 바꾼다 — 이동평균 교차가 실제로 생기게.

pace
- fast: start_date 부터 days 거래일(주말 제외) 동안의 장중 시세를 기다림 없이 만든다
- realtime: 현재 시각으로 tick_seconds 마다 만든다. 장 시간 밖에서는 다음 개장까지 기다린다
"""

from __future__ import annotations

import asyncio
import random
from collections.abc import AsyncIterator
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Literal

from trader.clock import KST, Clock, to_kst
from trader.domain import Quote

# 방향 편향을 바꾸는 주기 (틱 수)
REGIME_TICKS = 90


class _Walker:
    def __init__(self, rng: random.Random, start_ticks: int) -> None:
        self.rng = rng
        self.ticks = start_ticks
        self.bias = 0
        self.n = 0

    def step(self) -> int:
        if self.n % REGIME_TICKS == 0:
            self.bias = self.rng.choice((-1, 0, 1))
        self.n += 1
        # 기본 -1/0/+1 에 편향 방향을 하나 더 넣는다
        choices = [-1, 0, 1] + ([self.bias] if self.bias else [])
        self.ticks = max(1, self.ticks + self.rng.choice(choices))
        return self.ticks


class SyntheticFeed:
    source = "synthetic"

    def __init__(
        self,
        *,
        symbols: list[str],
        seed: int,
        start_price: Decimal,
        tick_size: Decimal,
        tick_seconds: int,
        market_open: time,
        market_close: time,
        pace: Literal["fast", "realtime"],
        clock: Clock,
        start_date: date | None = None,
        days: int = 1,
    ) -> None:
        if start_price % tick_size != 0:
            raise ValueError("start_price 는 tick_size 의 배수여야 한다")
        self.symbols = symbols
        self.tick_size = tick_size
        self.tick_seconds = tick_seconds
        self.market_open = market_open
        self.market_close = market_close
        self.pace = pace
        self.clock = clock
        self.start_date = start_date
        self.days = days
        rng = random.Random(seed)
        start_ticks = int(start_price / tick_size)
        self._walkers = {s: _Walker(random.Random(rng.randrange(2**32)), start_ticks) for s in symbols}
        self._vol_rng = random.Random(rng.randrange(2**32))

    def _quote(self, symbol: str, ts: datetime) -> Quote:
        ticks = self._walkers[symbol].step()
        price = self.tick_size * ticks
        return Quote(
            symbol=symbol,
            ts=ts,
            price=price,
            volume=Decimal(self._vol_rng.randint(10, 400)),
            bid=price,
            ask=price + self.tick_size,
            source=self.source,
        )

    def _trading_days(self) -> list[date]:
        d = self.start_date or to_kst(self.clock.now()).date()
        out: list[date] = []
        while len(out) < self.days:
            if d.weekday() < 5:
                out.append(d)
            d += timedelta(days=1)
        return out

    def start_time(self) -> datetime | None:
        if self.pace == "realtime":
            return None
        return datetime.combine(self._trading_days()[0], self.market_open, KST)

    async def stream(self) -> AsyncIterator[Quote]:
        if self.pace == "fast":
            async for q in self._fast():
                yield q
        else:
            async for q in self._realtime():
                yield q

    async def _fast(self) -> AsyncIterator[Quote]:
        step = timedelta(seconds=self.tick_seconds)
        for d in self._trading_days():
            ts = datetime.combine(d, self.market_open, KST)
            end = datetime.combine(d, self.market_close, KST)
            while ts < end:
                for s in self.symbols:
                    yield self._quote(s, ts)
                ts += step
            # 다른 작업(체결 이벤트 처리 등)에 차례를 넘긴다
            await asyncio.sleep(0)

    def _in_session(self, now_kst: datetime) -> bool:
        return now_kst.weekday() < 5 and self.market_open <= now_kst.time() < self.market_close

    async def _realtime(self) -> AsyncIterator[Quote]:
        while True:
            now = self.clock.now()
            if self._in_session(to_kst(now)):
                for s in self.symbols:
                    yield self._quote(s, now)
                await asyncio.sleep(self.tick_seconds)
            else:
                await asyncio.sleep(30)
