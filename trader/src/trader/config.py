"""설정. `.env`(또는 환경변수)에서 `TRADER_` 접두사로 읽는다.

수수료·세율·슬리피지·위험 한도는 **기본값이 없다**. 값을 임의로 확정하지 않기 위해서이며,
비어 있으면 엔진이 기동하지 않는다. 템플릿은 `.env.example`.
"""

from __future__ import annotations

from datetime import time
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from trader.money import RoundingMode

NonNegDecimal = Annotated[Decimal, Field(ge=0)]
PosDecimal = Annotated[Decimal, Field(gt=0)]
Rate = Annotated[Decimal, Field(ge=0, lt=1)]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="TRADER_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    # ── 실행 ──────────────────────────────────────────────────────────────
    # 1단계는 가상매매만 존재한다. 실주문 모드는 값 자체가 없다.
    mode: Literal["paper"] = "paper"
    account_name: str = Field(default="paper-default", min_length=1, max_length=64)

    # mysql+pymysql://trader_app:<pw>@host:3306/trader
    database_url: SecretStr

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_json: bool = True

    # ── 시세 ──────────────────────────────────────────────────────────────
    feed: Literal["synthetic", "csv"] = "synthetic"
    # fast: 시세 시각대로 가상 시계를 움직이며 기다리지 않는다 (재생)
    # realtime: 실제 시각으로 돈다 (synthetic 만 지원)
    pace: Literal["fast", "realtime"] = "fast"
    feed_csv_path: Path | None = None
    symbols: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["005930"])
    synthetic_seed: int = 42
    synthetic_start_price: PosDecimal = Decimal(70000)
    synthetic_tick_size: PosDecimal = Decimal(100)
    synthetic_tick_seconds: int = Field(default=10, ge=1)
    # fast 모드에서 생성할 거래일 수 (realtime 은 무한)
    synthetic_days: int = Field(default=1, ge=1)

    bar_interval_seconds: int = Field(default=60, ge=1)
    max_quote_age_seconds: int = Field(default=5, ge=1)
    # 봉이 이만큼 연속으로 비면 데이터 누락으로 보고 해당 종목 판단을 초기화한다
    max_missing_bars: int = Field(default=2, ge=1)

    # 장 시간 (KST). 세부 규칙(동시호가·휴장일)은 확인 필요 — 지금은 단순 시각 범위만 본다
    enforce_market_hours: bool = True
    market_open: time = time(9, 0)
    market_close: time = time(15, 20)

    # ── 가상 브로커 ───────────────────────────────────────────────────────
    paper_initial_cash: PosDecimal
    commission_rate_buy: Rate
    commission_rate_sell: Rate
    sell_tax_rate: Rate
    fee_rounding: RoundingMode
    slippage_bps: NonNegDecimal
    # 한 시세 틱의 거래량 중 내 주문이 체결될 수 있는 비율 (부분 체결 모델)
    participation_rate: Annotated[Decimal, Field(gt=0, le=1)]
    price_decimals: int = Field(default=0, ge=0, le=4)

    # ── 위험 관리 ─────────────────────────────────────────────────────────
    risk_max_order_value: PosDecimal
    risk_max_position_value: PosDecimal
    risk_daily_loss_limit: PosDecimal
    # 주문 승인 유효 시간. 승인 후 이 시간이 지나면 브로커가 거부한다
    risk_approval_ttl_seconds: int = Field(default=5, ge=1)

    # ── 전략: 이동평균 교차 ────────────────────────────────────────────────
    strategy_fast: int = Field(default=5, ge=1)
    strategy_slow: int = Field(default=20, ge=2)
    # 매수 1회에 쓸 금액. 수량 = floor(금액 / 종가)
    strategy_order_value: PosDecimal

    # ── 엔진 ──────────────────────────────────────────────────────────────
    killswitch_poll_seconds: Decimal = Decimal(1)
    health_check_seconds: Decimal = Decimal(5)
    quote_flush_size: int = Field(default=200, ge=1)

    @field_validator("symbols", mode="before")
    @classmethod
    def _split_symbols(cls, v: object) -> object:
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @field_validator("symbols")
    @classmethod
    def _check_symbols(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("종목이 하나 이상 필요하다")
        for s in v:
            if not s.isalnum() or len(s) > 16:
                raise ValueError(f"종목 코드 형식이 아니다: {s!r}")
        return v

    @model_validator(mode="after")
    def _check(self) -> Settings:
        if self.strategy_fast >= self.strategy_slow:
            raise ValueError("strategy_fast 는 strategy_slow 보다 작아야 한다")
        if self.feed == "csv" and self.feed_csv_path is None:
            raise ValueError("feed=csv 이면 TRADER_FEED_CSV_PATH 가 필요하다")
        if self.feed == "csv" and self.pace == "realtime":
            raise ValueError("csv 재생은 pace=fast 만 지원한다")
        if self.market_open >= self.market_close:
            raise ValueError("market_open 은 market_close 보다 빨라야 한다")
        return self

    def secret_values(self) -> list[str]:
        """로그 마스킹 대상 비밀값."""
        from sqlalchemy.engine import make_url

        out: list[str] = []
        try:
            pw = make_url(self.database_url.get_secret_value()).password
        except Exception:
            # URL 파싱 실패는 마스킹만 못 할 뿐, 접속 단계에서 어차피 기동이 막힌다
            pw = None
        if pw:
            out.append(str(pw))
        return out
