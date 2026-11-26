from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import httpx
import pytest

from trader.clock import SimClock
from trader.marketdata.context import StockSimContextProvider, parse_flows, parse_market
from trader.marketdata.stocksim_client import StockSimClient, StockSimError
from trader.marketdata.stocksim_feed import StockSimFeed, _Cursor

NOW = datetime(2026, 11, 26, 1, 0, tzinfo=UTC)  # KST 10:00


def ts(sec: int) -> str:
    return (NOW + timedelta(seconds=sec)).astimezone().isoformat()


class FakeBackend:
    def __init__(self) -> None:
        self.trades: list[dict[str, Any]] = []
        self.calls: list[tuple[str, str]] = []
        self.fail = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.calls.append((request.method, request.url.path))
        if self.fail:
            return httpx.Response(503, json={"error": {"code": "UPSTREAM_FAILURE"}})
        path = request.url.path
        if path.endswith("/trades/005930"):
            return httpx.Response(200, text=json.dumps(list(reversed(self.trades))))
        if path.endswith("/orderbook/005930"):
            return httpx.Response(
                200,
                json={
                    "timestamp": ts(0),
                    "asks": [{"price": 70300, "volume": 5}, {"price": 70200, "volume": 9}],
                    "bids": [{"price": 70100, "volume": 3}, {"price": 70000, "volume": 7}],
                },
            )
        return httpx.Response(404)


def feed_with(backend: FakeBackend) -> StockSimFeed:
    from datetime import time

    client = StockSimClient("http://be:8080", transport=httpx.MockTransport(backend.handler))
    return StockSimFeed(
        client=client,
        symbols=["005930"],
        clock=SimClock(NOW),
        poll_seconds=1,
        poll_start=time(8, 50),
        poll_end=time(15, 40),
    )


async def test_first_poll_emits_latest_then_only_new_trades() -> None:
    be = FakeBackend()
    be.trades = [
        {"price": 70100, "volume": 3, "time": ts(0)},
        {"price": 70200, "volume": 5, "time": ts(1)},
    ]
    feed = feed_with(be)
    first = await feed.poll_once()
    assert [(q.price, q.volume) for q in first] == [(Decimal(70200), Decimal(5))]
    assert first[0].bid == Decimal(70100) and first[0].ask == Decimal(70200)
    assert first[0].ts == NOW + timedelta(seconds=1) and first[0].source == "stocksim"

    assert await feed.poll_once() == []  # 새 체결 없음

    # 같은 초에 같은 가격·수량 체결이 하나 더, 그리고 다음 초 체결
    be.trades += [{"price": 70200, "volume": 5, "time": ts(1)}, {"price": 70300, "volume": 2, "time": ts(2)}]
    got = await feed.poll_once()
    assert [(q.ts.second - NOW.second, q.price) for q in got] == [(1, Decimal(70200)), (2, Decimal(70300))]
    assert all(m == "GET" for m, _ in be.calls)
    assert {p for _, p in be.calls} == {"/api/stocksim/trades/005930", "/api/stocksim/orderbook/005930"}


async def test_backend_failure_yields_nothing() -> None:
    be = FakeBackend()
    be.fail = True
    feed = feed_with(be)
    assert await feed.poll_once() == []


async def test_numbers_are_decimal_not_float() -> None:
    be = FakeBackend()
    be.trades = [{"price": 70100.5, "volume": 3, "time": ts(0)}]
    q = (await feed_with(be).poll_once())[0]
    assert q.price == Decimal("70100.5") and isinstance(q.price, Decimal)


async def test_naive_timestamps_are_rejected() -> None:
    be = FakeBackend()
    be.trades = [{"price": 70100, "volume": 3, "time": "2026-11-26T10:00:00"}]
    assert await feed_with(be).poll_once() == []


def test_cursor_handles_out_of_order_and_duplicates() -> None:
    c = _Cursor()
    t0 = NOW
    d = Decimal
    assert c.new_trades([(t0, d(1), d(1))]) == [(t0, d(1), d(1))]
    assert c.new_trades([(t0, d(1), d(1)), (t0, d(1), d(1))]) == [(t0, d(1), d(1))]
    assert c.new_trades([(t0, d(1), d(1)), (t0, d(1), d(1))]) == []


async def test_client_rejects_non_200() -> None:
    client = StockSimClient("http://be", transport=httpx.MockTransport(lambda r: httpx.Response(429)))
    with pytest.raises(StockSimError):
        await client.market()


def test_parse_market_and_flows() -> None:
    market = json.loads(
        json.dumps(
            {
                "indices": [
                    {"symbol": "KOSPI", "changeRate": 0.0029, "timestamp": "2026-11-26T15:30:00.000+09:00"},
                    {"symbol": "KOSDAQ", "changeRate": -0.01, "timestamp": None},
                ],
                "vix": {"value": 14.2, "level": "CALM", "timestamp": "2026-11-26T05:00:00.000+09:00"},
            }
        ),
        parse_float=Decimal,
    )
    rate, kts, vix, level, _ = parse_market(market)
    assert rate == Decimal("0.0029") and level == "CALM" and vix == Decimal("14.2")
    assert kts == datetime(2026, 11, 26, 6, 30, tzinfo=UTC)

    flows = {
        "date": "2026-11-26",
        "latestDate": "2026-11-26",
        "points": [{"at": "2026-11-26T10:00:00+09:00", "foreigner": -5, "institution": 7}],
    }
    pts = parse_flows(flows, date(2026, 11, 26))
    assert pts[0].foreigner == Decimal(-5)
    # 오늘 잠정치가 아니면 쓰지 않는다
    assert parse_flows({**flows, "latestDate": "2026-11-25"}, date(2026, 11, 26)) == ()


async def test_context_provider_collects_limits_and_survives_errors() -> None:
    def handler(r: httpx.Request) -> httpx.Response:
        p = r.url.path
        if p.endswith("/market"):
            return httpx.Response(503)
        if p.endswith("/overview"):
            return httpx.Response(200, json={"upperLimit": 91000, "lowerLimit": 49000})
        if p.endswith("/intraday"):
            return httpx.Response(200, json={"date": "2026-11-26", "latestDate": "2026-11-26", "points": []})
        return httpx.Response(404)

    prov = StockSimContextProvider(
        client=StockSimClient("http://be", transport=httpx.MockTransport(handler)),
        symbols=["005930"],
        clock=SimClock(NOW),
        poll_seconds=60,
    )
    await prov.refresh()
    ctx = prov.snapshot()
    assert ctx.provides_price_limits
    assert ctx.kospi_change_rate is None  # 실패한 항목은 비어 있다
    assert ctx.symbols["005930"].upper_limit == Decimal(91000)
