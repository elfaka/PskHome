"""종목 자동 선정 — 오늘 시세·판단을 볼 종목을 정한다.

    fixed : trader.env TRADER_SYMBOLS 그대로
    auto  : 외국인·기관 순매수 상위(백엔드 /api/stocksim/rankings/investors)에서 매일 장 시작 전에 최대 N개 (feed=stocksim)

선정 규칙 (auto)
- 점수 = 외국인 순매수 금액 + 기관 순매수 금액 (순매도 상위에 있으면 그 금액을 뺀다). 0 이하는 후보가 아니다
- 거르기 (종목 개요): 주식(STOCK)만 — ETF·ETN 제외, 거래정지 제외, 1주 가격 > 1회 매수 금액이면 제외(살 수 없다),
  상한가 근접 제외
- 최종 = 항상 포함 종목(universe_pinned) + 순위 종목, 합쳐서 최대 universe_max_symbols 개
- 보유 중이거나 미체결 주문이 있는 종목은 목록에서 빠져도 계속 본다 (청산 전까지). 빠진 종목은 신규 매수 대상이 아닐 뿐이다
  — 판단은 엔진이 보는 모든 종목에서 하지만, 목록 밖 보유 종목은 매도·청산만 의미가 있다

시점
- 평일 KST 08:50 이후 그날 선정이 없으면 고른다 (하루 1번). 같은 날 재시작하면 저장된 선정을 그대로 쓴다
- 선정 조건(모드·N·항상 포함·1회 매수 금액)이 바뀌면 바로 다시 고른다
- 순위를 받지 못하면 직전 선정(없으면 TRADER_SYMBOLS)을 유지하고 5분 뒤 다시 시도한다

기록: engine_state `universe` (화면이 읽는다) + risk_events UNIVERSE_SELECTED.
네트워크는 stocksim_client(GET) 를 거친다. 금액은 Decimal.
"""

from __future__ import annotations

import logging
import time as _time
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import datetime, time
from decimal import Decimal
from typing import Any

from trader.clock import kst_trade_date, to_kst
from trader.config import Settings
from trader.marketdata.stocksim_client import StockSimClient, StockSimError, dec_or_none
from trader.money import ZERO
from trader.storage.store import TradingStore

log = logging.getLogger(__name__)

UNIVERSE_KEY = "universe"
SELECT_AFTER = time(8, 50)  # KST
RETRY_SECONDS = 300.0
# 순위에서 개요를 확인할 최대 후보 수 (하루 1번이라 호출이 많지 않다)
MAX_CANDIDATES = 30


@dataclass(frozen=True, slots=True)
class Pick:
    symbol: str
    name: str | None = None
    # 외국인 + 기관 순매수 금액 (원)
    score: Decimal | None = None
    foreigner: Decimal | None = None
    institution: Decimal | None = None
    pinned: bool = False

    def record(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "name": self.name,
            "score": _t(self.score),
            "foreigner": _t(self.foreigner),
            "institution": _t(self.institution),
            "pinned": self.pinned,
        }


def _t(v: Decimal | None) -> str | None:
    return None if v is None else format(v, "f")


@dataclass(frozen=True, slots=True)
class SelectionParams:
    mode: str
    max_symbols: int
    pinned: tuple[str, ...]
    order_value: str

    def record(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "max_symbols": self.max_symbols,
            "pinned": list(self.pinned),
            "order_value": self.order_value,
        }


def params_of(s: Settings) -> SelectionParams:
    return SelectionParams(
        s.universe_mode, s.universe_max_symbols, tuple(s.universe_pinned), format(s.strategy_order_value, "f")
    )


def _amounts(items: object, sign: int) -> dict[str, tuple[Decimal, str | None]]:
    out: dict[str, tuple[Decimal, str | None]] = {}
    if not isinstance(items, list):
        return out
    for it in items:
        if not isinstance(it, dict):
            continue
        sym = it.get("symbol")
        amount = dec_or_none(it.get("amount"))
        if not isinstance(sym, str) or not sym.isalnum() or amount is None:
            continue
        name = it.get("name") if isinstance(it.get("name"), str) else None
        out[sym] = (amount * sign, name)
    return out


