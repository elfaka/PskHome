"""설정. 두 곳에서 온다.

- trader.env(`.env`, 환경변수 `TRADER_*`): DB 접속·모드·계좌·시세 출처·종목·전략 등 **접속·실행 정보**
- DB(engine_state `settings`): 수수료·세율·슬리피지·위험 한도·손절/목표 배수·진입 마감 등 **운영 설정** (`control.TUNABLE`)
  화면에서 바꾸고, 엔진이 기동할 때와 감시 주기마다 읽는다. DB 에 아직 없으면 처음 한 번 trader.env 값을 옮긴다
  (`control.resolve_settings`)

수수료·세율·슬리피지·위험 한도는 **기본값이 없다**. 값을 임의로 확정하지 않기 위해서이며,
DB 에도 trader.env 에도 없으면 엔진이 기동하지 않는다. 템플릿은 `.env.example`.
"""

from __future__ import annotations

from datetime import time
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, create_model, field_validator, model_validator
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
    # synthetic: 모의 생성, csv: 파일 재생, stocksim: 백엔드 stocksim 을 거친 토스 실시세(읽기 전용)
    feed: Literal["synthetic", "csv", "stocksim"] = "synthetic"
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

    # stocksim 실시세 — 개발 PC 는 운영 공개 API, 운영 서버는 같은 네트워크의 백엔드
    stocksim_base_url: str = "https://elfaka.kr"
    stocksim_poll_seconds: Decimal = Field(default=Decimal(3), ge=1)
    stocksim_context_seconds: Decimal = Field(default=Decimal(60), ge=10)
    stocksim_poll_start: time = time(8, 55)
    stocksim_poll_end: time = time(15, 35)

    bar_interval_seconds: int = Field(default=60, ge=1)
    max_quote_age_seconds: int = Field(default=5, ge=1)
    # 봉이 이만큼 연속으로 비면 데이터 누락으로 보고 해당 종목 판단을 초기화한다
    max_missing_bars: int = Field(default=2, ge=1)

    # 장 시간 (KST). 세부 규칙(동시호가·휴장일)은 확인 필요 — 지금은 단순 시각 범위만 본다
    enforce_market_hours: bool = True
    market_open: time = time(9, 0)
    market_close: time = time(15, 20)
    # 장중 규칙: 이 시각 이후 신규 매수 금지, 이 시각에 보유분 청산 (빈 값이면 끔)
    entry_cutoff: time | None = time(15, 0)
    eod_exit: time | None = time(15, 15)
    # 신호 성과의 "장 마감" 기준 시각
    session_close: time = time(15, 30)

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
    # 손절·목표가 = 진입가 ∓ ATR(14) × 배수, 비용 차감 손익비 최소값
    risk_atr_stop_mult: PosDecimal = Decimal("1.5")
    risk_atr_take_mult: PosDecimal = Decimal(3)
    risk_min_risk_reward: PosDecimal = Decimal("1.5")
    risk_max_spread_bps: PosDecimal = Decimal(30)
    risk_near_upper_limit_pct: Rate = Decimal("0.02")

    # ── 전략 ──────────────────────────────────────────────────────────────
    # 돌릴 전략과, 그중 주문하지 않고 신호·성과만 기록할 전략(그림자)
    strategies: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["ma_cross", "intraday_score"])
    shadow_strategies: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["intraday_score"])

    # 이동평균 교차
    strategy_fast: int = Field(default=5, ge=1)
    strategy_slow: int = Field(default=20, ge=2)
    # 매수 1회에 쓸 금액. 수량 = floor(금액 / 종가)
    strategy_order_value: PosDecimal

    # ── 종목 선정 (운영 설정 — DB) ────────────────────────────────────────
    # fixed: TRADER_SYMBOLS 고정 / auto: 외국인·기관 순매수 상위에서 매일 장 시작 전에 고른다 (feed=stocksim 만)
    universe_mode: Literal["fixed", "auto"] = "fixed"
    universe_max_symbols: int = Field(default=10, ge=1, le=10)
    # auto 에서 항상 포함할 종목 (순위와 무관)
    universe_pinned: Annotated[list[str], NoDecode] = Field(default_factory=list)
    # 동시에 보유(또는 미체결 매수)할 수 있는 종목 수. 비우면 제한 없음
    risk_max_open_positions: int | None = Field(default=None, ge=1, le=20)

    # ── 엔진 ──────────────────────────────────────────────────────────────
    killswitch_poll_seconds: Decimal = Decimal(1)
    health_check_seconds: Decimal = Decimal(5)
    quote_flush_size: int = Field(default=200, ge=1)

    @field_validator("entry_cutoff", "eod_exit", "risk_max_open_positions", mode="before")
    @classmethod
    def _blank_is_off(cls, v: object) -> object:
        return None if isinstance(v, str) and not v.strip() else v

    @field_validator("symbols", "strategies", "shadow_strategies", "universe_pinned", mode="before")
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
        return _check_codes(v)

    @field_validator("universe_pinned")
    @classmethod
    def _check_pinned(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(_check_codes(v)))  # 중복 제거, 순서 유지

    @model_validator(mode="after")
    def _check(self) -> Settings:
        if self.strategy_fast >= self.strategy_slow:
            raise ValueError("strategy_fast 는 strategy_slow 보다 작아야 한다")
        if self.feed == "csv" and self.feed_csv_path is None:
            raise ValueError("feed=csv 이면 TRADER_FEED_CSV_PATH 가 필요하다")
        if self.feed == "csv" and self.pace == "realtime":
            raise ValueError("csv 재생은 pace=fast 만 지원한다")
        if self.feed == "stocksim" and self.pace != "realtime":
            raise ValueError("feed=stocksim 은 pace=realtime 이어야 한다")
        known = {"ma_cross", "intraday_score"}
        if not self.strategies or set(self.strategies) - known:
            raise ValueError(f"strategies 는 {sorted(known)} 중에서 고른다")
        if set(self.shadow_strategies) - set(self.strategies):
            raise ValueError("shadow_strategies 는 strategies 안에 있어야 한다")
        if len(set(self.strategies) - set(self.shadow_strategies)) > 1:
            # 한 계좌를 여러 전략이 주문하면 서로의 포지션을 건드린다
            raise ValueError("주문하는 전략은 하나만 둘 수 있다 (나머지는 shadow_strategies 로)")
        if self.market_open >= self.market_close:
            raise ValueError("market_open 은 market_close 보다 빨라야 한다")
        # 매수 금액이 한도보다 크면 모든 매수가 거부된다 — 설정 실수를 기동·화면 변경 단계에서 막는다
        if self.strategy_order_value > self.risk_max_order_value:
            raise ValueError("strategy_order_value 는 risk_max_order_value 이하여야 한다")
        if self.risk_max_order_value > self.risk_max_position_value:
            raise ValueError("risk_max_order_value 는 risk_max_position_value 이하여야 한다")
        # 장중 시각: 장 시작 ≤ 신규 매수 마감 ≤ 장마감 청산 ≤ 장 마감 (끈 값은 건너뛴다)
        for name in ("entry_cutoff", "eod_exit"):
            t = getattr(self, name)
            if t is not None and not (self.market_open <= t <= self.market_close):
                raise ValueError(
                    f"{name} 은 장 시간({self.market_open:%H:%M}~{self.market_close:%H:%M}) 안이어야 한다"
                )
        if self.entry_cutoff is not None and self.eod_exit is not None and self.entry_cutoff > self.eod_exit:
            raise ValueError("entry_cutoff 는 eod_exit 보다 늦을 수 없다")
        if self.universe_mode == "auto" and self.feed != "stocksim":
            raise ValueError("universe_mode=auto 는 feed=stocksim 에서만 쓸 수 있다 (순위 데이터가 필요하다)")
        if len(self.universe_pinned) > self.universe_max_symbols:
            raise ValueError("항상 포함 종목 수가 universe_max_symbols 보다 많다")
        return self

    def secret_values(self) -> list[str]:
        """로그 마스킹 대상 비밀값."""
        return _db_secrets(self.database_url)


