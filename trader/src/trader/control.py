"""운영 제어 — 웹 화면(/trader)에서 바꾼 설정·전략 스위치를 엔진에 반영한다.

웹은 엔진과 직접 통신하지 않는다. 엔진 DB 의 engine_state 에 쓰고, 엔진이 감시 루프에서 읽는다.

    settings_overrides : {version, values: {설정키: "문자열"}, by, at}   ← 웹이 쓴다
    strategy_switches  : {version, values: {전략ID: bool}, by, at}       ← 웹이 쓴다
    settings_effective : 기본값(trader.env)·덮어쓰기·적용값·거부 사유     ← 엔진이 쓴다
    heartbeat          : 엔진 상태 신호                                   ← 엔진이 쓴다

안전 규칙
- 바꿀 수 있는 설정은 TUNABLE 화이트리스트뿐이다 (DB 주소·시작 현금·종목·모드는 안 된다).
- 덮어쓰기 값은 Settings 검증(범위·값 사이 관계)을 다시 통과해야 적용한다. 실패하면 이전 값을 유지하고
  SETTINGS_REJECTED 위험 이벤트를 남긴다.
- 스위치를 읽지 못하면 마지막으로 읽은 값을 유지한다 (DB 장애 중엔 어차피 신규 주문이 막힌다).
- 꺼진 전략은 신규 매수만 하지 않는다. 매도·청산 신호와 규칙 청산(손절·목표가·장마감)은 그대로다.
"""

from __future__ import annotations

import logging
import time as _time
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from pydantic import ValidationError

from trader.broker.paper import FeeSchedule
from trader.config import Settings
from trader.risk.manager import RiskLimits
from trader.storage.store import TradingStore

log = logging.getLogger(__name__)

OVERRIDES_KEY = "settings_overrides"
SWITCHES_KEY = "strategy_switches"
EFFECTIVE_KEY = "settings_effective"
HEARTBEAT_KEY = "heartbeat"

# 화면에서 바꿀 수 있는 설정 (Settings 필드 이름). 백엔드 traderControl 의 목록과 같아야 한다.
TUNABLE: tuple[str, ...] = (
    "commission_rate_buy",
    "commission_rate_sell",
    "sell_tax_rate",
    "fee_rounding",
    "slippage_bps",
    "participation_rate",
    "strategy_order_value",
    "risk_max_order_value",
    "risk_max_position_value",
    "risk_daily_loss_limit",
    "risk_atr_stop_mult",
    "risk_atr_take_mult",
    "risk_min_risk_reward",
    "risk_max_spread_bps",
)


def _text(v: object) -> str | None:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return format(v, "f")
    return str(v)


def tunable_values(s: Settings) -> dict[str, str | None]:
    return {k: _text(getattr(s, k)) for k in TUNABLE}


@dataclass(frozen=True, slots=True)
class SettingsChange:
    settings: Settings
    version: int
    by: str