def _side(doc: Mapping[str, Any]) -> dict[str, tuple[Decimal, str | None]]:
    """한 투자자의 순매수(+)·순매도(-) 금액."""
    out = _amounts(doc.get("netSell"), -1)
    out.update(_amounts(doc.get("netBuy"), 1))
    return out


def combine_rankings(foreigner: Mapping[str, Any], institution: Mapping[str, Any]) -> list[Pick]:
    """외국인·기관 순매수 합이 큰 순. 합이 0 이하이면 뺀다."""
    f = _side(foreigner)
    i = _side(institution)
    picks: list[Pick] = []
    for sym in set(f) | set(i):
        fa, fname = f.get(sym, (None, None))
        ia, iname = i.get(sym, (None, None))
        score = (fa or ZERO) + (ia or ZERO)
        if score <= 0:
            continue
        picks.append(Pick(sym, fname or iname, score, fa, ia))
    picks.sort(key=lambda p: (-(p.score or ZERO), p.symbol))
    return picks


def screen(overview: Mapping[str, Any], order_value: Decimal, near_upper_pct: Decimal) -> str | None:
    """제외 사유. 통과하면 None."""
    if overview.get("securityType") != "STOCK":
        return f"주식 아님 ({overview.get('securityType') or '형식 모름'})"
    if overview.get("tradingSuspended"):
        return "거래정지"
    price = dec_or_none(overview.get("price"))
    if price is None or price <= 0:
        return "현재가 없음"
    if price > order_value:
        return "1주 가격이 1회 매수 금액보다 비쌈"
    upper = dec_or_none(overview.get("upperLimit"))
    if upper is not None and price >= upper * (1 - near_upper_pct):
        return "상한가 근접"
    return None


class UniverseSelector:
    """순위·개요를 받아 종목을 고른다 (네트워크)."""

    def __init__(self, client: StockSimClient) -> None:
        self.client = client

    async def select(
        self, params: SelectionParams, near_upper_pct: Decimal
    ) -> tuple[list[Pick], list[dict[str, str]]]:
        foreigner = await self.client.investor_rankings("foreigner")
        institution = await self.client.investor_rankings("institution")
        ranked = combine_rankings(foreigner, institution)
        picks = [Pick(s, pinned=True) for s in params.pinned][: params.max_symbols]
        chosen = {p.symbol for p in picks}
        excluded: list[dict[str, str]] = []
        order_value = Decimal(params.order_value)
        for cand in ranked[:MAX_CANDIDATES]:
            if len(picks) >= params.max_symbols:
                break
            if cand.symbol in chosen:
                continue
            try:
                ov = await self.client.overview(cand.symbol)
            except StockSimError as e:
                excluded.append({"symbol": cand.symbol, "reason": f"개요 조회 실패: {str(e)[:80]}"})
                continue
            why = screen(ov, order_value, near_upper_pct)
            if why:
                excluded.append({"symbol": cand.symbol, "name": cand.name or "", "reason": why})
                continue
            picks.append(cand)
            chosen.add(cand.symbol)
        return picks, excluded

    async def close(self) -> None:
        await self.client.close()


