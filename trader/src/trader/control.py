"""운영 제어 — 운영 설정(DB)과 전략 스위치를 엔진에 반영한다.

웹은 엔진과 직접 통신하지 않는다. 엔진 DB 의 engine_state 에 쓰고, 엔진이 기동할 때와 감시 루프에서 읽는다.

    settings           : {version, values: {설정키: "문자열"|null}, by, at, previous}  ← 운영 설정의 원본. 웹이 쓴다
                         (처음 한 번은 엔진이 trader.env 값을 옮겨 version 1 로 만든다)
    strategy_switches  : {version, values: {전략ID: bool}, by, at}                    ← 웹이 쓴다
    settings_effective : 적용값·적용 버전·거부 사유·무시된 trader.env 값·바꿀 수 없는 설정 ← 엔진이 쓴다
    heartbeat          : 엔진 상태 신호                                                ← 엔진이 쓴다
    settings_overrides : (예전 형식) 첫 옮기기 때만 읽는다

안전 규칙
- DB 에 둘 수 있는 설정은 TUNABLE 화이트리스트뿐이다 (DB 주소·시작 현금·종목·모드·전략은 trader.env).
- DB 값은 Settings 검증(범위·값 사이 관계)을 통과해야 적용한다. 실패하면 이전 값을 유지하고
  SETTINGS_REJECTED 위험 이벤트를 남긴다. 기동 때 최신 값이 검증에 실패하면 직전 값(previous)으로 뜬다.
- DB 에도 trader.env 에도 운영 설정이 없으면 기동하지 않는다 (수수료·세율 기본값을 코드에 두지 않는다).
- 스위치를 읽지 못하면 마지막으로 읽은 값을 유지한다 (DB 장애 중엔 어차피 신규 주문이 막힌다).
- 꺼진 전략은 신규 매수만 하지 않는다. 매도·청산 신호와 규칙 청산(손절·목표가·장마감)은 그대로다.
"""

from __future__ import annotations

import logging
import time as _time
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
from decimal import Decimal
from typing import Any

from pydantic import ValidationError

from trader.broker.paper import FeeSchedule
from trader.config import Settings
from trader.risk.manager import RiskLimits
from trader.storage.store import TradingStore

log = logging.getLogger(__name__)

SETTINGS_KEY = "settings"
OVERRIDES_KEY = "settings_overrides"  # 예전 형식 (첫 옮기기 때만 읽는다)
SWITCHES_KEY = "strategy_switches"
EFFECTIVE_KEY = "settings_effective"
HEARTBEAT_KEY = "heartbeat"
SEED_BY = "seed:trader.env"

# DB 에 두고 화면에서 바꾸는 운영 설정 (Settings 필드 이름).
# 백엔드 traderControl 의 TUNABLE_RULES, 프론트 settingsMeta 와 같아야 한다. 모두 엔진 재시작 없이 적용된다.
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
    "entry_cutoff",
    "eod_exit",
)
# 값이 null 이면 "끔"인 설정
NULLABLE: frozenset[str] = frozenset({"entry_cutoff", "eod_exit"})


class SettingsUnavailableError(Exception):
    """운영 설정을 정할 수 없다 — 엔진을 띄우지 않는다."""


def _text(v: object) -> str | None:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return format(v, "f")
    if isinstance(v, time):
        return v.strftime("%H:%M:%S")
    return str(v)


def tunable_values(s: Settings) -> dict[str, str | None]:
    return {k: _text(getattr(s, k)) for k in TUNABLE}


def _as_input(values: Mapping[str, Any]) -> dict[str, str]:
    """DB 값 → Settings 입력. 모르는 키는 거부하고, 끌 수 있는 설정의 null 은 빈 값(끔)으로 넘긴다."""
    unknown = set(values) - set(TUNABLE)
    if unknown:
        raise ValueError(f"DB 에 둘 수 없는 설정: {sorted(unknown)}")
    out: dict[str, str] = {}
    for k, v in values.items():
        if v is None:
            if k in NULLABLE:
                out[k] = ""
            continue  # 필수 값이 비면 Settings 검증이 막는다
        out[k] = str(v)
    return out


