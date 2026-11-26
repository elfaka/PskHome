"""전략 인터페이스.

전략은 봉·지표·시장 맥락·읽기 전용 포트폴리오 정보만 받아 판단(Decision)을 돌려준다.
브로커·DB·주문 게이트웨이를 import 하지 않는다 (tests/test_no_bypass.py 가 검사한다).
진입가·손절·목표가와 주문 여부의 최종 결정은 위험 관리가 한다.

신호
- BUY  : 매수 (신규 진입)
- SELL : 매도 (보유분 축소·정리)
- EXIT : 보유분 전량 청산
- HOLD : 보유 유지
- WAIT : 관망 (신규 진입 안 함)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Protocol

from trader.domain import Bar
from trader.indicators import IndicatorSnapshot
from trader.marketdata.context import MarketContext

Action = Literal["BUY", "SELL", "HOLD", "WAIT", "EXIT"]
ORDER_ACTIONS: frozenset[str] = frozenset({"BUY", "SELL", "EXIT"})


@dataclass(frozen=True, slots=True)
class PortfolioView:
    position_qty: Decimal
    open_buy_qty: Decimal
    open_sell_qty: Decimal


@dataclass(frozen=True, slots=True)
class MarketView:
    """판단 시점에 전략이 볼 수 있는 것 (모두 읽기 전용)."""

    now: datetime
    indicators: IndicatorSnapshot | None = None
    context: MarketContext = field(default_factory=MarketContext)


@dataclass(frozen=True, slots=True)
class Decision:
    action: Action
    reason: str
    qty: Decimal | None = None
    inputs: dict[str, Any] = field(default_factory=dict)
    score: Decimal | None = None
    # 규칙이 매긴 확신도 0~1 (수익 확률이 아니다)
    confidence: Decimal | None = None
    reasons: tuple[str, ...] = ()
    invalidation: tuple[str, ...] = ()
    valid_until: datetime | None = None


class Strategy(Protocol):
    id: str
    warmup_bars: int

    def on_bar(self, bar: Bar, view: PortfolioView, market: MarketView | None = None) -> Decision: ...

    def reset(self, symbol: str) -> None:
        """데이터 누락 등으로 지표를 처음부터 다시 쌓는다."""
        ...