def _check_codes(v: list[str]) -> list[str]:
    for s in v:
        if not s.isalnum() or len(s) > 16:  # 종목 코드
            raise ValueError(f"종목 코드 형식이 아니다: {s!r}")
    return v


def _db_secrets(url: SecretStr) -> list[str]:
    from sqlalchemy.engine import make_url

    try:
        pw = make_url(url.get_secret_value()).password
    except Exception:
        # URL 파싱 실패는 마스킹만 못 할 뿐, 접속 단계에서 어차피 기동이 막힌다
        pw = None
    return [str(pw)] if pw else []


class BootSettings(BaseModel):
    """trader.env 만으로 정해지는 접속·로그 설정.

    운영 설정(DB) 없이 만든다 — CLI halt/resume/status 와 기동 첫 단계(DB 접속 → 운영 설정 읽기)에서 쓴다.
    """

    model_config = ConfigDict(extra="ignore", frozen=True)

    database_url: SecretStr
    account_name: str = Field(default="paper-default", min_length=1, max_length=64)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_json: bool = True

    def secret_values(self) -> list[str]:
        return _db_secrets(self.database_url)


class _EnvBase(BaseSettings):
    # 설정은 클래스를 만들 때 정해져야 한다 (만든 뒤 model_config 를 바꾸면 적용되지 않는다).
    # .env 에는 TRADER_ 가 아닌 값(로컬 DB 컨테이너 비밀번호 등)도 있으므로 extra="ignore" 가 꼭 필요하다
    model_config = SettingsConfigDict(
        env_prefix="TRADER_", env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


# Settings 와 같은 환경변수·.env 를 읽되, 모든 값이 선택이고 형식 검사를 하지 않는 모델 (값 모으기 전용)
_EnvValues: type[BaseSettings] = create_model(  # type: ignore[call-overload]
    "_EnvValues",
    __base__=_EnvBase,
    **{name: (Annotated[Any, NoDecode], None) for name in Settings.model_fields},
)


# 빈 값이 "끔"을 뜻하는 설정 — 빈 값도 적힌 값으로 둔다 (빼면 기본값 15:00·15:15 가 살아난다)
BLANK_MEANS_OFF = frozenset({"entry_cutoff", "eod_exit", "risk_max_open_positions", "universe_pinned"})


def load_env_values(env_file: str | None = ".env") -> dict[str, Any]:
    """trader.env·환경변수에 실제로 적힌 값만 모은다 (빈 값은 빼되, 빈 값이 "끔"인 설정은 둔다). 검증은 Settings 가 한다."""
    raw = _EnvValues(_env_file=env_file).model_dump()
    return {
        k: v
        for k, v in raw.items()
        if v is not None and (k in BLANK_MEANS_OFF or not (isinstance(v, str) and not v.strip()))
    }
