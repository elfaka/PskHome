"""위험 관리. 모든 주문은 여기를 통과해야 RiskApproval 을 받는다.

판단에 필요한 정보가 하나라도 없으면 거부한다 (fail closed).

매수(신규 진입)
- 킬스위치·엔진/DB/데이터 이상·시세 신선도·장 시간·진입 마감 시각
- 정수 수량, 1회 주문 금액, 종목별 보유 한도, 현금
- 호가 스프레드, 상한가 근접 (공급부가 상·하한가를 줄 때 — 주는데 값이 없으면 거부)
- 손절·목표가 = 진입가 ∓ ATR × 배수. 수수료·세금·슬리피지를 뺀 손익비가 기준 미만이면 거부
- 하루 손실 한도 (KST 거래일 시작 평가금액 대비, 실현+평가)

매도(보유분 축소 — 공매도는 없다)
- 위험을 줄이는 주문이므로 1회 금액·하루 손실·진입 마감·스프레드·데이터 이상(시세는 신선해야 함)으로 막지 않는다
- 킬스위치·엔진/DB 오류·시세 신선도·장 시간·수량 검사는 그대로 적용한다
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal
from typing import Any

from trader.clock import to_kst
from trader.domain import AccountBalance, OrderRequest, OrderState, Quote, Side
from trader.money import ZERO, floor_shares, q_amount
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
    commission_rate_sell: Decimal = ZERO
    sell_tax_rate: Decimal = ZERO
    # 장중 규칙: 이 시각(KST) 이후 신규 매수 금지. None 이면 끔
    entry_cutoff: time | None = None
    # ATR 손절·목표가. require_atr_stop 이면 ATR 이 없을 때 매수를 막는다
    require_atr_stop: bool = True
    atr_stop_mult: Decimal = Decimal("1.5")
    atr_take_mult: Decimal = Decimal("3")
    min_risk_reward: Decimal = Decimal("1.5")
    max_spread_bps: Decimal | None = Decimal(30)
    # 상한가까지 이 비율 안쪽이면 매수 금지
    near_upper_limit_pct: Decimal = Decimal("0.02")
    # 손절·목표가를 호가 자릿수로 맞춘다 (원화 0). 손절은 올림, 목표는 내림 — 둘 다 보수적으로
    price_decimals: int = 0
    # 동시에 보유(또는 미체결 매수)할 수 있는 종목 수. None 이면 제한 없음. 이미 가진 종목 추가 매수는 세지 않는다
    max_open_positions: int | None = None


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
    atr: dict[str, Decimal] = field(default_factory=dict)
    upper_limits: dict[str, Decimal] = field(default_factory=dict)
    provides_price_limits: bool = False


@dataclass(frozen=True, slots=True)
class RiskDecision:
    approved: bool
    code: str
    reason: str
    approval: RiskApproval | None = None
    order_value: Decimal | None = None
    # 매수 승인 시 진입가·손절·목표가·손익비 (판단 기록에 남긴다)
    levels: dict[str, Any] = field(default_factory=dict)


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


def risk_reward(
    entry: Decimal, stop: Decimal, take: Decimal, *, buy_cost: Decimal, sell_cost: Decimal
) -> Decimal | None:
    """1주 기준, 비용 차감 손익비. 계산할 수 없으면 None.

    buy_cost: 매수 수수료율, sell_cost: 매도 수수료율 + 거래세율 + 슬리피지율
    """
    reward = take - entry - entry * buy_cost - take * sell_cost
    risk = entry - stop + entry * buy_cost + stop * sell_cost
    if stop <= 0 or risk <= 0:
        return None
    return reward / risk


class RiskManager:
    def __init__(self, limits: RiskLimits) -> None:
        self.limits = limits

    def _reject(self, code: str, reason: str, value: Decimal | None = None) -> RiskDecision:
        return RiskDecision(False, code, reason, order_value=value)

    def evaluate(self, req: OrderRequest, ctx: RiskContext) -> RiskDecision:
        lim = self.limits
        buying = req.side is Side.BUY

        # 1) 즉시 중지·거래 불가 상태
        if ctx.halted:
            return self._reject("HALTED", "킬스위치가 켜져 있다")
        blocked = ctx.health.block_reason(req.symbol)
        if blocked and (buying or blocked[0] != "DATA_UNHEALTHY"):
            return self._reject(*blocked)

        # 2) 시세 신선도 (매도도 시장가 기준가가 필요하다)
        q = ctx.quotes.get(req.symbol)
        if q is None:
            return self._reject("NO_QUOTE", "시세가 없다")
        age = ctx.now - q.ts
        if age > lim.max_quote_age or age < -lim.max_quote_age:
            return self._reject("STALE_QUOTE", f"시세가 오래됐다 ({age.total_seconds():.0f}s)")

        # 3) 장 시간 · 진입 마감
        k = to_kst(ctx.now)
        if lim.enforce_market_hours and (
            k.weekday() >= 5 or not (lim.market_open <= k.time() < lim.market_close)
        ):
            return self._reject("MARKET_CLOSED", "장 시간이 아니다")
        if buying and lim.entry_cutoff is not None and k.time() >= lim.entry_cutoff:
            return self._reject("ENTRY_CUTOFF", f"{lim.entry_cutoff:%H:%M} 이후 신규 진입 금지")

        # 4) 수량 형식
        if req.qty != floor_shares(req.qty):
            return self._reject("INVALID_QTY", "주식 수량은 정수여야 한다")

        held = ctx.balance.qty(req.symbol)
        same_side_open = sum(
            (o.remaining_qty for o in ctx.open_orders if o.symbol == req.symbol and o.side is req.side),
            ZERO,
        )
        slip = lim.slippage_bps / BPS

        if not buying:
            # 공매도 금지: 보유 - 미체결 매도 >= 이번 주문. 통과하면 위험을 줄이는 주문이다
            ref = req.limit_price if req.limit_price is not None else q.price
            value = ref * req.qty
            if req.qty > held - same_side_open:
                return self._reject("INSUFFICIENT_POSITION", "매도 가능 수량 부족", value)
            return RiskDecision(
                True,
                "APPROVED",
                "reducing",
                approval=_issue(req, ctx.now, lim.approval_ttl),
                order_value=value,
            )

        # ── 이하 신규 매수 ──
        ref = req.limit_price if req.limit_price is not None else (q.ask or q.price) * (1 + slip)
        value = ref * req.qty

        # 5) 호가 스프레드
        if lim.max_spread_bps is not None and q.bid is not None and q.ask is not None and q.bid > 0:
            mid = (q.bid + q.ask) / 2
            spread = (q.ask - q.bid) / mid * BPS
            if spread > lim.max_spread_bps:
                return self._reject(
                    "WIDE_SPREAD", f"호가 스프레드 {spread:.1f}bp > {lim.max_spread_bps}bp", value
                )

        # 6) 상한가 근접
        upper = ctx.upper_limits.get(req.symbol)
        if ctx.provides_price_limits and upper is None:
            return self._reject("NO_PRICE_LIMIT", "상·하한가 정보가 없다", value)
        if upper is not None and (q.ask or q.price) >= upper * (1 - lim.near_upper_limit_pct):
            return self._reject("NEAR_UPPER_LIMIT", f"상한가 {upper} 근접", value)

        # 7) 1회 주문 금액
        if value > lim.max_order_value:
            return self._reject(
                "MAX_ORDER_VALUE", f"1회 주문 한도 초과 ({value} > {lim.max_order_value})", value
            )

        # 7-1) 동시 보유 종목 수 (이 종목을 빼고, 보유 중이거나 미체결 매수가 있는 종목)
        if lim.max_open_positions is not None and held + same_side_open == ZERO:
            others = {s for s, p in ctx.balance.positions.items() if p.qty > 0 and s != req.symbol}
            others |= {o.symbol for o in ctx.open_orders if o.side is Side.BUY and o.symbol != req.symbol}
            if len(others) >= lim.max_open_positions:
                return self._reject(
                    "MAX_OPEN_POSITIONS",
                    f"동시 보유 종목 수 한도 ({len(others)} >= {lim.max_open_positions})",
                    value,
                )

        # 8) 종목별 보유 한도 (보유 + 미체결 매수 + 이번 주문)
        exposure = (held + same_side_open + req.qty) * ref
        if exposure > lim.max_position_value:
            return self._reject(
                "MAX_POSITION_VALUE", f"종목 보유 한도 초과 ({exposure} > {lim.max_position_value})", value
            )

        # 9) 현금 (미체결 매수 예약분 차감)
        reserved = sum(
            (o.remaining_qty * (o.limit_price or ref) for o in ctx.open_orders if o.side is Side.BUY),
            ZERO,
        )
        if value * (1 + lim.commission_rate_buy) > ctx.balance.cash - reserved:
            return self._reject("INSUFFICIENT_CASH", "주문 가능 현금 부족", value)

        # 10) 손절·목표가·손익비 (ATR)
        levels: dict[str, Any] = {"entry_price": q_amount(ref)}
        atr = ctx.atr.get(req.symbol)
        if atr is None or atr <= 0:
            if lim.require_atr_stop:
                return self._reject("NO_STOP", "ATR 이 없어 손절 기준을 계산할 수 없다", value)
        else:
            exp = Decimal(1).scaleb(-lim.price_decimals)
            stop = (ref - atr * lim.atr_stop_mult).quantize(exp, rounding=ROUND_CEILING)
            take = (ref + atr * lim.atr_take_mult).quantize(exp, rounding=ROUND_FLOOR)
            rr = risk_reward(
                ref,
                stop,
                take,
                buy_cost=lim.commission_rate_buy,
                sell_cost=lim.commission_rate_sell + lim.sell_tax_rate + slip,
            )
            if rr is None:
                return self._reject("NO_STOP", "손절가를 계산할 수 없다", value)
            levels.update(
                stop_loss=q_amount(stop),
                take_profit=q_amount(take),
                risk_reward=rr.quantize(Decimal("0.0001")),
            )
            if rr < lim.min_risk_reward:
                return RiskDecision(
                    False,
                    "LOW_RISK_REWARD",
                    f"비용 차감 손익비 {rr:.2f} < {lim.min_risk_reward}",
                    order_value=value,
                    levels=levels,
                )

        # 11) 하루 손실 한도
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
            True,
            "APPROVED",
            "ok",
            approval=_issue(req, ctx.now, lim.approval_ttl),
            order_value=value,
            levels=levels,
        )