@dataclass
class UniverseController:
    """오늘 볼 종목. 엔진 감시 루프가 maybe_refresh 를 부르고, 바뀌면 새 목록을 돌려준다."""

    store: TradingStore
    selector: UniverseSelector | None
    fixed_symbols: list[str]
    doc: dict[str, Any] | None = None
    active: list[str] = field(default_factory=list)
    _next_try: float = 0.0

    def __post_init__(self) -> None:
        try:
            self.doc = self.store.get_engine_state(UNIVERSE_KEY)
        except Exception as e:
            log.warning("universe read failed", extra={"fields": {"err": str(e)[:200]}})
            self.doc = None

    # ── 기동 (네트워크 없이) ─────────────────────────────────────────────

    def initial(self, s: Settings, held: Iterable[str]) -> list[str]:
        """기동 때 바로 볼 종목. auto 면 저장된 마지막 선정, 없으면 고정 종목으로 시작해 감시 루프에서 고른다."""
        base = self._picked(s)
        self.active = _merge(base, held)
        return list(self.active)

    def _picked(self, s: Settings) -> list[str]:
        # auto: 마지막 자동 선정 (조건이 바뀌어 다시 고르는 중이거나 실패해도 직전 선정을 유지한다)
        if s.universe_mode == "auto" and self.doc and self.doc.get("mode") == "auto":
            return [str(p["symbol"]) for p in self.doc.get("symbols") or [] if p.get("symbol")]
        return list(self.fixed_symbols)

    # ── 감시 루프 ────────────────────────────────────────────────────────

    async def maybe_refresh(self, s: Settings, held: Iterable[str], now: datetime) -> list[str] | None:
        """볼 종목이 바뀌면 새 목록 (선정·보유 변화), 아니면 None."""
        params = params_of(s)
        if params.mode == "fixed":
            if not self.doc or self.doc.get("mode") != "fixed" or self.doc.get("params") != params.record():
                self._save(params, [Pick(sym, pinned=True) for sym in self.fixed_symbols], [], "fixed", now)
        elif self._need_select(params, now) and _time.monotonic() >= self._next_try:
            await self._select(params, s, now)
        new = _merge(self._picked(s), held)
        if new == self.active:
            return None
        self.active = new
        return list(new)

    def _need_select(self, params: SelectionParams, now: datetime) -> bool:
        if self.selector is None:
            return False
        doc = self.doc
        if not doc or doc.get("mode") != "auto" or doc.get("params") != params.record():
            return True
        k = to_kst(now)
        return (
            doc.get("date") != kst_trade_date(now).isoformat()
            and k.weekday() < 5
            and k.time() >= SELECT_AFTER
        )

    async def _select(self, params: SelectionParams, s: Settings, now: datetime) -> None:
        assert self.selector is not None
        try:
            picks, excluded = await self.selector.select(params, s.risk_near_upper_limit_pct)
        except (StockSimError, KeyError, TypeError, ArithmeticError, ValueError) as e:
            self._next_try = _time.monotonic() + RETRY_SECONDS
            log.warning(
                "universe selection failed — 직전 종목 유지, 5분 뒤 다시 시도",
                extra={"fields": {"err": str(e)[:200]}},
            )
            return
        if not picks:
            self._next_try = _time.monotonic() + RETRY_SECONDS
            log.warning(
                "universe selection empty — 직전 종목 유지", extra={"fields": {"excluded": len(excluded)}}
            )
            return
        self._save(params, picks, excluded, "rankings", now)
        log.warning(
            "universe selected",
            extra={"fields": {"symbols": [p.symbol for p in picks], "excluded": len(excluded)}},
        )
        try:
            self.store.record_risk_event(
                "UNIVERSE_SELECTED",
                now,
                detail={
                    "date": kst_trade_date(now).isoformat(),
                    "symbols": [p.symbol for p in picks],
                    "params": params.record(),
                },
            )
        except Exception as e:
            log.warning("risk event write failed", extra={"fields": {"err": str(e)[:200]}})

    def _save(
        self,
        params: SelectionParams,
        picks: list[Pick],
        excluded: list[dict[str, str]],
        source: str,
        now: datetime,
    ) -> None:
        doc = {
            "date": kst_trade_date(now).isoformat(),
            "mode": params.mode,
            "params": params.record(),
            "source": source,
            "symbols": [p.record() for p in picks],
            "excluded": excluded[:30],
            "at": now.isoformat(),
        }
        self.doc = doc
        try:
            self.store.set_engine_state(UNIVERSE_KEY, doc, now, "engine")
        except Exception as e:
            log.warning("universe write failed", extra={"fields": {"err": str(e)[:200]}})


def _merge(picked: list[str], held: Iterable[str]) -> list[str]:
    """선정 종목(순서 유지) + 목록 밖 보유·미체결 종목."""
    out = list(dict.fromkeys(picked))
    out += sorted(set(held) - set(out))
    return out
