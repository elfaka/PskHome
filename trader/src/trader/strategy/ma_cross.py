"""예시 전략: 단순 이동평균 교차.

- 골든크로스(단기 MA 가 장기 MA 를 아래→위로 돌파): 보유·미체결 매수가 없으면 매수
  수량 = floor(order_value / 종가)
- 데드크로스(위→아래): 매도 가능한 보유 수량 전부 매도
- 그 외: 관망
"""

from __future__ import annotations

from collections import deque
from decimal import Decimal

from trader.domain import Bar
from trader.money import AMOUNT_PLACES, ZERO, floor_shares
from trader.strategy.base import Decision, MarketView, PortfolioView


class MovingAverageCross:
    def __init__(self, fast: int, slow: int, order_value: Decimal, strategy_id: str = "ma_cross") -> None:
        if not 1 <= fast < slow:
            raise ValueError("1 <= fast < slow")
        self.id = strategy_id
        self.fast = fast
        self.slow = slow
        self.order_value = order_value
        # 첫 교차 판단에는 직전 차이값이 필요하므로 slow + 1 개
        self.warmup_bars = slow + 1
        self._closes: dict[str, deque[Decimal]] = {}
        self._prev_diff: dict[str, Decimal] = {}

    def reset(self, symbol: str) -> None:
        self._closes.pop(symbol, None)
        self._prev_diff.pop(symbol, None)

    @staticmethod
    def _mean(values: list[Decimal]) -> Decimal:
        return (sum(values, ZERO) / len(values)).quantize(AMOUNT_PLACES)

    def on_bar(self, bar: Bar, view: PortfolioView, market: MarketView | None = None) -> Decision:
        closes = self._closes.setdefault(bar.symbol, deque(maxlen=self.slow))
        closes.append(bar.close)
        if len(closes) < self.slow:
            return Decision("HOLD", f"warming up {len(closes)}/{self.slow}")

        window = list(closes)
        fast_ma = self._mean(window[-self.fast :])
        slow_ma = self._mean(window)
        diff = fast_ma - slow_ma
        prev = self._prev_diff.get(bar.symbol)
        self._prev_diff[bar.symbol] = diff
        inputs = {
            "close": bar.close,
            "fast_ma": fast_ma,
            "slow_ma": slow_ma,
            "prev_diff": prev,
            "diff": diff,
            "position": view.position_qty,
            "open_buy": view.open_buy_qty,
            "open_sell": view.open_sell_qty,
        }
        if prev is None:
            return Decision("HOLD", "first full window", inputs=inputs)

        if prev <= 0 < diff:
            if view.position_qty + view.open_buy_qty > 0:
                return Decision("HOLD", "golden cross but already holding", inputs=inputs)
            qty = floor_shares(self.order_value / bar.close)
            if qty < 1:
                return Decision("HOLD", "golden cross but order value < 1 share", inputs=inputs)
            return Decision("BUY", "golden cross", qty=qty, inputs=inputs)

        if prev >= 0 > diff:
            sellable = view.position_qty - view.open_sell_qty
            if sellable <= 0:
                return Decision("HOLD", "dead cross but nothing to sell", inputs=inputs)
            return Decision("SELL", "dead cross", qty=sellable, inputs=inputs)

        return Decision("HOLD", "no cross", inputs=inputs)
