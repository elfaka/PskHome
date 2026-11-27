"""운영 설정(DB 원본·첫 옮기기·실시간 반영)·전략 스위치와 상태 신호 (실제 MySQL)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy import Engine, text

from tests.conftest import make_settings
from tests.test_engine_mysql import run, scalar, settings
from trader.app import build_engine
from trader.config import BootSettings, load_env_values
from trader.control import (
    EFFECTIVE_KEY,
    HEARTBEAT_KEY,
    OVERRIDES_KEY,
    SETTINGS_KEY,
    SWITCHES_KEY,
    TUNABLE,
    SettingsUnavailableError,
    tunable_values,
)
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


async def test_first_start_seeds_db_settings_from_env_and_legacy_overrides(
    mysql_url: str, db_engine: Engine
) -> None:
    # 예전 화면 덮어쓰기는 첫 옮기기에 합쳐진다 (화면에서 바꿔 둔 값을 잃지 않는다)
    put_state(db_engine, OVERRIDES_KEY, {"version": 4, "values": {"slippage_bps": "7"}, "by": "web:me"})
    eng = await run(mysql_url, db_engine)
    doc = state(db_engine, SETTINGS_KEY)
    assert doc["version"] == 1 and doc["by"] == "seed:trader.env" and doc["previous"] is None
    assert set(doc["values"]) == set(TUNABLE)
    assert doc["values"]["strategy_order_value"] == "1000000"
    assert doc["values"]["slippage_bps"] == "7"
    assert doc["values"]["entry_cutoff"] is None  # 테스트 설정은 끔
    assert eng.risk.limits.slippage_bps == 7
    seeded = events(db_engine, "SETTINGS_SEEDED")
    assert len(seeded) == 1 and seeded[0]["legacy_overrides"] == {"slippage_bps": "7"}
    eff = state(db_engine, EFFECTIVE_KEY)
    assert eff["applied_version"] == 1 and eff["effective"] == doc["values"]
    assert eff["env_ignored"] == [] and eff["rejected"] is None
    assert "base" not in eff and "entry_cutoff" not in eff["info"]
    assert eff["info"]["mode"] == "paper" and eff["info"]["symbols"] == ["005930"]


async def test_db_settings_win_over_env_and_apply_live(mysql_url: str, db_engine: Engine) -> None:
    values = {**tunable_values(settings(mysql_url)), "strategy_order_value": "500000", "slippage_bps": "6"}
    put_state(db_engine, SETTINGS_KEY, {"version": 3, "values": values, "by": "web:me", "previous": None})
    eng = await run(mysql_url, db_engine)
    # 기동 때부터 DB 값 (env 의 100만원이 아니라 50만원)
    assert eng.controls is not None and eng.controls.applied_version == 3
    assert eng.risk.limits.slippage_bps == 6
    with db_engine.connect() as c:
        worst = c.execute(text("SELECT MAX(qty * price) FROM fills WHERE side='BUY'")).scalar()
    assert worst is not None and worst <= 501000
    assert not events(db_engine, "SETTINGS_SEEDED")

    # 화면이 새 버전을 쓰면 다음 확인 때 적용된다 (장마감 청산 시각 포함)
    later = {**values, "risk_min_risk_reward": "0.9", "eod_exit": "15:10:00"}
    put_state(
        db_engine, SETTINGS_KEY, {"version": 4, "values": later, "by": "web:me", "previous": {"version": 3}}
    )
    eng._poll_controls(force=True)
    assert eng.controls.applied_version == 4
    assert eng.risk.limits.min_risk_reward == Decimal("0.9")
    assert eng.cfg.eod_exit == time(15, 10)
    applied = events(db_engine, "SETTINGS_APPLIED")
    assert applied[-1]["by"] == "web:me"
    assert applied[-1]["diff"] == {"risk_min_risk_reward": ["0.5", "0.9"], "eod_exit": [None, "15:10:00"]}
    assert state(db_engine, EFFECTIVE_KEY)["applied_version"] == 4


@pytest.mark.parametrize(
    "change",
    [
        {"strategy_order_value": "3000000"},  # 1회 주문 한도(200만)보다 크다
        {"commission_rate_buy": "1.5"},  # 비율 범위 밖
        {"paper_initial_cash": "1"},  # DB 에 둘 수 없는 설정
        {"entry_cutoff": "15:20:00", "eod_exit": "15:10:00"},  # 진입 마감이 청산보다 늦다
    ],
)
async def test_invalid_db_settings_are_rejected_and_old_values_kept(
    mysql_url: str, db_engine: Engine, change: dict[str, str]
) -> None:
    eng = await run(mysql_url, db_engine)
    seeded = state(db_engine, SETTINGS_KEY)["values"]
    put_state(db_engine, SETTINGS_KEY, {"version": 2, "values": {**seeded, **change}, "by": "web:me"})
    eng._poll_controls(force=True)
    eff = state(db_engine, EFFECTIVE_KEY)
    assert eff["applied_version"] == 1
    assert eff["rejected"]["version"] == 2 and eff["rejected"]["reason"]
    assert eff["effective"] == seeded
    assert eng.risk.limits.max_order_value == 2000000
    assert len(events(db_engine, "SETTINGS_REJECTED")) == 1


async def test_start_falls_back_to_previous_when_latest_is_invalid(mysql_url: str, db_engine: Engine) -> None:
    good = tunable_values(settings(mysql_url))
    bad = {**good, "strategy_order_value": "9000000"}
    put_state(
        db_engine,
        SETTINGS_KEY,
        {"version": 5, "values": bad, "by": "web:me", "previous": {"version": 4, "values": good}},
    )
    eng = await run(mysql_url, db_engine)
    assert eng.controls is not None and eng.controls.applied_version == 4
    eff = state(db_engine, EFFECTIVE_KEY)
    assert eff["rejected"]["version"] == 5
    assert eff["effective"]["strategy_order_value"] == "1000000"


def test_no_settings_anywhere_refuses_to_start(mysql_url: str, db_engine: Engine) -> None:
    env = {"database_url": mysql_url, "paper_initial_cash": "10000000", "feed": "synthetic"}
    with pytest.raises(SettingsUnavailableError, match="수수료"):
        build_engine(env, db=db_engine)
    assert SqlTradingStore(db_engine).get_engine_state(SETTINGS_KEY) is None


async def test_env_without_tunables_runs_from_db_and_reports_ignored(
    mysql_url: str, db_engine: Engine
) -> None:
    full = settings(mysql_url)
    put_state(db_engine, SETTINGS_KEY, {"version": 2, "values": tunable_values(full), "by": "web:me"})
    # trader.env 에 접속·실행 정보만 (+ 남아 있는 옛 값 하나)
    env = {k: v for k, v in full.model_dump().items() if k not in TUNABLE or k == "slippage_bps"}
    env["slippage_bps"] = "99"
    eng = build_engine(env, db=db_engine, explicit=tuple(env))
    assert await eng.run() == 0
    assert eng.risk.limits.slippage_bps == 5  # DB 값
    assert state(db_engine, EFFECTIVE_KEY)["env_ignored"] == ["slippage_bps"]


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


def test_settings_checks_intraday_times() -> None:
    with pytest.raises(ValidationError):
        make_settings(entry_cutoff="15:10", eod_exit="15:05")
    with pytest.raises(ValidationError):
        make_settings(eod_exit="15:25")  # 장 마감(15:20) 뒤
    s = make_settings(entry_cutoff="", eod_exit="15:15")
    assert s.entry_cutoff is None and s.eod_exit == time(15, 15)


def test_env_values_keep_only_written_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRADER_DATABASE_URL", "mysql+pymysql://u:p@h/db")
    monkeypatch.setenv("TRADER_SLIPPAGE_BPS", "")
    monkeypatch.setenv("TRADER_SYMBOLS", "005930,000660")
    env = load_env_values(None)
    assert env == {"database_url": "mysql+pymysql://u:p@h/db", "symbols": "005930,000660"}
    boot = BootSettings.model_validate(env)
    assert boot.account_name == "paper-default" and boot.secret_values() == ["p"]


def test_env_values_read_a_real_env_file_with_other_keys(tmp_path: Path) -> None:
    # 실제 .env 처럼 TRADER_ 가 아닌 값(로컬 DB 컨테이너 비밀번호)과 빈 값이 섞여 있어도 읽는다
    f = tmp_path / "trader.env"
    f.write_text(
        "DEV_MYSQL_ROOT_PASSWORD=x\n"
        "TRADER_DATABASE_URL=mysql+pymysql://u:p@h/db\n"
        "TRADER_COMMISSION_RATE_BUY=\n"
        "TRADER_SLIPPAGE_BPS=5\n"
        "TRADER_EOD_EXIT=15:15\n"
        "TRADER_ENTRY_CUTOFF=\n",
        encoding="utf-8",
    )
    env = load_env_values(str(f))
    # 빈 진입 마감은 "끔"으로 남는다 (빼면 기본값 15:00 이 살아난다)
    assert env == {
        "database_url": "mysql+pymysql://u:p@h/db",
        "slippage_bps": "5",
        "eod_exit": "15:15",
        "entry_cutoff": "",
    }
