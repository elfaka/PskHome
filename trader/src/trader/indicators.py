"""장중 지표 (Decimal). 봉이 완성될 때마다 갱신한다.

- RSI(14), ATR(14): Wilder 평활
- MACD(12, 26, 9): EMA
- VWAP: KST 거래일마다 초기화, 대표가격 (고+저+종)/3 × 거래량
- 거래량 비율: 이번 봉 거래량 / 직전 20봉 평균
- SMA(20)
데이터 누락으로 reset 하면 다시 쌓일 때까지 해당 값은 None 이다.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from trader.clock import kst_trade_date
from trader.domain import Bar
from trader.money import ZERO

PLACES = Decimal("0.0001")


def _q(v: Decimal | None) -> Decimal | None:
    return None if v is None else v.quantize(PLACES)


@dataclass(frozen=True, slots=True)
class IndicatorSnapshot:
    close: Decimal
    bars: int
    sma20: Decimal | None = None
    rsi14: Decimal | None = None
    macd: Decimal | None = None
    macd_signal: Decimal | None = None
    macd_hist: Decimal | None = None
    atr14: Decimal | None = None
    vwap: Decimal | None = None
    volume_ratio: Decimal | None = None


class _Ema:
    def __init__(self, period: int) -> None:
        self.k = Decimal(2) / Decimal(period + 1)
        self.period = period
        self.seed: list[Decimal] = []
        self.value: Decimal | None = None

    def add(self, x: Decimal) -> Decimal | None:
        if self.value is None:
            self.seed.append(x)
            if len(self.seed) == self.period:
                self.value = sum(self.seed, ZERO) / self.period
            return self.value
        self.value = self.value + self.k * (x - self.value)
        return self.value


class _Wilder:
    def __init__(self, period: int) -> None:
        self.period = period
        self.seed: list[Decimal] = []
        self.value: Decimal | None = None

    def add(self, x: Decimal) -> Decimal | None:
        if self.value is None:
            self.seed.append(x)
            if len(self.seed) == self.period:
                self.value = sum(self.seed, ZERO) / self.period
            return self.value
        self.value = (self.value * (self.period - 1) + x) / self.period
        return self.value


class IndicatorBook:
    """종목 하나의 지표 상태."""

    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.count = 0
        self.closes: deque[Decimal] = deque(maxlen=20)
        self.volumes: deque[Decimal] = deque(maxlen=21)
        self.prev_close: Decimal | None = None
        self.gain, self.loss = _Wilder(14), _Wilder(14)
        self.atr = _Wilder(14)
        self.ema12, self.ema26, self.signal = _Ema(12), _Ema(26), _Ema(9)
        self.vwap_day: date | None = None
        self.pv = ZERO
        self.vol = ZERO
        self.last: IndicatorSnapshot | None = None

    def add(self, bar: Bar) -> IndicatorSnapshot:
        self.count += 1
        c = bar.close
        self.closes.append(c)
        self.volumes.append(bar.volume)

        rsi = None
        tr = bar.high - bar.low
        if self.prev_close is not None:
            ch = c - self.prev_close
            g, lo = self.gain.add(max(ch, ZERO)), self.loss.add(max(-ch, ZERO))
            if g is not None and lo is not None:
                if lo == 0:
                    # 움직임이 전혀 없으면 중립(50), 상승만 있었으면 100
                    rsi = Decimal(50) if g == 0 else Decimal(100)
                else:
                    rsi = Decimal(100) - Decimal(100) / (1 + g / lo)
            tr = max(tr, abs(bar.high - self.prev_close), abs(bar.low - self.prev_close))
        atr = self.atr.add(tr)
        self.prev_close = c

        e12, e26 = self.ema12.add(c), self.ema26.add(c)
        macd = sig = hist = None
        if e12 is not None and e26 is not None:
            macd = e12 - e26
            sig = self.signal.add(macd)
            hist = None if sig is None else macd - sig

        day = kst_trade_date(bar.start_ts)
        if day != self.vwap_day:
            self.vwap_day, self.pv, self.vol = day, ZERO, ZERO
        typical = (bar.high + bar.low + c) / 3
        self.pv += typical * bar.volume
        self.vol += bar.volume
        vwap = self.pv / self.vol if self.vol > 0 else None

        sma = sum(self.closes, ZERO) / 20 if len(self.closes) == 20 else None
        vr = None
        if len(self.volumes) == 21:
            prev = list(self.volumes)[:-1]
            avg = sum(prev, ZERO) / 20
            vr = bar.volume / avg if avg > 0 else None

        self.last = IndicatorSnapshot(
            close=c,
            bars=self.count,
            sma20=_q(sma),
            rsi14=_q(rsi),
            macd=_q(macd),
            macd_signal=_q(sig),
            macd_hist=_q(hist),
            atr14=_q(atr),
            vwap=_q(vwap),
            volume_ratio=_q(vr),
        )
        return self.last
