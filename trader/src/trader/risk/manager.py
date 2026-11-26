"""위험 관리. 모든 주문은 여기를 통과해야 RiskApproval 을 받는다.

판단에 필요한 정보가 하나라도 없으면 거부한다 (fail closed).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
from decimal import Decimal

from trader.clock import to_kst
from trader.domain import AccountBalance, OrderRequest, OrderState, Quote, Side
from trader.money import ZERO, floor_shares
from trader.risk.approval import RiskApproval, _issue
from trader.risk.health import TradingHealth

BPS = Decimal(10000)


@dataclass(frozen=True, slots=True)
class RiskLimits:
    max_order_value: Decimal
    max_position_value: Decimal
    daily_loss_limit: Decimal
    max_quote_age: timedelta
    approval_ttl: timedelta
    slippage_bps: Decimal
    commission_rate_buy: Decimal
    enforce_market_hours: bool
    market_open: time
    market_close: time


@dataclass(frozen=True, slots=True)
class RiskContext:
    now: datetime
    halted: bool
    health: TradingHealth
    balance: AccountBalance
    open_orders: list[OrderState]
    # 평가금액 계산용 종목별 최근 시세
    quotes: dict[str, Quote] = field(default_factory=dict)
    day_start_equity: Decimal | None = None


@dataclass(frozen=True, slots=True)
class RiskDecision:
    approved: bool
    code: str
    reason: str
    approval: RiskApproval | None = None
    order_value: Decimal | None = None


def equity(balance: AccountBalance, quotes: dict[str, Quote]) -> Decimal | None:
    """현금 + 보유 종목 평가금액. 보유 종목의 시세가 없으면 None (계산 불가)."""
    total = balance.cash
    for sym, p in balance.positions.items():
        if p.qty == 0:
            continue
        q = quotes.get(sym)
        if q is None:
            return None
        total += p.qty * q.price
    return total


class RiskManager:
    def __init__(self, limits: RiskLimits) -> None:
        self.limits = limits

    def _reject(self, code: str, reason: str, value: Decimal | None = None) -> RiskDecision:
        return RiskDecision(False, code, reason, order_value=value)

    def evaluate(self, req: OrderRequest, ctx: RiskContext) -> RiskDecision:
        lim = self.limits

        # 1) 즉시 중지·거래 불가 상태
        if ctx.halted:
            return self._reject("HALTED", "킬스위치가 켜져 있다")
        blocked = ctx.health.block_reason(req.symbol)
        if blocked:
            return self._reject(*blocked)

        # 2) 시세 신선도
        q = ctx.quotes.get(req.symbol)
        if q is None:
            return self._reject("NO_QUOTE", "시세가 없다")
        age = ctx.now - q.ts
        if age > lim.max_quote_age or age < -lim.max_quote_age:
            return self._reject("STALE_QUOTE", f"시세가 오래됐다 ({age.total_seconds():.0f}s)")

        # 3) 장 시간
        if lim.enforce_market_hours:
            k = to_kst(ctx.now)
            if k.weekday() >= 5 or not (lim.market_open <= k.time() < lim.market_close):
                return self._reject("MARKET_CLOSED", "장 시간이 아니다")

        # 4) 수량 형식
        if req.qty != floor_shares(req.qty):
            return self._reject("INVALID_QTY", "주식 수량은 정수여야 한다")

        # 5) 주문 금액 (보수적으로 추정)
        slip = lim.slippage_bps / BPS
        if req.side is Side.BUY:
            ref = req.limit_price if req.limit_price is not None else (q.ask or q.price) * (1 + slip)
        else:
            ref = req.limit_price if req.limit_price is not None else q.price
        value = ref * req.qty
        if value > lim.max_order_value:
            return self._reject(
                "MAX_ORDER_VALUE", f"1회 주문 한도 초과 ({value} > {lim.max_order_value})", value
            )

        held = ctx.balance.qty(req.symbol)
        same_side_open = sum(
            (o.remaining_qty for o in ctx.open_orders if o.symbol == req.symbol and o.side is req.side),
            ZERO,
        )
        if req.side is Side.BUY:
            # 6) 종목별 보유 한도 (보유 + 미체결 매수 + 이번 주문)
            exposure = (held + same_side_open + req.qty) * ref
            if exposure > lim.max_position_value:
                return self._reject(
                    "MAX_POSITION_VALUE",
                    f"종목 보유 한도 초과 ({exposure} > {lim.max_position_value})",
                    value,
                )
            # 7) 현금 (미체결 매수 예약분 차감)
            reserved = sum(
                (o.remaining_qty * (o.limit_price or ref) for o in ctx.open_orders if o.side is Side.BUY),
                ZERO,
            )
            need = value * (1 + lim.commission_rate_buy)
            if need > ctx.balance.cash - reserved:
                return self._reject("INSUFFICIENT_CASH", "주문 가능 현금 부족", value)
        else:
            # 공매도 금지: 보유 - 미체결 매도 >= 이번 주문
            if req.qty > held - same_side_open:
                return self._reject("INSUFFICIENT_POSITION", "매도 가능 수량 부족", value)

        # 8) 하루 손실 한도 (KST 거래일 시작 평가금액 대비, 실현+평가 손익)
        if ctx.day_start_equity is None:
            return self._reject("NO_DAY_BASELINE", "오늘 기준 평가금액이 없다", value)
        eq = equity(ctx.balance, ctx.quotes)
        if eq is None:
            return self._reject("NO_QUOTE", "보유 종목 시세가 없어 평가금액을 계산할 수 없다", value)
        loss = ctx.day_start_equity - eq
        if loss >= lim.daily_loss_limit:
            return self._reject(
                "DAILY_LOSS_LIMIT", f"하루 손실 한도 도달 ({loss} >= {lim.daily_loss_limit})", value
            )

        return RiskDecision(
            True, "APPROVED", "ok", approval=_issue(req, ctx.now, lim.approval_ttl), order_value=value
        )
