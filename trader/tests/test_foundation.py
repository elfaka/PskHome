from __future__ import annotations

import io
import json
import logging
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError

from tests.conftest import BASE_SETTINGS, make_settings
from trader.clock import SimClock, ensure_utc, from_db, kst_trade_date, to_db
from trader.config import Settings
from trader.logging_setup import JsonFormatter, SecretMaskingFilter, mask_text
from trader.money import D, floor_shares, round_cash, round_price_against_us

# ── money ────────────────────────────────────────────────────────────────


def test_D_rejects_float() -> None:
    with pytest.raises(TypeError):
        D(0.1)  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        D(True)
    with pytest.raises(ValueError):
        D("NaN")
    assert D("0.1") + D("0.2") == Decimal("0.3")
    assert D(5) == Decimal(5)


def test_round_cash_modes() -> None:
    assert round_cash(Decimal("149.9"), "down") == Decimal(149)
    assert round_cash(Decimal("149.5"), "half_up") == Decimal(150)


def test_round_price_against_us() -> None:
    assert round_price_against_us(Decimal("70035.1"), buying=True) == Decimal(70036)
    assert round_price_against_us(Decimal("70035.9"), buying=False) == Decimal(70035)


def test_floor_shares() -> None:
    assert floor_shares(Decimal("14.99")) == Decimal(14)


# ── clock ────────────────────────────────────────────────────────────────


def test_kst_trade_date_crosses_midnight() -> None:
    # UTC 15:30 = KST 다음날 00:30
    assert kst_trade_date(datetime(2026, 11, 25, 15, 30, tzinfo=UTC)) == date(2026, 11, 26)
    assert kst_trade_date(datetime(2026, 11, 25, 14, 59, tzinfo=UTC)) == date(2026, 11, 25)


def test_naive_datetime_rejected() -> None:
    with pytest.raises(ValueError):
        ensure_utc(datetime(2026, 1, 1))  # noqa: DTZ001


def test_db_roundtrip_is_utc() -> None:
    kst_dt = datetime(2026, 11, 26, 9, 0, tzinfo=UTC) + timedelta(hours=0)
    stored = to_db(kst_dt)
    assert stored.tzinfo is None
    assert from_db(stored) == kst_dt


def test_sim_clock_only_moves_forward() -> None:
    c = SimClock(datetime(2026, 1, 1, tzinfo=UTC))
    c.advance_to(datetime(2026, 1, 1, 0, 1, tzinfo=UTC))
    c.advance_to(datetime(2026, 1, 1, 0, 0, 30, tzinfo=UTC))
    assert c.now() == datetime(2026, 1, 1, 0, 1, tzinfo=UTC)


# ── config ───────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "missing",
    ["commission_rate_buy", "commission_rate_sell", "sell_tax_rate", "fee_rounding", "slippage_bps"],
)
def test_fees_have_no_default(missing: str) -> None:
    values = {k: v for k, v in BASE_SETTINGS.items() if k != missing}
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **values)  # type: ignore[call-arg]


def test_settings_parse_symbols_and_hide_secret() -> None:
    s = make_settings(symbols="005930, 000660")
    assert s.symbols == ["005930", "000660"]
    assert "test-password" not in repr(s)
    assert s.secret_values() == ["test-password"]
    assert isinstance(s.commission_rate_buy, Decimal)


def test_settings_reject_bad_strategy_window() -> None:
    with pytest.raises(ValidationError):
        make_settings(strategy_fast=20, strategy_slow=5)


def test_only_paper_mode_exists() -> None:
    with pytest.raises(ValidationError):
        make_settings(mode="live")


def test_settings_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for k, v in BASE_SETTINGS.items():
        monkeypatch.setenv(f"TRADER_{k.upper()}", str(v))
    monkeypatch.setenv("TRADER_SYMBOLS", "005930,035720")
    s = Settings(_env_file=None)  # type: ignore[call-arg]
    assert s.symbols == ["005930", "035720"]
    assert s.slippage_bps == Decimal(5)


# ── logging ──────────────────────────────────────────────────────────────


def test_mask_text_hides_url_password_and_secrets() -> None:
    out = mask_text("connect mysql+pymysql://app:s3cr3t!@db:3306/x token=abcd1234", ["abcd1234"])
    assert "s3cr3t!" not in out
    assert "abcd1234" not in out
    assert "app:***@db" in out


def test_logger_masks_args_fields_and_exceptions() -> None:
    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    handler.addFilter(SecretMaskingFilter(["topsecret"]))
    handler.setFormatter(JsonFormatter())
    log = logging.getLogger("test.mask")
    log.handlers = [handler]
    log.propagate = False
    try:
        raise RuntimeError("failed with topsecret")
    except RuntimeError:
        log.exception("pw=%s", "topsecret", extra={"fields": {"k": "topsecret"}})
    line = buf.getvalue()
    assert "topsecret" not in line
    payload = json.loads(line)
    assert payload["msg"] == "pw=***"
    assert payload["k"] == "***"
    assert "+09:00" in payload["ts"]
