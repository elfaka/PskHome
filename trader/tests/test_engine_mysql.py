"""엔진 전체 흐름·재시작 복구·안전장치 (실제 MySQL)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import Engine, text

from tests.conftest import make_settings
from trader.app import SchemaMismatchError, build_engine, check_schema
from trader.domain import OrderRequest, OrderStatus, OrderType, Side
from trader.engine import EXIT_OK
from trader.engine import Engine as TradingEngine
from trader.risk.killswitch import KEY, KillSwitch
from trader.storage.models import SCHEMA_REVISION
from trader.storage.store import SqlTradingStore

pytestmark = pytest.mark.mysql

ROOT = Path(__file__).resolve().parent.parent


def settings(url: str, **kw: Any) -> Any:
    base: dict[str, Any] = {
        "database_url": url,
        "feed": "synthetic",
        "pace": "fast",
        "symbols": "005930",
        "synthetic_seed": 3,
        "synthetic_tick_seconds": 10,
        "synthetic_days": 1,
        "strategy_fast": 3,
        "strategy_slow": 8,
        "enforce_market_hours": True,
        "killswitch_poll_seconds": "1",
        "health_check_seconds": "60",
        "quote_flush_size": 500,
        # 1분봉 ATR 은 작아서 매도세·수수료를 빼면 손익비가 1 안팎이다. 엔진 흐름 검증용으로 기준을 낮춘다
        "risk_min_risk_reward": "0.5",
        "entry_cutoff": "",
        "eod_exit": "",
    }
    base.update(kw)
    return make_settings(**base)


def q(engine: Engine, sql: str) -> list[Any]:
    with engine.connect() as c:
        return list(c.execute(text(sql)).all())


def scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as c:
        return c.execute(text(sql)).scalar()


async def run(url: str, db: Engine, **kw: Any) -> TradingEngine:
    eng = build_engine(settings(url, **kw), db=db)
    code = await eng.run()
    assert code == EXIT_OK
    return eng


def test_schema_revision_matches_alembic_head() -> None:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    from trader.storage.models import SCHEMA_REVISION

    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "migrations"))
    assert ScriptDirectory.from_config(cfg).get_current_head() == SCHEMA_REVISION


def test_engine_refuses_unmigrated_db(db_engine: Engine) -> None:
    check_schema(db_engine)
    with db_engine.begin() as c:
        c.execute(text("UPDATE alembic_version SET version_num = 'old'"))
    try:
        with pytest.raises(SchemaMismatchError):
            check_schema(db_engine)
    finally:
        with db_engine.begin() as c:
            c.execute(text("UPDATE alembic_version SET version_num = :v"), {"v": SCHEMA_REVISION})


async def test_full_day_paper_run_is_consistent(mysql_url: str, db_engine: Engine) -> None:
    eng = await run(mysql_url, db_engine)
    assert eng.recovery is not None and eng.recovery.ok
    st = eng.stats
    assert st["quotes"] > 2000 and st["bars"] > 300
    assert st["orders_sent"] >= 2 and st["fills"] >= 2, st

    # 시세·봉·판단 기록
    assert scalar(db_engine, "SELECT COUNT(*) FROM quotes") == st["quotes"]
    assert scalar(db_engine, "SELECT COUNT(*) FROM bars WHERE interval_s = 60") == st["bars"]
    # 5분봉도 기록한다
    assert scalar(db_engine, "SELECT COUNT(*) FROM bars WHERE interval_s = 300") > 60
    # 그림자 전략(점수 전략)은 주문하지 않는다
    assert (
        scalar(
            db_engine,
            "SELECT COUNT(*) FROM strategy_decisions WHERE shadow = 1 AND client_order_id IS NOT NULL",
        )
        == 0
    )
    assert (
        scalar(db_engine, "SELECT COUNT(*) FROM strategy_decisions WHERE strategy_id = 'intraday_score'")
        == st["bars"]
    )
    # 그림자 전략은 자기 가상 보유만 본다 — 실제 계좌(ma_cross)가 산 것을 EXIT 하지 않는다
    shadow_seq = [
        r[0]
        for r in q(
            db_engine,
            "SELECT action FROM strategy_decisions WHERE shadow = 1 AND action IN ('BUY','SELL','EXIT') ORDER BY id",
        )
    ]
    held = 0
    for action in shadow_seq:
        if action == "BUY":
            held += 1
        else:
            assert held > 0, f"그림자 전략이 사지 않은 것을 청산했다: {shadow_seq}"
            held -= 1
    # 모든 전략 판단에 신호 수량이 기록된다 (그림자 가상 보유 복원에 쓴다)
    assert (
        scalar(
            db_engine,
            "SELECT COUNT(*) FROM strategy_decisions WHERE strategy_id IN ('ma_cross', 'intraday_score') "
            "AND JSON_CONTAINS_PATH(inputs, 'one', '$.signal_qty') = 0",
        )
        == 0
    )
    # 체결된 매수 판단에는 위험 관리가 정한 손절·목표가가 남는다
    missing_levels = scalar(
        db_engine,
        "SELECT COUNT(*) FROM strategy_decisions WHERE action = 'BUY' AND risk_result = 'APPROVED' "
        "AND (stop_loss IS NULL OR take_profit IS NULL OR risk_reward IS NULL)",
    )
    assert missing_levels == 0
    # 신호 성과가 쌓이고, 만기가 지난 것은 평가된다
    assert scalar(db_engine, "SELECT COUNT(*) FROM signal_performance WHERE status = 'DONE'") > 0
    # 전략 판단 + 규칙 청산(손절·목표가·장 마감) 판단
    assert scalar(db_engine, "SELECT COUNT(*) FROM strategy_decisions") == st["decisions"] + st["exits"]
    # 모든 주문은 승인된 판단과 연결된다
    orphan = scalar(
        db_engine,
        "SELECT COUNT(*) FROM orders o LEFT JOIN strategy_decisions d ON d.id = o.decision_id "
        "WHERE d.risk_result <> 'APPROVED' OR d.id IS NULL",
    )
    assert orphan == 0
    # DB 정합성 + 브로커 메모리 상태와 DB 일치
    store = SqlTradingStore(db_engine)
    assert store.check_consistency(eng.account_id) == []
    db_bal = store.load_balance(eng.account_id)
    br_bal = await eng.broker.get_balance()
    assert db_bal.cash == br_bal.cash
    assert {k: v.qty for k, v in db_bal.positions.items()} == {k: v.qty for k, v in br_bal.positions.items()}
    # 수수료·세금이 원장에 들어갔다
    kinds = {r[0] for r in q(db_engine, "SELECT DISTINCT kind FROM cash_ledger")}
    assert {"DEPOSIT", "BUY", "COMMISSION"} <= kinds
    # DB 시각은 UTC 로 저장된다 (KST 09:00 장 시작 = UTC 00:00)
    first = scalar(db_engine, "SELECT MIN(ts) FROM quotes")
    assert first.hour == 0 and first.minute == 0
    # 오늘 기준 평가금액 기록
    assert scalar(db_engine, "SELECT COUNT(*) FROM daily_equity") == 1


async def _quotes_for_day(seed: int) -> list[Any]:
    from datetime import date, time

    from trader.clock import SimClock
    from trader.marketdata.synthetic import SyntheticFeed

    feed = SyntheticFeed(
        symbols=["005930"],
        seed=seed,
        start_price=Decimal(70000),
        tick_size=Decimal(100),
        tick_seconds=10,
        market_open=time(9, 0),
        market_close=time(15, 20),
        pace="fast",
        clock=SimClock(datetime(2026, 11, 26, tzinfo=UTC)),
        start_date=date(2026, 11, 26),
    )

    return [x async for x in feed.stream()]


def write_csv(path: Path, quotes: list[Any]) -> Path:
    import csv

    from trader.clock import to_kst

    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["ts", "symbol", "price", "volume", "bid", "ask"])
        for x in quotes:
            w.writerow([to_kst(x.ts).isoformat(), x.symbol, x.price, x.volume, x.bid, x.ask])
    return path


def snapshot(db: Engine) -> dict[str, Any]:
    """계좌 ID·해시와 무관한 비교용 요약 (두 실행 사이에 auto-increment 가 달라진다)."""
    return {
        "orders": q(
            db,
            "SELECT SUBSTRING_INDEX(client_order_id, '-', 4), status, filled_qty, avg_fill_price "
            "FROM orders ORDER BY created_at, client_order_id",
        ),
        "fills": q(db, "SELECT ts, side, qty, price, commission, tax FROM fills ORDER BY ts, id"),
        "cash": scalar(db, "SELECT SUM(amount) FROM cash_ledger"),
        "positions": q(db, "SELECT symbol, qty, avg_price FROM positions ORDER BY symbol"),
    }


def wipe(db: Engine) -> None:
    from trader.storage.models import metadata

    with db.begin() as c:
        c.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        for t in reversed(metadata.sorted_tables):
            c.execute(text(f"DELETE FROM `{t.name}`"))
        c.execute(text("SET FOREIGN_KEY_CHECKS=1"))


async def test_crash_and_restart_equals_uninterrupted_run(
    mysql_url: str,
    db_engine: Engine,
    tmp_path: Path,
) -> None:
    quotes = await _quotes_for_day(seed=3)
    full = write_csv(tmp_path / "full.csv", quotes)

    # 1) 중단 없이 하루
    whole = await run(mysql_url, db_engine, feed="csv", feed_csv_path=str(full))
    expected = snapshot(db_engine)
    assert whole.stats["orders_sent"] >= 2
    wipe(db_engine)

    # 2) 12:00 직전에 죽고(마지막 1분은 다시 받는다) 재시작해서 이어서
    split = next(i for i, x in enumerate(quotes) if x.ts >= datetime(2026, 11, 26, 3, 0, tzinfo=UTC))
    overlap = split - 6  # 11:59:00 부터 다시
    before = write_csv(tmp_path / "a.csv", quotes[:split])
    after = write_csv(tmp_path / "b.csv", quotes[overlap:])
    await run(mysql_url, db_engine, feed="csv", feed_csv_path=str(before))
    second = await run(mysql_url, db_engine, feed="csv", feed_csv_path=str(after))
    assert second.recovery is not None and second.recovery.ok

    assert snapshot(db_engine) == expected
    assert scalar(db_engine, "SELECT COUNT(*) FROM cash_ledger WHERE kind = 'DEPOSIT'") == 1


async def test_pending_new_order_is_resolved_on_restart(
    mysql_url: str,
    db_engine: Engine,
    tmp_path: Path,
) -> None:
    one = tmp_path / "one.csv"
    one.write_text("ts,symbol,price,volume\n2026-11-26T09:00:00+09:00,005930,70000,1\n", encoding="utf-8")
    s = settings(mysql_url, feed="csv", feed_csv_path=str(one))
    store = SqlTradingStore(db_engine)
    acc = store.ensure_account(s.account_name, "paper", "KRW", s.paper_initial_cash, datetime.now(UTC))
    req = OrderRequest("crash-before-send", "005930", Side.BUY, OrderType.MARKET, Decimal(1))
    store.insert_order(acc, "paper", req, None, datetime.now(UTC))  # 기록 후 전송 전에 죽었다

    eng = build_engine(s, db=db_engine)
    await eng.run()
    assert eng.recovery is not None and eng.recovery.ok
    assert eng.recovery.resolved_pending == {"crash-before-send": "CANCELED(not sent)"}
    o = store.get_order("crash-before-send")
    assert o is not None and o.status is OrderStatus.CANCELED


async def test_recovery_mismatch_halts_and_blocks_orders(mysql_url: str, db_engine: Engine) -> None:
    first = await run(mysql_url, db_engine, synthetic_days=1)
    with db_engine.begin() as c:
        c.execute(
            text("INSERT INTO positions VALUES (:a, '000660', 7, 1000, 0, NOW(6))"), {"a": first.account_id}
        )
    eng = await run(mysql_url, db_engine, synthetic_seed=99)  # 다른 시세 → 다른 신호
    assert eng.recovery is not None and not eng.recovery.ok
    assert eng.killswitch.halted
    assert eng.stats["orders_sent"] == 0
    rejected = scalar(db_engine, "SELECT COUNT(*) FROM strategy_decisions WHERE risk_reason LIKE 'HALTED%'")
    assert rejected > 0
    assert scalar(db_engine, "SELECT COUNT(*) FROM risk_events WHERE kind = 'RECOVERY_MISMATCH'") == 1


async def test_killswitch_cancels_open_orders_and_blocks(mysql_url: str, db_engine: Engine) -> None:
    s = settings(mysql_url)
    store = SqlTradingStore(db_engine)
    now = datetime.now(UTC)
    acc = store.ensure_account(s.account_name, "paper", "KRW", s.paper_initial_cash, now)
    # 브로커가 접수한 미체결 지정가 주문 (체결되지 않을 가격)
    req = OrderRequest("resting", "005930", Side.BUY, OrderType.LIMIT, Decimal(1), Decimal(1000))
    store.insert_order(acc, "paper", req, None, now)
    from trader.domain import OrderState

    store.update_order(
        OrderState(
            "resting", "005930", Side.BUY, OrderType.LIMIT, Decimal(1), Decimal(1000), OrderStatus.NEW
        ),
        "ACK",
        now,
    )
    KillSwitch(store, 0).halt("test", "pytest", now)

    eng = await run(mysql_url, db_engine)
    o = store.get_order("resting")
    assert o is not None and o.status is OrderStatus.CANCELED
    assert eng.stats["orders_sent"] == 0
    assert store.get_engine_state(KEY) == {"halted": True, "reason": "test", "at": now.isoformat()}


async def test_db_failure_blocks_new_orders(
    mysql_url: str,
    db_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    eng = build_engine(settings(mysql_url), db=db_engine)

    def boom(*a: Any, **k: Any) -> None:
        raise RuntimeError("db write failed")

    monkeypatch.setattr(eng.store, "insert_decision", boom)
    assert await eng.run() == EXIT_OK
    assert eng.stats["orders_sent"] == 0
    assert not eng.health.db_ok
    assert scalar(db_engine, "SELECT COUNT(*) FROM orders") == 0


async def test_data_gap_resets_strategy_and_blocks_symbol(
    mysql_url: str,
    db_engine: Engine,
    tmp_path: Path,
) -> None:
    lines = ["ts,symbol,price,volume,bid,ask"]
    t = datetime(2026, 11, 26, 0, 0, tzinfo=UTC)
    for i in range(30):
        lines.append(f"{(t + timedelta(minutes=i)).isoformat()},005930,{70000 + i * 100},100,,")
    for i in range(40, 45):  # 10분 공백
        lines.append(f"{(t + timedelta(minutes=i)).isoformat()},005930,70000,100,,")
    p = tmp_path / "gap.csv"
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    eng = await run(mysql_url, db_engine, feed="csv", feed_csv_path=str(p))
    assert scalar(db_engine, "SELECT COUNT(*) FROM risk_events WHERE kind = 'DATA_GAP'") == 1
    assert "005930" in eng.health.data_issues


async def test_eod_exit_leaves_account_flat(mysql_url: str, db_engine: Engine) -> None:
    """15:15(KST) 장 마감 청산 — 하루가 끝나면 보유 종목이 없어야 한다 (장중 매매)."""
    eng = await run(mysql_url, db_engine, eod_exit="15:15", entry_cutoff="15:00")
    assert eng.stats["fills"] >= 2
    assert SqlTradingStore(db_engine).load_balance(eng.account_id).positions == {}
    # 15:00 이후 신규 매수 체결이 없다
    late_buys = scalar(
        db_engine,
        "SELECT COUNT(*) FROM fills WHERE side = 'BUY' AND TIME(ts) >= '06:00:00'",  # UTC 06:00 = KST 15:00
    )
    assert late_buys == 0
    exits = {
        r[0]
        for r in q(
            db_engine,
            "SELECT DISTINCT strategy_id FROM strategy_decisions WHERE action = 'EXIT' AND shadow = 0",
        )
    }
    assert exits <= {"risk_exit", "eod_exit"}
