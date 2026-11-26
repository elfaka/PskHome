from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import IntegrityError

from trader.domain import Bar, Fill, OrderRequest, OrderState, OrderStatus, OrderType, Quote, Side
from trader.storage.db import InstanceLock, InstanceLockError, create_db_engine
from trader.storage.store import DuplicateOrderError, SqlTradingStore, StoreConsistencyError

pytestmark = pytest.mark.mysql

T0 = datetime(2026, 11, 26, 0, 30, tzinfo=UTC)  # KST 09:30


def _req(coid: str = "c-1", side: Side = Side.BUY, qty: str = "10") -> OrderRequest:
    return OrderRequest(
        client_order_id=coid, symbol="005930", side=side, order_type=OrderType.MARKET, qty=Decimal(qty)
    )


def _fill(
    coid: str, exec_id: str, side: Side, qty: str, price: str, comm: str = "10", tax: str = "0"
) -> Fill:
    return Fill(
        exec_id=exec_id,
        client_order_id=coid,
        symbol="005930",
        side=side,
        ts=T0,
        qty=Decimal(qty),
        price=Decimal(price),
        commission=Decimal(comm),
        tax=Decimal(tax),
    )


@pytest.fixture
def store(db_engine: Engine) -> SqlTradingStore:
    return SqlTradingStore(db_engine)


def test_schema_types(db_engine: Engine) -> None:
    insp = inspect(db_engine)
    cols = {c["name"]: c for c in insp.get_columns("orders")}
    assert str(cols["qty"]["type"]) == "DECIMAL(20, 6)"
    assert str(cols["limit_price"]["type"]) == "DECIMAL(20, 4)"
    assert getattr(cols["created_at"]["type"], "fsp", None) == 6
    uniques = {tuple(u["column_names"]) for u in insp.get_unique_constraints("orders")}
    assert ("client_order_id",) in uniques
    with db_engine.connect() as c:
        assert c.execute(text("SELECT @@session.time_zone")).scalar() == "+00:00"


def test_client_order_id_unique_at_db_level(store: SqlTradingStore, db_engine: Engine) -> None:
    acc = store.ensure_account("a", "paper", "KRW", Decimal(1_000_000), T0)
    store.insert_order(acc, "paper", _req(), None, T0)
    with pytest.raises(DuplicateOrderError):
        store.insert_order(acc, "paper", _req(), None, T0)
    # 저장소를 거치지 않아도 DB 제약이 막는다
    with pytest.raises(IntegrityError), db_engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO orders (client_order_id, account_id, broker, symbol, side, order_type, tif, qty,"
                " status, filled_qty, created_at, updated_at) VALUES ('c-1', :a, 'paper', 'X', 'BUY', 'MARKET',"
                " 'DAY', 1, 'NEW', 0, NOW(6), NOW(6))"
            ),
            {"a": acc},
        )


def test_fill_accounting_buy_then_sell(store: SqlTradingStore) -> None:
    acc = store.ensure_account("a", "paper", "KRW", Decimal(1_000_000), T0)
    assert store.ensure_account("a", "paper", "KRW", Decimal(999), T0) == acc  # 두 번째는 입금 없음

    store.insert_order(acc, "paper", _req("b1", qty="10"), None, T0)
    store.update_order(
        OrderState("b1", "005930", Side.BUY, OrderType.MARKET, Decimal(10), None, OrderStatus.NEW), "ACK", T0
    )
    assert store.apply_fill(acc, _fill("b1", "e1", Side.BUY, "4", "70000"), OrderStatus.PARTIALLY_FILLED, T0)
    assert store.apply_fill(acc, _fill("b1", "e2", Side.BUY, "6", "70100"), OrderStatus.FILLED, T0)
    # 같은 체결 재전송은 무시
    assert not store.apply_fill(acc, _fill("b1", "e2", Side.BUY, "6", "70100"), OrderStatus.FILLED, T0)

    bal = store.load_balance(acc)
    assert bal.qty("005930") == Decimal(10)
    assert bal.positions["005930"].avg_price == Decimal("70060.0000")
    # 1,000,000 - (280,000 + 420,600) - 수수료 20
    assert bal.cash == Decimal("299380.0000")
    o = store.get_order("b1")
    assert o is not None and o.status is OrderStatus.FILLED and o.avg_fill_price == Decimal("70060.0000")

    store.insert_order(acc, "paper", _req("s1", Side.SELL, "10"), None, T0)
    store.apply_fill(
        acc, _fill("s1", "e3", Side.SELL, "10", "71000", comm="10", tax="1278"), OrderStatus.FILLED, T0
    )
    bal = store.load_balance(acc)
    assert bal.qty("005930") == 0
    assert bal.cash == Decimal("299380") + Decimal(710_000) - 10 - 1278
    assert store.check_consistency(acc) == []
    assert store.list_open_orders(acc) == []