def _statics(env: Mapping[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in env.items() if k not in TUNABLE}


@dataclass(frozen=True, slots=True)
class ResolvedSettings:
    settings: Settings
    version: int
    seeded: bool = False
    # trader.env 에 남아 있지만 DB 값을 쓰느라 무시한 키
    env_ignored: tuple[str, ...] = ()
    # 기동 때 최신 DB 값이 검증에 실패해 직전 값으로 떴을 때의 사유
    rejected: dict[str, Any] | None = field(default=None)


def resolve_settings(
    store: TradingStore, env: Mapping[str, Any], now: datetime, *, explicit: Iterable[str] = ()
) -> ResolvedSettings:
    """기동 때 운영 설정을 정한다.

    - DB `settings` 가 있으면 그 값 (trader.env 의 같은 키는 무시)
    - 없으면 trader.env 값 + 예전 화면 덮어쓰기(settings_overrides)를 합쳐 검증한 뒤 version 1 로 DB 에 옮긴다
    env 는 trader.env 값(이름 → 값). explicit 은 trader.env 에 실제로 적힌 키 (무시 경고용).
    """
    doc = store.get_engine_state(SETTINGS_KEY)
    if doc is None:
        return _seed(store, env, now)

    version = int(doc.get("version") or 0)
    ignored = tuple(sorted(k for k in explicit if k in TUNABLE))
    try:
        s = Settings.model_validate({**_statics(env), **_as_input(doc.get("values") or {})})
        return ResolvedSettings(s, version, env_ignored=ignored)
    except (ValueError, ValidationError) as e:
        reason = _reason(e)
    prev = doc.get("previous") or {}
    if prev.get("values"):
        try:
            s = Settings.model_validate({**_statics(env), **_as_input(prev["values"])})
        except (ValueError, ValidationError) as e2:
            raise SettingsUnavailableError(
                f"DB 운영 설정 v{version} 과 직전 값 모두 검증을 통과하지 못했다: {reason} / {_reason(e2)}"
            ) from e2
        log.error(
            "settings invalid: 직전 값으로 기동",
            extra={"fields": {"version": version, "reason": reason, "previous": prev.get("version")}},
        )
        rejected = {
            "version": version,
            "reason": reason,
            "by": str(doc.get("by") or ""),
            "at": now.isoformat(),
        }
        _event(store, "SETTINGS_REJECTED", now, rejected)
        return ResolvedSettings(s, int(prev.get("version") or 0), env_ignored=ignored, rejected=rejected)
    raise SettingsUnavailableError(f"DB 운영 설정 v{version} 이 검증을 통과하지 못했다: {reason}")


def _seed(store: TradingStore, env: Mapping[str, Any], now: datetime) -> ResolvedSettings:
    legacy_doc = store.get_engine_state(OVERRIDES_KEY) or {}
    legacy = {
        str(k): v for k, v in (legacy_doc.get("values") or {}).items() if k in TUNABLE and v is not None
    }
    try:
        s = Settings.model_validate({**env, **_as_input(legacy)})
    except (ValueError, ValidationError) as e:
        raise SettingsUnavailableError(
            "운영 설정이 DB 에 없고 trader.env 값으로도 만들 수 없다 (수수료·세율·한도가 필요하다): "
            + _reason(e)
        ) from e
    values = tunable_values(s)
    store.set_engine_state(
        SETTINGS_KEY,
        {"version": 1, "values": values, "by": SEED_BY, "at": now.isoformat(), "previous": None},
        now,
        "engine",
    )
    log.warning(
        "settings seeded from trader.env: 이제 운영 설정은 DB(화면)에서 바꾼다",
        extra={"fields": {"legacy_overrides": sorted(legacy)}},
    )
    _event(store, "SETTINGS_SEEDED", now, {"values": values, "legacy_overrides": legacy})
    return ResolvedSettings(s, 1, seeded=True)


def _event(store: TradingStore, kind: str, now: datetime, detail: dict[str, Any]) -> None:
    try:
        store.record_risk_event(kind, now, detail=detail)
    except Exception as e:
        log.warning("risk event write failed", extra={"fields": {"kind": kind, "err": str(e)[:200]}})


@dataclass(frozen=True, slots=True)
class SettingsChange:
    settings: Settings
    version: int
    by: str


class RuntimeControls:
    """engine_state 의 운영 설정·스위치를 읽어 적용할 설정과 전략 켜짐 여부를 알려 준다."""

    def __init__(
        self,
        store: TradingStore,
        current: Settings,
        *,
        version: int = 0,
        env_ignored: Iterable[str] = (),
        rejected: dict[str, Any] | None = None,
        poll_seconds: float = 5.0,
    ) -> None:
        self._store = store
        self.current = current
        self._poll = poll_seconds
        self._last_poll: float | None = None
        self.applied_version = version
        self.env_ignored = tuple(env_ignored)
        self.rejected = rejected
        self.switches: dict[str, bool] = {}
        self._switch_version: int | None = None
        self._info: dict[str, Any] | None = None

    # ── 전략 스위치 ──────────────────────────────────────────────────────

    def enabled(self, strategy_id: str) -> bool:
        return self.switches.get(strategy_id, True)

    # ── 주기적 확인 ──────────────────────────────────────────────────────

    def poll(self, now: datetime, *, force: bool = False) -> SettingsChange | None:
        """DB 운영 설정이 바뀌었고 검증을 통과하면 새 설정을 돌려준다. 호출한 쪽이 적용한다."""
        mono = _time.monotonic()
        if not force and self._last_poll is not None and mono - self._last_poll < self._poll:
            return None
        self._last_poll = mono
        self._read_switches()
        try:
            doc = self._store.get_engine_state(SETTINGS_KEY)
        except Exception as e:
            log.warning("settings read failed", extra={"fields": {"err": str(e)[:200]}})
            return None
        if doc is None:
            return None
        version = int(doc.get("version") or 0)
        if version == self.applied_version or (self.rejected and self.rejected.get("version") == version):
            return None
        by = str(doc.get("by") or "unknown")[:64]
        try:
            settings = self.validate(doc.get("values") or {})
        except (ValueError, ValidationError) as e:
            reason = _reason(e)
            self.rejected = {"version": version, "reason": reason, "by": by, "at": now.isoformat()}
            log.warning("settings rejected", extra={"fields": {"version": version, "reason": reason}})
            _event(self._store, "SETTINGS_REJECTED", now, {"version": version, "reason": reason, "by": by})
            self.publish(now)
            return None
        return SettingsChange(settings, version, by)

    def validate(self, raw: object) -> Settings:
        if not isinstance(raw, dict):
            raise ValueError("values 가 객체가 아니다")
        # 지금 설정 위에 얹는다 (빠진 키는 지금 값 유지). model_validate 는 환경변수·.env 를 다시 읽지 않는다
        return Settings.model_validate({**self.current.model_dump(), **_as_input(raw)})

    def applied(self, change: SettingsChange, now: datetime) -> None:
        """호출한 쪽이 change 를 엔진에 반영한 뒤 부른다."""
        old = self.current
        before = tunable_values(old)
        self.current = change.settings
        self.applied_version = change.version
        self.rejected = None
        after = tunable_values(self.current)
        # 값으로 비교한다 ("0.0020" 과 "0.002" 는 같은 값)
        diff = {k: [before[k], after[k]] for k in TUNABLE if getattr(old, k) != getattr(self.current, k)}
        log.warning(
            "settings applied", extra={"fields": {"version": change.version, "by": change.by, "diff": diff}}
        )
        _event(
            self._store, "SETTINGS_APPLIED", now, {"version": change.version, "by": change.by, "diff": diff}
        )
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
        """화면이 보여줄 적용값·적용 버전·거부 사유·무시된 trader.env 값을 남긴다."""
        value: dict[str, Any] = {
            "effective": tunable_values(self.current),
            "applied_version": self.applied_version,
            "rejected": self.rejected,
            "env_ignored": list(self.env_ignored),
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


def _reason(e: Exception) -> str:
    if isinstance(e, ValidationError):
        parts = []
        for err in e.errors()[:5]:
            loc = ".".join(str(x) for x in err.get("loc", ())) or "설정"
            parts.append(f"{loc}: {err.get('msg')}")
        return "; ".join(parts)[:300]
    return str(e)[:300]


def static_info(s: Settings) -> dict[str, Any]:
    """화면에 보여줄, trader.env 에서만 바꾸는 설정 (진입 마감·장마감 청산은 운영 설정)."""
    return {
        "mode": s.mode,
        "feed": s.feed,
        "account": s.account_name,
        "symbols": s.symbols,
        "strategies": [{"id": n, "shadow": n in s.shadow_strategies} for n in s.strategies],
        "paper_initial_cash": _text(s.paper_initial_cash),
        "bar_interval_seconds": s.bar_interval_seconds,
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
