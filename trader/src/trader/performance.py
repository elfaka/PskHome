"""신호 성과 평가 — 신호 이후 실제 가격 흐름을 기록해 신호가 쓸모 있었는지 사후에 본다.

horizon: 5분·15분·30분 뒤, 그리고 그날 장 마감(session_close).
direction: BUY=+1 (오르면 좋음), SELL/EXIT=-1 (내리면 좋음 — 판 뒤에 떨어졌으면 잘 판 것).
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal
from typing import Any

from trader.clock import KST, to_kst
from trader.domain import Bar

PCT = Decimal("0.000001")
HORIZONS: tuple[tuple[str, timedelta], ...] = (
    ("5m", timedelta(minutes=5)),
    ("15m", timedelta(minutes=15)),
    ("30m", timedelta(minutes=30)),
)


def horizons_for(signal_ts: datetime, session_close: time) -> list[tuple[str, datetime]]:
    out = [(name, signal_ts + d) for name, d in HORIZONS]
    close = datetime.combine(to_kst(signal_ts).date(), session_close, KST)
    if close > signal_ts:
        out.append(("close", close))
    return out


def direction_of(action: str) -> int:
    return 1 if action == "BUY" else -1


def evaluate(ref: Decimal, direction: int, bars: list[Bar]) -> dict[str, Any]:
    """bars: 신호 이후 ~ 만기 이전 봉 (오래된 순)."""
    if not bars or ref <= 0:
        return {"status": "NO_DATA"}
    close = bars[-1].close
    hi = max(b.high for b in bars)
    lo = min(b.low for b in bars)

    def pct(x: Decimal) -> Decimal:
        return (x / ref).quantize(PCT)

    if direction > 0:
        ret, mfe, mae = pct(close - ref), pct(hi - ref), pct(lo - ref)
    else:
        ret, mfe, mae = pct(ref - close), pct(ref - lo), pct(ref - hi)
    return {
        "status": "DONE",
        "close_price": close,
        "max_price": hi,
        "min_price": lo,
        "return_pct": ret,
        "mfe_pct": mfe,
        "mae_pct": mae,
    }
