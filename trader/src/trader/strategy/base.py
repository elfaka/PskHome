"""전략 인터페이스.

전략은 봉과 읽기 전용 포트폴리오 정보만 받아 판단(Decision)을 돌려준다.
브로커·DB·주문 게이트웨이를 import 하지 않는다 (tests/test_no_bypass.py 가 검사).
주문 여부와 금액의 최종 결정은 위험 관리가 한다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Literal, Protocol

from trader.domain import Bar

Action = Literal["BUY", "SELL", "HOLD"]


@dataclass(frozen=True, slots=True)
class PortfolioView:
    position_qty: Decimal
    open_buy_qty: Decimal
    open_sell_qty: Decimal


@dataclass(frozen=True, slots=True)
class Decision:
    action: Action
    reason: str
    qty: Decimal | None = None
    inputs: dict[str, Any] = field(default_factory=dict)


class Strategy(Protocol):
    id: str
    warmup_bars: int

    def on_bar(self, bar: Bar, view: PortfolioView) -> Decision: ...

    def reset(self, symbol: str) -> None:
        """데이터 누락 등으로 지표를 처음부터 다시 쌓는다."""
        ...
