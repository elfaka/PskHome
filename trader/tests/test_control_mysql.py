"""화면 제어(설정 덮어쓰기·전략 스위치)와 상태 신호 (실제 MySQL)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy import Engine, text

from tests.conftest import make_settings
from tests.test_engine_mysql import run, scalar, settings
from trader.app import build_engine
from trader.control import EFFECTIVE_KEY, HEARTBEAT_KEY, OVERRIDES_KEY, SWITCHES_KEY, TUNABLE
from trader.storage.store import SqlTradingStore

pytestmark = pytest.mark.mysql

NOW = datetime(2026, 1, 1, tzinfo=UTC)


def put_state(db: Engine, key: str, value: dict[str, Any], by: str = "web:test") -> None:
    SqlTradingStore(db).set_engine_state(key, value, NOW, by)


def state(db: Engine, key: str) -> dict[str, Any]:
    v = SqlTradingStore(db).get_engine_state(key)
    assert v is not None, key
    return v


def events(db: Engine, kind: str) -> list[dict[str, Any]]:
    with db.connect() as c:
        rows = c.execute(
            text("SELECT detail FROM risk_events WHERE kind = :k ORDER BY id"), {"k": kind}
        ).all()
    return [json.loads(r[0]) if isinstance(r[0], str) else r[0] for r in rows]


async def test_strategy_off_blocks_new_buys_only(mysql_url: str, db_engine: Engine) -> None:
    put_state(db_engine, SWITCHES_KEY, {"version": 1, "values": {"ma_cross": False}})
    eng = await run(mysql_url, db_engine)
    # 매수 신호는 기록되지만 주문은 나가지 않는다
    assert scalar(db_engine, "SELECT COUNT(*) FROM orders WHERE side = 'BUY'") == 0
    assert (
        scalar(
            db_engine,
            "SELECT COUNT(*) FROM strategy_decisions WHERE strategy_id = 'ma_cross' AND action = 'BUY' "
            "AND risk_result = 'STRATEGY_OFF'",
        )
        > 0
    )
    # 꺼지지 않은 그림자 전략은 그대로 기록된다
    assert (
        scalar(db_engine, "SELECT COUNT(*) FROM strategy_decisions WHERE strategy_id = 'intraday_score'") > 0
    )
    assert eng.controls is not None and not eng.controls.enabled("ma_cross")


async def test_settings_override_is_applied_and_published(mysql_url: str, db_engine: Engine) -> None:
    put_state(
        db_engine,
        OVERRIDES_KEY,
        {"version": 3, "values": {"strategy_order_value": "500000", "slippage_bps": "7"}, "by": "web:me"},
    )
    eng = await run(mysql_url, db_engine)
    assert eng.risk.limits.slippage_bps == 7
    eff = state(db_engine, EFFECTIVE_KEY)
    assert eff["applied_version"] == 3
    assert eff["effective"]["strategy_order_value"] == "500000"
    assert eff["base"]["strategy_order_value"] == "1000000"
    assert eff["overrides"] == {"strategy_order_value": "500000", "slippage_bps": "7"}
    assert eff["rejected"] is None
    assert set(eff["base"]) == set(TUNABLE)
    assert eff["info"]["mode"] == "paper" and eff["info"]["symbols"] == ["005930"]
    applied = events(db_engine, "SETTINGS_APPLIED")
    assert applied and applied[0]["by"] == "web:me"
    # 매수 금액이 줄었으니 체결 1건 금액도 50만원 안팎 (슬리피지 몇 bp 만큼 넘을 수 있다)
    with db_engine.connect() as c:
        worst = c.execute(text("SELECT MAX(qty * price) FROM fills WHERE side='BUY'")).scalar()
    assert worst is not None and worst <= 501000


@pytest.mark.parametrize(
    "values",
    [
        {"strategy_order_value": "3000000"},  # 1회 주문 한도(200만)보다 크다
        {"commission_rate_buy": "1.5"},  # 비율 범위 밖
        {"paper_initial_cash": "1"},  # 바꿀 수 없는 설정
    ],
)
async def test_invalid_override_is_rejected_and_old_values_kept(
    mysql_url: str, db_engine: Engine, values: dict[str, str]
) -> None:
    put_state(db_engine, OVERRIDES_KEY, {"version": 1, "values": values, "by": "web:me"})
    eng = await run(mysql_url, db_engine)
    eff = state(db_engine, EFFECTIVE_KEY)
    assert eff["applied_version"] == 0
    assert eff["rejected"]["version"] == 1 and eff["rejected"]["reason"]
    assert eff["effective"] == eff["base"]
    assert eng.risk.limits.max_order_value == 2000000
    assert len(events(db_engine, "SETTINGS_REJECTED")) == 1


async def test_heartbeat_reports_state(mysql_url: str, db_engine: Engine) -> None:
    eng = build_engine(settings(mysql_url), db=db_engine)
    await eng.run()
    eng._heartbeat()
    hb = state(db_engine, HEARTBEAT_KEY)
    assert hb["mode"] == "paper" and hb["db_ok"] is True and hb["halted"] is False
    assert set(hb["strategies"]) == {"ma_cross", "intraday_score"}
    assert hb["strategies"]["intraday_score"]["shadow"] is True
    assert "005930" in hb["last_quote_at"]


def test_settings_rejects_order_value_above_limits() -> None:
    with pytest.raises(ValidationError):
        make_settings(strategy_order_value="3000000")
    with pytest.raises(ValidationError):
        make_settings(risk_max_order_value="4000000")  # 종목 보유 한도(300만)보다 크다
