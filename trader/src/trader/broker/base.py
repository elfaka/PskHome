"""Broker 인터페이스. 증권사 구현체(PaperBroker, 이후 TossBroker 등)는 이것만 따른다.

규칙
- 전략은 Broker 를 직접 받지 않는다. place_order 는 주문 게이트웨이만 호출한다.
- place_order 는 RiskApproval 이 없으면 거부한다 (`trader.risk.approval.verify`).
- 같은 client_order_id 로 두 번 주문하면 거부한다.
- 실시간 구독은 async iterator. 끝나면(시세 종료·연결 종료) iterator 가 끝난다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from decimal import Decimal
from typing import Protocol

from trader.domain import AccountBalance, ExecutionEvent, OrderRequest, OrderState, Quote
from trader.risk.approval import RiskApproval


class BrokerError(Exception):
    """브로커 호출 실패. 주문 접수 여부가 불확실하면 uncertain=True."""

    def __init__(self, message: str, *, uncertain: bool = False) -> None:
        super().__init__(message)
        self.uncertain = uncertain


class OrderNotFound(BrokerError):
    pass


class Broker(Protocol):
    name: str

    async def get_quote(self, symbol: str) -> Quote: ...

    async def get_balance(self) -> AccountBalance: ...

    async def place_order(self, req: OrderRequest, approval: RiskApproval) -> OrderState: ...

    async def cancel_order(self, client_order_id: str) -> OrderState: ...

    async def get_order(self, client_order_id: str) -> OrderState:
        """없으면 OrderNotFound."""
        ...

    async def list_open_orders(self) -> list[OrderState]: ...

    def subscribe_quotes(self, symbols: list[str]) -> AsyncIterator[Quote]: ...

    def subscribe_executions(self) -> AsyncIterator[ExecutionEvent]: ...

    async def close(self) -> None: ...


class CostModel(Protocol):
    """수수료·세금 계산. 구현체는 설정값으로만 계산한다."""

    def commission(self, side_is_buy: bool, notional: Decimal) -> Decimal: ...

    def tax(self, side_is_buy: bool, notional: Decimal) -> Decimal: ...