class RuntimeControls:
    """engine_state 의 덮어쓰기·스위치를 읽어 적용할 설정과 전략 켜짐 여부를 알려 준다."""

    def __init__(self, store: TradingStore, base: Settings, *, poll_seconds: float = 5.0) -> None:
        self._store = store
        self.base = base
        self.current = base
        self._poll = poll_seconds
        self._last_poll: float | None = None
        self.applied_version = 0
        self.overrides: dict[str, str] = {}
        self.rejected: dict[str, Any] | None = None
        self.switches: dict[str, bool] = {}
        self._switch_version: int | None = None
        self._info: dict[str, Any] | None = None

    # ── 전략 스위치 ──────────────────────────────────────────────────────

    def enabled(self, strategy_id: str) -> bool:
        return self.switches.get(strategy_id, True)

    # ── 주기적 확인 ──────────────────────────────────────────────────────

    def poll(self, now: datetime, *, force: bool = False) -> SettingsChange | None:
        """바뀐 덮어쓰기가 있고 검증을 통과하면 새 설정을 돌려준다. 호출한 쪽이 적용한다."""
        mono = _time.monotonic()
        if not force and self._last_poll is not None and mono - self._last_poll < self._poll:
            return None
        self._last_poll = mono
        self._read_switches()
        try:
            doc = self._store.get_engine_state(OVERRIDES_KEY)
        except Exception as e:
            log.warning("settings overrides read failed", extra={"fields": {"err": str(e)[:200]}})
            return None
        if doc is None:
            return None
        version = int(doc.get("version") or 0)
        if version == self.applied_version or (self.rejected and self.rejected.get("version") == version):
            return None
        by = str(doc.get("by") or "unknown")[:64]
        raw = doc.get("values") or {}
        try:
            settings, _ = self.validate(raw)
        except (ValueError, ValidationError) as e:
            reason = _reason(e)
            self.rejected = {"version": version, "reason": reason, "by": by, "at": now.isoformat()}
            log.warning(
                "settings overrides rejected", extra={"fields": {"version": version, "reason": reason}}
            )
            self._safe_event("SETTINGS_REJECTED", now, {"version": version, "reason": reason, "by": by})
            self.publish(now)
            return None
        return SettingsChange(settings, version, by)

    def validate(self, raw: object) -> tuple[Settings, dict[str, str]]:
        if not isinstance(raw, dict):
            raise ValueError("values 가 객체가 아니다")
        unknown = set(raw) - set(TUNABLE)
        if unknown:
            raise ValueError(f"바꿀 수 없는 설정: {sorted(unknown)}")
        values = {str(k): str(v) for k, v in raw.items() if v is not None}
        merged = {**self.base.model_dump(), **values}
        # model_validate 는 환경변수·.env 를 다시 읽지 않는다 (BaseSettings.__init__ 을 거치지 않음)
        return Settings.model_validate(merged), values

    def applied(self, change: SettingsChange, now: datetime) -> None:
        """호출한 쪽이 change 를 엔진에 반영한 뒤 부른다."""
        before = tunable_values(self.current)
        self.current = change.settings
        self.applied_version = change.version
        self.overrides = {
            k: v
            for k, v in tunable_values(change.settings).items()
            if v != tunable_values(self.base)[k] and v
        }
        self.rejected = None
        after = tunable_values(self.current)
        diff = {k: [before[k], after[k]] for k in TUNABLE if before[k] != after[k]}
        log.warning(
            "settings applied", extra={"fields": {"version": change.version, "by": change.by, "diff": diff}}
        )
        self._safe_event("SETTINGS_APPLIED", now, {"version": change.version, "by": change.by, "diff": diff})
        self.publish(now)

    def _read_switches(self) -> None:
        try:
            doc = self._store.get_engine_state(SWITCHES_KEY)
        except Exception as e:
            log.warning(
                "strategy switches read failed — 마지막 값 유지", extra={"fields": {"err": str(e)[:200]}}
            )
            return
        values = (doc or {}).get("values") or {}
        new = {str(k): bool(v) for k, v in values.items()}
        if new != self.switches:
            log.warning("strategy switches changed", extra={"fields": {"switches": new}})
        self.switches = new
        self._switch_version = (doc or {}).get("version")

    # ── 기록 ─────────────────────────────────────────────────────────────

    def publish(self, now: datetime, info: dict[str, Any] | None = None) -> None:
        """화면이 보여줄 기본값·덮어쓰기·적용값을 남긴다."""
        value: dict[str, Any] = {
            "base": tunable_values(self.base),
            "effective": tunable_values(self.current),
            "overrides": self.overrides,
            "applied_version": self.applied_version,
            "rejected": self.rejected,
            "at": now.isoformat(),
        }
        if info is not None:
            self._info = info
        if self._info is not None:
            value["info"] = self._info
        try:
            self._store.set_engine_state(EFFECTIVE_KEY, value, now, "engine")
        except Exception as e:
            log.warning("settings_effective write failed", extra={"fields": {"err": str(e)[:200]}})

    def _safe_event(self, kind: str, now: datetime, detail: dict[str, Any]) -> None:
        try:
            self._store.record_risk_event(kind, now, detail=detail)
        except Exception as e:
            log.warning("risk event write failed", extra={"fields": {"kind": kind, "err": str(e)[:200]}})


def _reason(e: Exception) -> str:
    if isinstance(e, ValidationError):
        parts = []
        for err in e.errors()[:5]:
            loc = ".".join(str(x) for x in err.get("loc", ())) or "설정"
            parts.append(f"{loc}: {err.get('msg')}")
        return "; ".join(parts)[:300]
    return str(e)[:300]


def static_info(s: Settings) -> dict[str, Any]:
    """화면에 보여줄, 바꿀 수 없는 설정."""
    return {
        "mode": s.mode,
        "feed": s.feed,
        "account": s.account_name,
        "symbols": s.symbols,
        "strategies": [{"id": n, "shadow": n in s.shadow_strategies} for n in s.strategies],
        "paper_initial_cash": _text(s.paper_initial_cash),
        "bar_interval_seconds": s.bar_interval_seconds,
        "entry_cutoff": _text(s.entry_cutoff),
        "eod_exit": _text(s.eod_exit),
        "market_open": _text(s.market_open),
        "market_close": _text(s.market_close),
    }


def risk_limits(s: Settings) -> RiskLimits:
    return RiskLimits(
        max_order_value=s.risk_max_order_value,
        max_position_value=s.risk_max_position_value,
        daily_loss_limit=s.risk_daily_loss_limit,
        max_quote_age=timedelta(seconds=s.max_quote_age_seconds),
        approval_ttl=timedelta(seconds=s.risk_approval_ttl_seconds),
        slippage_bps=s.slippage_bps,
        commission_rate_buy=s.commission_rate_buy,
        enforce_market_hours=s.enforce_market_hours,
        market_open=s.market_open,
        market_close=s.market_close,
        commission_rate_sell=s.commission_rate_sell,
        sell_tax_rate=s.sell_tax_rate,
        entry_cutoff=s.entry_cutoff,
        require_atr_stop=True,
        atr_stop_mult=s.risk_atr_stop_mult,
        atr_take_mult=s.risk_atr_take_mult,
        min_risk_reward=s.risk_min_risk_reward,
        max_spread_bps=s.risk_max_spread_bps,
        near_upper_limit_pct=s.risk_near_upper_limit_pct,
        price_decimals=s.price_decimals,
    )


def fee_schedule(s: Settings) -> FeeSchedule:
    return FeeSchedule(
        commission_rate_buy=s.commission_rate_buy,
        commission_rate_sell=s.commission_rate_sell,
        sell_tax_rate=s.sell_tax_rate,
        rounding=s.fee_rounding,
    )
