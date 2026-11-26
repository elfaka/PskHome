"""시장 맥락 — 지수, 미국 변동성(VIX), 종목별 장중 수급, 상·하한가.

체결 시세와 달리 **지연·집계 데이터**다. 값마다 데이터 시각을 함께 두고,
쓰는 쪽(점수 전략·위험 관리)이 신선도를 판단한다.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Protocol

from trader.clock import Clock, kst_trade_date
from trader.marketdata.stocksim_client import StockSimClient, StockSimError, dec, dec_or_none, parse_ts

log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class FlowPoint:
    at: datetime
    foreigner: Decimal
    institution: Decimal


@dataclass(frozen=True, slots=True)
class SymbolContext:
    # 오늘 장중 누적 순매수 기록 (오래된 순, 최근 몇 개)
    flows: tuple[FlowPoint, ...] = ()
    upper_limit: Decimal | None = None
    lower_limit: Decimal | None = None
    limits_date: date | None = None


@dataclass(frozen=True, slots=True)
class MarketContext:
    kospi_change_rate: Decimal | None = None  # 비율 (0.01 = 1%)
    kospi_ts: datetime | None = None
    vix_value: Decimal | None = None
    vix_level: str | None = None  # CALM / NORMAL / ELEVATED / FEAR
    vix_ts: datetime | None = None
    symbols: dict[str, SymbolContext] = field(default_factory=dict)
    # 이 공급부가 상·하한가를 주는가. 준다면 값이 없을 때 매수를 막는다
    provides_price_limits: bool = False


class ContextProvider(Protocol):
    def snapshot(self) -> MarketContext: ...

    async def run(self) -> None: ...


class NullContextProvider:
    """모의 생성·CSV 재생용 — 맥락 데이터가 없다."""

    def snapshot(self) -> MarketContext:
        return MarketContext()

    async def run(self) -> None:
        return None


def parse_market(
    data: dict[str, object],
) -> tuple[Decimal | None, datetime | None, Decimal | None, str | None, datetime | None]:
    kospi_rate = kospi_ts = vix_value = vix_level = vix_ts = None
    for idx in data.get("indices") or []:  # type: ignore[attr-defined]
        if isinstance(idx, dict) and idx.get("symbol") == "KOSPI":
            kospi_rate = dec_or_none(idx.get("changeRate"))
            kospi_ts = parse_ts(idx["timestamp"]) if idx.get("timestamp") else None
    vix = data.get("vix")
    if isinstance(vix, dict):
        vix_value = dec_or_none(vix.get("value"))
        vix_level = str(vix["level"]) if vix.get("level") else None
        vix_ts = parse_ts(vix["timestamp"]) if vix.get("timestamp") else None
    return kospi_rate, kospi_ts, vix_value, vix_level, vix_ts


def parse_flows(data: dict[str, object], today: date) -> tuple[FlowPoint, ...]:
    if data.get("date") != today.isoformat() or data.get("latestDate") != today.isoformat():
        return ()
    pts = [
        FlowPoint(parse_ts(p["at"]), dec(p["foreigner"]), dec(p["institution"]))
        for p in data.get("points") or []  # type: ignore[attr-defined]
        if isinstance(p, dict)
    ]
    return tuple(pts[-3:])


class StockSimContextProvider:
    def __init__(
        self, *, client: StockSimClient, symbols: list[str], clock: Clock, poll_seconds: float
    ) -> None:
        self.client = client
        self.symbols = symbols
        self.clock = clock
        self.poll_seconds = poll_seconds
        self._ctx = MarketContext(provides_price_limits=True)

    def snapshot(self) -> MarketContext:
        return self._ctx

    async def refresh(self) -> None:
        ctx = self._ctx
        today = kst_trade_date(self.clock.now())
        kospi_rate, kospi_ts, vix_value, vix_level, vix_ts = (
            ctx.kospi_change_rate,
            ctx.kospi_ts,
            ctx.vix_value,
            ctx.vix_level,
            ctx.vix_ts,
        )
        try:
            kospi_rate, kospi_ts, vix_value, vix_level, vix_ts = parse_market(await self.client.market())
        except (StockSimError, KeyError, TypeError, ArithmeticError) as e:
            log.warning("market context failed", extra={"fields": {"err": str(e)[:200]}})
        symbols = dict(ctx.symbols)
        for sym in self.symbols:
            cur = symbols.get(sym, SymbolContext())
            flows = cur.flows
            try:
                flows = parse_flows(await self.client.intraday_flows(sym), today)
            except (StockSimError, KeyError, TypeError, ArithmeticError) as e:
                log.warning("flow context failed", extra={"fields": {"symbol": sym, "err": str(e)[:200]}})
            upper, lower, ldate = cur.upper_limit, cur.lower_limit, cur.limits_date
            if ldate != today:
                try:
                    ov = await self.client.overview(sym)
                    upper, lower, ldate = (
                        dec_or_none(ov.get("upperLimit")),
                        dec_or_none(ov.get("lowerLimit")),
                        today,
                    )
                except (StockSimError, KeyError, TypeError, ArithmeticError) as e:
                    upper = lower = ldate = None
                    log.warning("price limit failed", extra={"fields": {"symbol": sym, "err": str(e)[:200]}})
            symbols[sym] = SymbolContext(flows, upper, lower, ldate)
        self._ctx = MarketContext(kospi_rate, kospi_ts, vix_value, vix_level, vix_ts, symbols, True)

    async def run(self) -> None:
        while True:
            await self.refresh()
            await asyncio.sleep(self.poll_seconds)
