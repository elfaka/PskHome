from __future__ import annotations

import os
from collections.abc import Iterator
from decimal import Decimal
from typing import Any

import pytest

from trader.config import Settings

# 테스트용 설정값. 실제 수수료·세율이 아니라 계산 검증용 임의값이다.
BASE_SETTINGS: dict[str, Any] = {
    "database_url": "mysql+pymysql://trader_app:test-password@127.0.0.1:3307/trader_test",
    "paper_initial_cash": "10000000",
    "commission_rate_buy": "0.00015",
    "commission_rate_sell": "0.00015",
    "sell_tax_rate": "0.0018",
    "fee_rounding": "down",
    "slippage_bps": "5",
    "participation_rate": "0.5",
    "risk_max_order_value": "2000000",
    "risk_max_position_value": "3000000",
    "risk_daily_loss_limit": "300000",
    "strategy_order_value": "1000000",
    "enforce_market_hours": False,
}


def make_settings(**overrides: Any) -> Settings:
    values = {**BASE_SETTINGS, **overrides}
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture(autouse=True)
def _no_trader_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """개발자 PC 의 TRADER_* 환경변수가 테스트에 새지 않도록 지운다 (테스트 DB URL 제외)."""
    for key in list(os.environ):
        if key.startswith("TRADER_") and key != "TRADER_TEST_DATABASE_URL":
            monkeypatch.delenv(key, raising=False)
    yield


def dec(s: str) -> Decimal:
    return Decimal(s)