def test_overfill_and_oversell_rejected_atomically(store: SqlTradingStore) -> None:
    acc = store.ensure_account("a", "paper", "KRW", Decimal(1_000_000), T0)
    store.insert_order(acc, "paper", _req("b1", qty="1"), None, T0)
    with pytest.raises(StoreConsistencyError):
        store.apply_fill(acc, _fill("b1", "e1", Side.BUY, "2", "100"), OrderStatus.FILLED, T0)
    store.insert_order(acc, "paper", _req("s1", Side.SELL, "1"), None, T0)
    with pytest.raises(StoreConsistencyError):
        store.apply_fill(acc, _fill("s1", "e2", Side.SELL, "1", "100"), OrderStatus.FILLED, T0)
    # 실패한 트랜잭션은 아무것도 남기지 않는다
    assert store.load_balance(acc).cash == Decimal(1_000_000)
    assert store.check_consistency(acc) == []


def test_status_must_match_filled_qty(store: SqlTradingStore) -> None:
    acc = store.ensure_account("a", "paper", "KRW", Decimal(1_000_000), T0)
    store.insert_order(acc, "paper", _req("b1", qty="10"), None, T0)
    with pytest.raises(StoreConsistencyError):
        store.apply_fill(acc, _fill("b1", "e1", Side.BUY, "4", "100"), OrderStatus.FILLED, T0)


def test_consistency_detects_tampering(store: SqlTradingStore, db_engine: Engine) -> None:
    acc = store.ensure_account("a", "paper", "KRW", Decimal(1_000_000), T0)
    store.insert_order(acc, "paper", _req("b1", qty="1"), None, T0)
    store.apply_fill(acc, _fill("b1", "e1", Side.BUY, "1", "100"), OrderStatus.FILLED, T0)
    with db_engine.begin() as c:
        c.execute(text("UPDATE positions SET qty = 5"))
    kinds = {m.kind for m in store.check_consistency(acc)}
    assert kinds == {"POSITION_QTY"}


def test_quotes_bars_decisions_events_state(store: SqlTradingStore) -> None:
    store.record_quotes(
        [
            Quote("005930", T0 + timedelta(seconds=i), Decimal(70000 + i), Decimal(5), source="synthetic")
            for i in range(3)
        ],
        T0,
    )
    for i in range(3):
        store.record_bar(
            Bar(
                "005930",
                60,
                T0 + timedelta(minutes=i),
                Decimal(1),
                Decimal(2),
                Decimal(1),
                Decimal(2),
                Decimal(9),
            )
        )
    store.record_bar(
        Bar("005930", 60, T0, Decimal(1), Decimal(2), Decimal(1), Decimal(2), Decimal(9))
    )  # 중복 무시
    bars = store.recent_bars("005930", 60, 2)
    assert [b.start_ts for b in bars] == [T0 + timedelta(minutes=1), T0 + timedelta(minutes=2)]
    assert bars[0].start_ts.tzinfo is UTC

    did = store.insert_decision(
        ts=T0,
        strategy_id="ma",
        symbol="005930",
        bar_ts=T0,
        action="BUY",
        reason="golden",
        inputs={"f": Decimal("1.5")},
    )
    store.update_decision_risk(did, "REJECTED", "max order", None)
    store.record_risk_event("STALE_QUOTE", T0, symbol="005930", detail={"age": Decimal(9)})

    assert store.get_engine_state("killswitch") is None
    store.set_engine_state("killswitch", {"halted": True, "reason": "test"}, T0, "cli")
    store.set_engine_state("killswitch", {"halted": False}, T0, "cli")
    assert store.get_engine_state("killswitch") == {"halted": False}

    acc = store.ensure_account("a", "paper", "KRW", Decimal(1), T0)
    assert store.get_daily_start_equity(acc, date(2026, 11, 26)) is None
    assert store.set_daily_start_equity(acc, date(2026, 11, 26), Decimal(100), T0) == Decimal(100)
    # 같은 날 두 번째 값은 무시 — 재시작해도 기준 유지
    assert store.set_daily_start_equity(acc, date(2026, 11, 26), Decimal(50), T0) == Decimal(100)


def test_instance_lock_is_exclusive(mysql_url: str) -> None:
    e1, e2 = create_db_engine(mysql_url), create_db_engine(mysql_url)
    a, b = InstanceLock(e1), InstanceLock(e2)
    try:
        a.acquire()
        assert a.still_held()
        with pytest.raises(InstanceLockError):
            b.acquire()
        a.release()
        b.acquire()
        assert b.still_held()
    finally:
        a.release()
        b.release()
        e1.dispose()
        e2.dispose()
