from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy import Engine, text

from tests.fakes import T0, ListFeed, quote
from tests.test_paper_broker import FEES
from tests.test_risk import LIMITS
from trader.broker.paper import PaperBroker
from trader.clock import SimClock
from trader.domain import OrderStatus, Side
from trader.execution.gateway import FatalEngineError, OrderGateway, OrderIntent, make_client_order_id
from trader.risk.health import TradingHealth
from trader.risk.killswitch import KillSwitch
from trader.risk.manager import RiskContext, RiskManager
from trader.storage.store import SqlTradingStore

pytestmark = pytest.mark.mysql


class Harness:
    def __init__(self, engine: Engine) -> None:
        self.store = SqlTradingStore(engine)
        self.clock = SimClock(T0)
        self.broker = PaperBroker(
            feed=ListFeed([]),
            clock=self.clock,
            fees=FEES,
            slippage_bps=Decimal(0),
            participation_rate=Decimal(1),
        )
        self.account = self.store.ensure_account("t", "paper", "KRW", Decimal(10_000_000), T0)
        self.broker.restore(self.store.load_balance(self.account), [])
        self.q = quote(10_000)
        self.broker._last["005930"] = self.q
        self.health = TradingHealth()
        self.halted = False
        self.sent: list[str] = []
        orig = self.broker.place_order

        async def spy(req: Any, approval: Any) -> Any:
            self.sent.append(req.client_order_id)
            return await orig(req, approval)

        self.broker.place_order = spy  # type: ignore[method-assign]
        self.gw = OrderGateway(
            store=self.store,
            broker=self.broker,
            risk=RiskManager(LIMITS),
            clock=self.clock,
            account_id=self.account,
            context=self.ctx,
        )

    def ctx(self) -> RiskContext:
        return RiskContext(
            now=self.clock.now(),
            halted=self.halted,
            health=self.health,
            balance=self.store.load_balance(self.account),
            open_orders=self.store.list_open_orders(self.account),
            quotes={"005930": self.q},
            day_start_equity=Decimal(10_000_000),
        )

    def decision(self) -> int:
        return self.store.insert_decision(
            ts=T0, strategy_id="ma", symbol="005930", bar_ts=T0, action="BUY", reason="t", inputs={}
        )


def intent(qty: int = 10, ts_offset: int = 0) -> OrderIntent:
    return OrderIntent("ma", "005930", Side.BUY, Decimal(qty), T0 + timedelta(minutes=ts_offset))


@pytest.fixture
def h(db_engine: Engine) -> Harness:
    return Harness(db_engine)


async def test_approved_order_is_recorded_then_sent(h: Harness) -> None:
    did = h.decision()
    r = await h.gw.submit(intent(), did)
    assert r.outcome == "SENT"
    o = h.store.get_order(r.client_order_id)
    assert o is not None and o.status is OrderStatus.NEW and o.broker_order_id
    with h.store._engine.connect() as c:  # type: ignore[attr-defined]
        events = [row[0] for row in c.execute(text("SELECT event FROM order_events ORDER BY id"))]
        risk = c.execute(text("SELECT risk_result, client_order_id FROM strategy_decisions")).one()
    assert events == ["CREATED", "ACK"]
    assert tuple(risk) == ("APPROVED", r.client_order_id)


async def test_same_signal_twice_sends_once(h: Harness) -> None:
    r1 = await h.gw.submit(intent(), h.decision())
    r2 = await h.gw.submit(intent(), h.decision())
    assert (r1.outcome, r2.outcome) == ("SENT", "DUPLICATE")
    assert h.sent == [r1.client_order_id]
    # 다른 봉의 신호는 다른 주문
    r3 = await h.gw.submit(intent(ts_offset=1), h.decision())
    assert r3.outcome == "SENT" and r3.client_order_id != r1.client_order_id


async def test_rejected_order_is_not_recorded_nor_sent(h: Harness) -> None:
    did = h.decision()
    r = await h.gw.submit(intent(qty=1000), did)  # 1회 한도 초과
    assert r.outcome == "REJECTED" and r.reason == "MAX_ORDER_VALUE"
    assert h.sent == [] and h.store.get_order(r.client_order_id) is None
    with h.store._engine.connect() as c:  # type: ignore[attr-defined]
        assert c.execute(text("SELECT risk_result FROM strategy_decisions")).scalar() == "REJECTED"
        assert c.execute(text("SELECT kind FROM risk_events")).scalar() == "ORDER_REJECTED"


async def test_halted_blocks_orders(h: Harness) -> None:
    h.halted = True
    r = await h.gw.submit(intent(), h.decision())
    assert r.outcome == "REJECTED" and r.reason == "HALTED" and h.sent == []


async def test_db_write_failure_means_no_send(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*a: Any, **k: Any) -> None:
        raise RuntimeError("db down")

    monkeypatch.setattr(h.store, "insert_order", boom)
    with pytest.raises(RuntimeError):
        await h.gw.submit(intent(), h.decision())
    assert h.sent == []


async def test_failure_to_record_ack_is_fatal(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*a: Any, **k: Any) -> None:
        raise RuntimeError("db down")

    monkeypatch.setattr(h.store, "update_order", boom)
    with pytest.raises(FatalEngineError):
        await h.gw.submit(intent(), h.decision())
    # 주문은 나갔고 DB 에는 PENDING_NEW 로 남는다 → 재시작 복구가 브로커 조회로 정리한다
    o = h.store.get_order(make_client_order_id("ma", "005930", T0, Side.BUY))
    assert o is not None and o.status is OrderStatus.PENDING_NEW


async def test_status_never_moves_backwards(h: Harness) -> None:
    from dataclasses import replace

    r = await h.gw.submit(intent(), h.decision())
    assert r.state is not None
    h.store.update_order(replace(r.state, status=OrderStatus.CANCELED), "CANCELED", T0)
    h.store.update_order(r.state, "ACK", T0)  # 늦게 도착한 접수 응답
    o = h.store.get_order(r.client_order_id)
    assert o is not None and o.status is OrderStatus.CANCELED


def test_killswitch_persists_and_fails_closed(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    ks = KillSwitch(h.store, poll_seconds=0)
    assert ks.halted  # 읽기 전엔 켜진 것으로
    ks.refresh(force=True)
    assert not ks.halted
    ks.halt("manual", "cli", T0)
    other = KillSwitch(h.store, poll_seconds=0)  # 다른 프로세스·재시작
    other.refresh(force=True)
    assert other.halted and other.reason == "manual"
    other.resume("cli", T0)
    assert ks.refresh(force=True) and not ks.halted

    def boom(*a: Any, **k: Any) -> None:
        raise RuntimeError("db down")

    monkeypatch.setattr(h.store, "get_engine_state", boom)
    ks.refresh(force=True)
    assert ks.halted
