"""금액·수량 계산 헬퍼. float 는 받지 않는다."""

from __future__ import annotations

from decimal import ROUND_CEILING, ROUND_DOWN, ROUND_FLOOR, ROUND_HALF_UP, Decimal
from typing import Literal

# DB 컬럼 정밀도와 맞춘다 (migrations 참고)
AMOUNT_PLACES = Decimal("0.0001")  # DECIMAL(20,4): 금액·가격
QTY_PLACES = Decimal("0.000001")  # DECIMAL(20,6): 수량
RATE_PLACES = Decimal("0.00000001")  # DECIMAL(10,8): 비율

RoundingMode = Literal["down", "half_up"]

ZERO = Decimal(0)


def D(value: Decimal | int | str) -> Decimal:
    """Decimal 로 변환한다. float 이 들어오면 즉시 실패시킨다 (이진 부동소수 오차 차단)."""
    if isinstance(value, bool):
        raise TypeError("bool 은 금액/수량이 아니다")
    if isinstance(value, float):
        raise TypeError(f"float 금지: {value!r} — 문자열이나 정수로 넘길 것")
    if isinstance(value, Decimal):
        if not value.is_finite():
            raise ValueError(f"유한한 값이 아니다: {value!r}")
        return value
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, str):
        d = Decimal(value.strip())
        if not d.is_finite():
            raise ValueError(f"유한한 값이 아니다: {value!r}")
        return d
    raise TypeError(f"지원하지 않는 타입: {type(value).__name__}")


def q_amount(value: Decimal) -> Decimal:
    return value.quantize(AMOUNT_PLACES, rounding=ROUND_HALF_UP)


def q_qty(value: Decimal) -> Decimal:
    return value.quantize(QTY_PLACES, rounding=ROUND_DOWN)


def round_cash(value: Decimal, mode: RoundingMode, places: int = 0) -> Decimal:
    """수수료·세금을 원 단위 등으로 반올림한다. 규칙(절사/반올림)은 설정값으로 받는다."""
    exp = Decimal(1).scaleb(-places)
    return value.quantize(exp, rounding=ROUND_DOWN if mode == "down" else ROUND_HALF_UP)


def round_price_against_us(price: Decimal, *, buying: bool, places: int = 0) -> Decimal:
    """체결가를 호가 자릿수로 맞출 때 보수적으로(내게 불리하게) 올림/내림한다."""
    exp = Decimal(1).scaleb(-places)
    return price.quantize(exp, rounding=ROUND_CEILING if buying else ROUND_FLOOR)


def floor_shares(value: Decimal) -> Decimal:
    """정수 주식 수로 내림."""
    return value.to_integral_value(rounding=ROUND_FLOOR)
