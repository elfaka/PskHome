"""종목 자동 선정 · 동시 보유 종목 수 한도 · 여러 종목 시세 폴링 (MySQL 없이)."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime, time
from decimal import Decimal
from typing import Any

import httpx
import pytest
from pydantic import ValidationError

from tests.conftest import make_settings
from tests.fakes import T0, quote
from tests.test_risk import LIMITS, buy, ctx
from trader.clock import SimClock
from trader.domain import AccountBalance, OrderState, OrderStatus, OrderType, Position, Side
from trader.marketdata.stocksim_client import ALLOWED_PATHS, StockSimClient
from trader.marketdata.stocksim_feed import StockSimFeed
from trader.risk.manager import RiskManager
from trader.universe import (
    UNIVERSE_KEY,
    UniverseController,
    UniverseSelector,
    combine_rankings,
    params_of,
    screen,
)

# 2026-11-27 (금) KST
PRE_OPEN = datetime(2026, 11, 26, 23, 55, tzinfo=UTC)  # 08:55 KST
EARLY = datetime(2026, 11, 26, 23, 0, tzinfo=UTC)  # 08:00 KST
NEXT_DAY = datetime(2026, 11, 29, 23, 55, tzinfo=UTC)  # 월 08:55 KST
SATURDAY = datetime(2026, 11, 27, 23, 55, tzinfo=UTC)  # 토 08:55 KST


def item(rank: int, symbol: str, amount: int, name: str = "") -> dict[str, Any]:
    return {"rank": rank, "symbol": symbol, "name": name or symbol, "amount": amount, "price": 1000}


FOREIGNER = {
    "investor": "foreigner",
    "netBuy": [item(1, "005930", 400), item(2, "069500", 300, "KODEX 200"), item(3, "036930", 100)],
    "netSell": [item(1, "000660", 500)],
}
INSTITUTION = {
    "investor": "institution",
    "netBuy": [item(1, "000660", 450), item(2, "036930", 150), item(3, "009150", 90)],
    "netSell": [item(1, "005930", 50)],
}


def overview(symbol: str, **kw: Any) -> dict[str, Any]:
    base = {
        "symbol": symbol,
        "securityType": "STOCK",
        "tradingSuspended": False,
        "price": 100_000,
        "upperLimit": 130_000,
    }
    base.update(kw)
    return base


OVERVIEWS = {
    "005930": overview("005930"),
    "069500": overview("069500", securityType="ETF"),
    "036930": overview("036930", price=150_000, upperLimit=180_000),
    "009150": overview("009150", price=3_000_000),  # 1회 매수 금액(100만)보다 비싸다
    "000660": overview("000660"),
}


class FakeBackend:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        self.fail = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(
            (
                request.method,
                request.url.path + ("?" + request.url.query.decode() if request.url.query else ""),
            )
        )
        if self.fail:
            return httpx.Response(503, json={"error": {"code": "UPSTREAM_FAILURE"}})
        path = request.url.path.removeprefix("/api/stocksim")
        if path == "/rankings/investors":
            inv = request.url.params.get("investor")
            return httpx.Response(200, text=json.dumps(FOREIGNER if inv == "foreigner" else INSTITUTION))
        if path.startswith("/stocks/") and path.endswith("/overview"):
            sym = path.split("/")[2]
            return httpx.Response(200, text=json.dumps(OVERVIEWS[sym]))
        return httpx.Response(404)


def selector(backend: FakeBackend) -> UniverseSelector:
    return UniverseSelector(StockSimClient("http://be:8080", transport=httpx.MockTransport(backend.handler)))


class MemStore:
    """engine_state · risk_events 만 흉내 낸다."""

    def __init__(self) -> None:
        self.state: dict[str, dict[str, Any]] = {}
        self.events: list[tuple[str, dict[str, Any]]] = []

    def get_engine_state(self, key: str) -> dict[str, Any] | None:
        return self.state.get(key)

    def set_engine_state(self, key: str, value: dict[str, Any], now: datetime, by: str) -> None:
        self.state[key] = json.loads(json.dumps(value))

    def record_risk_event(self, kind: str, now: datetime, **kw: Any) -> None:
        self.events.append((kind, kw.get("detail") or {}))


def auto(**kw: Any) -> Any:
    base: dict[str, Any] = {
        "feed": "stocksim",
        "pace": "realtime",
        "universe_mode": "auto",
        "universe_max_symbols": 3,
        "strategy_order_value": "1000000",
    }
    return make_settings(**{**base, **kw})


# ── 순위 합치기 · 거르기 ─────────────────────────────────────────────────────


def test_combine_rankings_adds_net_buys_and_subtracts_net_sells() -> None:
    picks = combine_rankings(FOREIGNER, INSTITUTION)
    # 005930: 400 - 50 = 350, 036930: 100 + 150 = 250, 069500: 300, 009150: 90, 000660: -500 + 450 = -50 (빠짐)
    assert [(p.symbol, p.score) for p in picks] == [
        ("005930", Decimal(350)),
        ("069500", Decimal(300)),
        ("036930", Decimal(250)),
        ("009150", Decimal(90)),
    ]
    assert picks[0].foreigner == 400 and picks[0].institution == -50
    assert picks[1].name == "KODEX 200"


@pytest.mark.parametrize(
    ("ov", "reason"),
    [
        (overview("x", securityType="ETF"), "주식 아님"),
        (overview("x", tradingSuspended=True), "거래정지"),
        (overview("x", price=None), "현재가 없음"),
        (overview("x", price=2_000_000), "1회 매수 금액"),
        (overview("x", price=128_000, upperLimit=130_000), "상한가 근접"),
    ],
)
def test_screen_excludes(ov: dict[str, Any], reason: str) -> None:
    why = screen(ov, Decimal(1_000_000), Decimal("0.02"))
    assert why is not None and reason in why


def test_screen_passes_a_normal_stock() -> None:
    assert screen(overview("x"), Decimal(1_000_000), Decimal("0.02")) is None


async def test_selector_puts_pinned_first_filters_and_caps() -> None:
    backend = FakeBackend()
    s = auto(universe_pinned="000660")
    picks, excluded = await selector(backend).select(params_of(s), s.risk_near_upper_limit_pct)
    # 항상 포함 000660 + 순위 005930, (069500 ETF 제외), 036930 → 3개에서 멈춘다 (009150 은 확인하지 않음)
    assert [p.symbol for p in picks] == ["000660", "005930", "036930"]
    assert picks[0].pinned and not picks[1].pinned
    assert excluded == [{"symbol": "069500", "name": "KODEX 200", "reason": "주식 아님 (ETF)"}]
    assert all(m == "GET" for m, _ in backend.calls)
    assert not any("009150" in p for _, p in backend.calls)


def test_client_paths_are_read_only_and_listed() -> None:
    assert "/rankings/investors" in ALLOWED_PATHS and "/chart/{symbol}" in ALLOWED_PATHS


# ── 하루 1번 선정 ────────────────────────────────────────────────────────────


async def test_controller_selects_once_a_day_and_keeps_held_symbols() -> None:
    store, backend = MemStore(), FakeBackend()
    c = UniverseController(store, selector(backend), ["005930"])  # type: ignore[arg-type]
    s = auto()
    assert c.initial(s, held=set()) == ["005930"]  # 저장된 선정이 없으면 고정 종목으로 시작

    new = await c.maybe_refresh(s, {"035420"}, PRE_OPEN)
    assert new is not None
    doc = store.state[UNIVERSE_KEY]
    assert doc["date"] == "2026-11-27" and doc["source"] == "rankings"
    assert [p["symbol"] for p in doc["symbols"]] == ["005930", "036930"]  # 009150 은 비싸서 제외, 후보 소진
    assert new == ["005930", "036930", "035420"]  # 보유 종목은 목록 밖이어도 계속 본다
    assert [k for k, _ in store.events] == ["UNIVERSE_SELECTED"]

    # 같은 날에는 다시 고르지 않는다 (순위 호출 없음)
    n = len(backend.calls)
    assert await c.maybe_refresh(s, {"035420"}, PRE_OPEN) is None
    assert len(backend.calls) == n
    # 보유가 정리되면 목록이 줄어든다
    assert await c.maybe_refresh(s, set(), PRE_OPEN) == ["005930", "036930"]

    # 재시작: 같은 날 저장된 선정으로 바로 시작
    c2 = UniverseController(store, selector(backend), ["005930"])  # type: ignore[arg-type]
    assert c2.initial(s, held=set()) == ["005930", "036930"]
    assert await c2.maybe_refresh(s, set(), PRE_OPEN) is None
    assert len(backend.calls) == n


async def test_controller_timing_weekend_and_condition_change() -> None:
    store, backend = MemStore(), FakeBackend()
    c = UniverseController(store, selector(backend), ["005930"])  # type: ignore[arg-type]
    s = auto()
    await c.maybe_refresh(s, set(), PRE_OPEN)
    n = len(backend.calls)
    # 토요일·다음 날 08:50 전에는 다시 고르지 않는다
    assert await c.maybe_refresh(s, set(), SATURDAY) is None
    assert await c.maybe_refresh(s, set(), datetime(2026, 11, 29, 23, 0, tzinfo=UTC)) is None
    assert len(backend.calls) == n
    # 다음 영업일 08:55 에는 다시 고른다
    await c.maybe_refresh(s, set(), NEXT_DAY)
    assert store.state[UNIVERSE_KEY]["date"] == "2026-11-30" and len(backend.calls) > n
    # 조건(종목 수)이 바뀌면 같은 날이어도 다시 고른다
    n = len(backend.calls)
    assert await c.maybe_refresh(auto(universe_max_symbols=1), set(), NEXT_DAY) == ["005930"]
    assert len(backend.calls) > n


async def test_controller_keeps_previous_selection_when_rankings_fail() -> None:
    store, backend = MemStore(), FakeBackend()
    c = UniverseController(store, selector(backend), ["005930"])  # type: ignore[arg-type]
    s = auto()
    await c.maybe_refresh(s, set(), PRE_OPEN)
    backend.fail = True
    # 다음 날 선정 실패 → 직전 선정 유지, 5분 동안 다시 시도하지 않는다
    assert await c.maybe_refresh(s, set(), NEXT_DAY) is None
    assert store.state[UNIVERSE_KEY]["date"] == "2026-11-27"
    n = len(backend.calls)
    await c.maybe_refresh(s, set(), NEXT_DAY)
    assert len(backend.calls) == n


async def test_controller_fixed_mode_records_fixed_symbols() -> None:
    store = MemStore()
    c = UniverseController(store, None, ["005930", "000660"])  # type: ignore[arg-type]
    s = make_settings(symbols="005930,000660")
    assert c.initial(s, held=set()) == ["005930", "000660"]
    assert await c.maybe_refresh(s, {"035420"}, EARLY) == ["005930", "000660", "035420"]
    doc = store.state[UNIVERSE_KEY]
    assert doc["mode"] == "fixed" and doc["source"] == "fixed"
    assert [p["symbol"] for p in doc["symbols"]] == ["005930", "000660"]


# ── 설정 ─────────────────────────────────────────────────────────────────────


def test_settings_for_universe() -> None:
    with pytest.raises(ValidationError):
        make_settings(universe_mode="auto")  # synthetic 에서는 자동 선정 불가
    with pytest.raises(ValidationError):
        auto(universe_pinned="005930,000660,035420,036930")  # 항상 포함 > 최대 3
    with pytest.raises(ValidationError):
        auto(universe_max_symbols=11)
    with pytest.raises(ValidationError):
        make_settings(risk_max_open_positions="0")
    s = auto(universe_pinned="005930, 005930,000660", risk_max_open_positions="")
    assert s.universe_pinned == ["005930", "000660"] and s.risk_max_open_positions is None
    assert make_settings(risk_max_open_positions="3").risk_max_open_positions == 3


# ── 동시 보유 종목 수 ────────────────────────────────────────────────────────


def test_max_open_positions_blocks_new_symbols_only() -> None:
    rm = RiskManager(replace(LIMITS, max_open_positions=2))
    held = {
        "000660": Position("000660", Decimal(1), Decimal(10_000)),
        "035420": Position("035420", Decimal(1), Decimal(10_000)),
    }
    bal = AccountBalance(Decimal(10_000_000), held)
    assert rm.evaluate(buy(), ctx(balance=bal)).code == "MAX_OPEN_POSITIONS"
    # 미체결 매수도 센다
    one = AccountBalance(Decimal(10_000_000), {"000660": held["000660"]})
    pending = OrderState("o", "035420", Side.BUY, OrderType.MARKET, Decimal(1), None, OrderStatus.NEW)
    assert rm.evaluate(buy(), ctx(balance=one, open_orders=[pending])).code == "MAX_OPEN_POSITIONS"
    # 이미 가진 종목을 더 사는 것은 막지 않는다
    with_self = AccountBalance(
        Decimal(10_000_000), {**held, "005930": Position("005930", Decimal(1), Decimal(10_000))}
    )
    assert rm.evaluate(buy(), ctx(balance=with_self)).code != "MAX_OPEN_POSITIONS"
    # 한도 안이면 통과, 한도가 없으면 세지 않는다 (보유 종목 시세가 있어야 평가금액을 계산한다)
    quotes = {s: quote(10_000, symbol=s) for s in ("005930", "000660", "035420")}
    assert rm.evaluate(buy(), ctx(balance=one, quotes=quotes)).approved
    assert RiskManager(LIMITS).evaluate(buy(), ctx(balance=bal, quotes=quotes)).approved


# ── 여러 종목 시세 ───────────────────────────────────────────────────────────


class TradesBackend:
    def __init__(self) -> None:
        self.fail = False
        self.paths: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.paths.append(request.url.path)
        if self.fail:
            return httpx.Response(503)
        sym = request.url.path.rsplit("/", 1)[-1]
        if "/trades/" in request.url.path:
            return httpx.Response(
                200, json=[{"price": 1000, "volume": 1, "time": "2026-11-26T10:00:00+09:00", "s": sym}]
            )
        return httpx.Response(
            200, json={"asks": [{"price": 1001, "volume": 1}], "bids": [{"price": 999, "volume": 1}]}
        )


async def test_feed_polls_changed_symbols_and_backs_off_on_total_failure() -> None:
    backend = TradesBackend()
    feed = StockSimFeed(
        client=StockSimClient("http://be:8080", transport=httpx.MockTransport(backend.handler)),
        symbols=["005930"],
        clock=SimClock(T0),
        poll_seconds=1,
        poll_start=time(8, 50),
        poll_end=time(15, 40),
    )
    feed.set_symbols(["005930", "000660", "035420"])
    quotes = await feed.poll_once()
    assert sorted(q.symbol for q in quotes) == ["000660", "005930", "035420"]
    backend.fail = True
    await feed.poll_once()
    assert feed._backoff == 1
    await feed.poll_once()
    assert feed._backoff == 2
    backend.fail = False
    await feed.poll_once()
    assert feed._backoff == 0


def test_quote_helper_still_matches_risk_defaults() -> None:
    # 다른 테스트가 쓰는 기본 시세가 1회 주문·보유 한도 안이어야 위 검사들이 의미가 있다
    assert quote(10_000).price == 10_000 and T0.tzinfo is not None
