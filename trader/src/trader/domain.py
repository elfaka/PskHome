"""도메인 타입. 증권사와 무관하다. 금액·수량은 전부 Decimal, 시각은 tz-aware UTC."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from trader.clock import ensure_utc
from trader.money import ZERO


class Side(StrEnum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(StrEnum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"


class TimeInForce(StrEnum):
    DAY = "DAY"


class OrderStatus(StrEnum):
    # DB 에 기록했지만 아직 브로커 접수 확인 전
    PENDING_NEW = "PENDING_NEW"
    NEW = "NEW"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    PENDING_CANCEL = "PENDING_CANCEL"
    FILLED = "FILLED"
    CANCELED = "CANCELED"
    REJECTED = "REJECTED"

    @property
    def is_open(self) -> bool:
        return self in OPEN_STATUSES


OPEN_STATUSES = frozenset(
    {OrderStatus.PENDING_NEW, OrderStatus.NEW, OrderStatus.PARTIALLY_FILLED, OrderStatus.PENDING_CANCEL}
)


def _check_ts(ts: datetime) -> None:
    ensure_utc(ts)


@dataclass(frozen=True, slots=True)
class Quote:
    """체결 시세 1건(틱). volume 은 이 틱에서 거래된 수량."""

    symbol: str
    ts: datetime
    price: Decimal
    volume: Decimal
    bid: Decimal | None = None
    ask: Decimal | None = None
    source: str = "unknown"

    def __post_init__(self) -> None:
        _check_ts(self.ts)


@dataclass(frozen=True, slots=True)
class Bar:
    symbol: str
    interval_s: int
    start_ts: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal

    def __post_init__(self) -> None:
        _check_ts(self.start_ts)


@dataclass(frozen=True, slots=True)
class OrderRequest:
    client_order_id: str
    symbol: str
    side: Side
    order_type: OrderType
    qty: Decimal
    limit_price: Decimal | None = None
    tif: TimeInForce = TimeInForce.DAY
    strategy_id: str | None = None

    def __post_init__(self) -> None:
        if not self.client_order_id or len(self.client_order_id) > 64:
            raise ValueError("client_order_id 는 1~64자")
        if self.qty <= ZERO:
            raise ValueError("수량은 0보다 커야 한다")
        if self.order_type is OrderType.LIMIT and (self.limit_price is None or self.limit_price <= ZERO):
            raise ValueError("지정가 주문에는 0보다 큰 limit_price 가 필요하다")
        if self.order_type is OrderType.MARKET and self.limit_price is not None:
            raise ValueError("시장가 주문에는 limit_price 를 두지 않는다")

    def fingerprint(self) -> str:
        """위험 관리 승인과 주문 내용을 묶는 해시. 승인 후 내용이 바뀌면 일치하지 않는다."""
        canon = "|".join(
            [
                self.client_order_id,
                self.symbol,
                self.side.value,
                self.order_type.value,
                format(self.qty.normalize(), "f"),
                "" if self.limit_price is None else format(self.limit_price.normalize(), "f"),
                self.tif.value,
            ]
        )
        return hashlib.sha256(canon.encode()).hexdigest()


@dataclass(frozen=True, slots=True)
class OrderState:
    client_order_id: str
    symbol: str
    side: Side
    order_type: OrderType
    qty: Decimal
    limit_price: Decimal | None
    status: OrderStatus
    filled_qty: Decimal = ZERO
    avg_fill_price: Decimal | None = None
    broker_order_id: str | None = None
    reject_reason: str | None = None
    tif: TimeInForce = TimeInForce.DAY
    strategy_id: str | None = None
    # DB 에서 읽은 주문에만 있다 (DAY 주문 만료 판단용)
    created_at: datetime | None = None

    @property
    def remaining_qty(self) -> Decimal:
        return self.qty - self.filled_qty


@dataclass(frozen=True, slots=True)
class Fill:
    exec_id: str
    client_order_id: str
    symbol: str
    side: Side
    ts: datetime
    qty: Decimal
    price: Decimal
    commission: Decimal
    tax: Decimal
    slippage: Decimal = ZERO

    def __post_init__(self) -> None:
        _check_ts(self.ts)
        if self.qty <= ZERO or self.price <= ZERO:
            raise ValueError("체결 수량·가격은 0보다 커야 한다")


class ExecKind(StrEnum):
    ACCEPTED = "ACCEPTED"
    FILL = "FILL"
    CANCELED = "CANCELED"
    REJECTED = "REJECTED"


@dataclass(frozen=True, slots=True)
class ExecutionEvent:
    """브로커가 보내는 주문 상태 변화. FILL 이면 fill 이 있다."""

    kind: ExecKind
    client_order_id: str
    ts: datetime
    order: OrderState
    fill: Fill | None = None
    reason: str | None = None

    def __post_init__(self) -> None:
        _check_ts(self.ts)
        if (self.kind is ExecKind.FILL) != (self.fill is not None):
            raise ValueError("FILL 이벤트에만 fill 이 있어야 한다")


@dataclass(frozen=True, slots=True)
class Position:
    symbol: str
    qty: Decimal
    avg_price: Decimal
    realized_pnl: Decimal = ZERO


@dataclass(frozen=True, slots=True)
class AccountBalance:
    cash: Decimal
    positions: dict[str, Position] = field(default_factory=dict)

    def qty(self, symbol: str) -> Decimal:
        p = self.positions.get(symbol)
        return p.qty if p else ZERO
