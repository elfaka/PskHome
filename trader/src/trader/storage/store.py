"""거래 기록 저장소 (MySQL).

엔진·게이트웨이·복구는 `TradingStore` 프로토콜에만 의존한다. 구현은 `SqlTradingStore` 하나다.
기록 실패는 예외로 올라가며, 호출 측은 신규 주문을 멈춘다.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Protocol

from sqlalchemy import Engine, and_, func, insert, select, text, update
from sqlalchemy.engine import Connection
from sqlalchemy.exc import IntegrityError

from trader.clock import from_db, to_db
from trader.domain import (
    OPEN_STATUSES,
    AccountBalance,
    Bar,
    Fill,
    OrderRequest,
    OrderState,
    OrderStatus,
    OrderType,
    Position,
    Quote,
    Side,
    TimeInForce,
)
from trader.money import ZERO, q_amount, q_qty
from trader.storage import models as m


class DuplicateOrderError(Exception):
    """같은 client_order_id 가 이미 있다."""


class StoreConsistencyError(Exception):
    """DB 기록과 브로커 이벤트가 맞지 않는다. 엔진은 멈춰야 한다."""


def jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [jsonable(v) for v in value]
    return value


@dataclass(frozen=True, slots=True)
class Mismatch:
    kind: str
    detail: dict[str, Any]


class TradingStore(Protocol):
    def ping(self) -> None: ...
    def ensure_account(
        self, name: str, broker: str, currency: str, initial_cash: Decimal, now: datetime
    ) -> int: ...
    def load_balance(self, account_id: int) -> AccountBalance: ...
    def order_exists(self, client_order_id: str) -> bool: ...
    def insert_order(
        self, account_id: int, broker: str, req: OrderRequest, decision_id: int | None, now: datetime
    ) -> None: ...
    def update_order(
        self, state: OrderState, event: str, now: datetime, detail: dict[str, Any] | None = None
    ) -> None: ...
    def apply_fill(self, account_id: int, fill: Fill, status: OrderStatus, now: datetime) -> bool: ...
    def get_order(self, client_order_id: str) -> OrderState | None: ...
    def list_open_orders(self, account_id: int) -> list[OrderState]: ...
    def record_quotes(self, quotes: Sequence[Quote], received_at: datetime) -> None: ...
    def record_bar(self, bar: Bar) -> None: ...
    def recent_bars(self, symbol: str, interval_s: int, limit: int) -> list[Bar]: ...
    def insert_decision(
        self,
        *,
        ts: datetime,
        strategy_id: str,
        symbol: str,
        bar_ts: datetime,
        action: str,
        reason: str,
        inputs: dict[str, Any],
    ) -> int: ...
    def update_decision_risk(
        self, decision_id: int, result: str, reason: str | None, client_order_id: str | None
    ) -> None: ...
    def record_risk_event(
        self,
        kind: str,
        now: datetime,
        *,
        symbol: str | None = None,
        client_order_id: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> None: ...
    def get_engine_state(self, key: str) -> dict[str, Any] | None: ...
    def set_engine_state(self, key: str, value: dict[str, Any], now: datetime, by: str) -> None: ...
    def get_daily_start_equity(self, account_id: int, trade_date: date) -> Decimal | None: ...
    def set_daily_start_equity(
        self, account_id: int, trade_date: date, equity: Decimal, now: datetime
    ) -> Decimal: ...
    def check_consistency(self, account_id: int) -> list[Mismatch]: ...


_RANK = {
    OrderStatus.PENDING_NEW: 0,
    OrderStatus.NEW: 1,
    OrderStatus.PARTIALLY_FILLED: 2,
    OrderStatus.PENDING_CANCEL: 2,
    OrderStatus.FILLED: 3,
    OrderStatus.CANCELED: 3,
    OrderStatus.REJECTED: 3,
}


def status_rank(s: OrderStatus) -> int:
    return _RANK[s]


def _row_to_order(r: Any) -> OrderState:
    return OrderState(
        client_order_id=r.client_order_id,
        symbol=r.symbol,
        side=Side(r.side),
        order_type=OrderType(r.order_type),
        qty=r.qty,
        limit_price=r.limit_price,
        status=OrderStatus(r.status),
        filled_qty=r.filled_qty,
        avg_fill_price=r.avg_fill_price,
        broker_order_id=r.broker_order_id,
        reject_reason=r.reject_reason,
        tif=TimeInForce(r.tif),
        strategy_id=r.strategy_id,
        created_at=from_db(r.created_at),
    )


class SqlTradingStore:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    # ── 공통 ─────────────────────────────────────────────────────────────

    def ping(self) -> None:
        with self._engine.connect() as c:
            c.execute(text("SELECT 1"))

    # ── 계좌·잔고 ────────────────────────────────────────────────────────

    def ensure_account(
        self, name: str, broker: str, currency: str, initial_cash: Decimal, now: datetime
    ) -> int:
        with self._engine.begin() as c:
            row = c.execute(
                select(m.accounts.c.id, m.accounts.c.broker).where(m.accounts.c.name == name)
            ).first()
            if row is not None:
                if row.broker != broker:
                    raise StoreConsistencyError(f"계좌 {name} 의 브로커가 다르다: {row.broker} != {broker}")
                return int(row.id)
            res = c.execute(
                insert(m.accounts).values(name=name, broker=broker, currency=currency, created_at=to_db(now))
            )
            account_id = int(res.inserted_primary_key[0])  # type: ignore[index]
            c.execute(
                insert(m.cash_ledger).values(
                    account_id=account_id,
                    ts=to_db(now),
                    amount=q_amount(initial_cash),
                    kind="DEPOSIT",
                    memo="initial paper cash",
                )
            )
            return account_id

    def _cash(self, c: Connection, account_id: int) -> Decimal:
        v = c.execute(
            select(func.coalesce(func.sum(m.cash_ledger.c.amount), 0)).where(
                m.cash_ledger.c.account_id == account_id
            )
        ).scalar_one()
        return Decimal(v)

    def load_balance(self, account_id: int) -> AccountBalance:
        with self._engine.connect() as c:
            cash = self._cash(c, account_id)
            rows = c.execute(
                select(m.positions).where(
                    and_(m.positions.c.account_id == account_id, m.positions.c.qty != 0)
                )
            ).all()
        return AccountBalance(
            cash=cash,
            positions={
                r.symbol: Position(
                    symbol=r.symbol, qty=r.qty, avg_price=r.avg_price, realized_pnl=r.realized_pnl
                )
                for r in rows
            },
        )

    # ── 주문 ─────────────────────────────────────────────────────────────

    def order_exists(self, client_order_id: str) -> bool:
        with self._engine.connect() as c:
            return (
                c.execute(select(m.orders.c.id).where(m.orders.c.client_order_id == client_order_id)).first()
                is not None
            )

    def insert_order(
        self, account_id: int, broker: str, req: OrderRequest, decision_id: int | None, now: datetime
    ) -> None:
        try:
            with self._engine.begin() as c:
                res = c.execute(
                    insert(m.orders).values(
                        client_order_id=req.client_order_id,
                        account_id=account_id,
                        broker=broker,
                        symbol=req.symbol,
                        side=req.side.value,
                        order_type=req.order_type.value,
                        tif=req.tif.value,
                        qty=req.qty,
                        limit_price=req.limit_price,
                        status=OrderStatus.PENDING_NEW.value,
                        filled_qty=ZERO,
                        strategy_id=req.strategy_id,
                        decision_id=decision_id,
                        created_at=to_db(now),
                        updated_at=to_db(now),
                    )
                )
                c.execute(
                    insert(m.order_events).values(
                        order_id=res.inserted_primary_key[0],  # type: ignore[index]
                        ts=to_db(now),
                        event="CREATED",
                        status=OrderStatus.PENDING_NEW.value,
                        detail=None,
                    )
                )
        except IntegrityError as e:
            if "Duplicate entry" in str(e.orig):
                raise DuplicateOrderError(req.client_order_id) from e
            raise

    def update_order(
        self, state: OrderState, event: str, now: datetime, detail: dict[str, Any] | None = None
    ) -> None:
        """상태·브로커 주문번호·거부 사유를 갱신한다. 체결 수량은 apply_fill 만 바꾼다."""
        with self._engine.begin() as c:
            row = c.execute(
                select(m.orders.c.id, m.orders.c.status)
                .where(m.orders.c.client_order_id == state.client_order_id)
                .with_for_update()
            ).first()
            if row is None:
                raise StoreConsistencyError(f"DB 에 없는 주문: {state.client_order_id}")
            current = OrderStatus(row.status)
            # 이벤트 순서가 뒤바뀌어도(예: 체결 이벤트가 접수 응답보다 먼저 기록) 상태가 뒤로 가지 않게 한다
            # 종료 상태(FILLED/CANCELED/REJECTED)는 바꾸지 않는다.
            terminal = status_rank(current) == 3
            status = current if terminal or status_rank(state.status) < status_rank(current) else state.status
            values: dict[str, Any] = {"status": status.value, "updated_at": to_db(now)}
            if state.broker_order_id is not None:
                values["broker_order_id"] = state.broker_order_id
            if state.reject_reason is not None:
                values["reject_reason"] = state.reject_reason[:255]
            c.execute(update(m.orders).where(m.orders.c.id == row.id).values(**values))
            c.execute(
                insert(m.order_events).values(
                    order_id=row.id,
                    ts=to_db(now),
                    event=event,
                    status=status.value,
                    detail=jsonable(detail) if detail else None,
                )
            )

    def apply_fill(self, account_id: int, fill: Fill, status: OrderStatus, now: datetime) -> bool:
        """체결 1건을 한 트랜잭션으로 반영한다: fills, 주문 체결수량, 포지션, 현금 원장.

        같은 exec_id 가 이미 있으면 아무것도 하지 않고 False.
        """
        with self._engine.begin() as c:
            if c.execute(select(m.fills.c.id).where(m.fills.c.exec_id == fill.exec_id)).first() is not None:
                return False
            o = c.execute(
                select(m.orders).where(m.orders.c.client_order_id == fill.client_order_id).with_for_update()
            ).first()
            if o is None:
                raise StoreConsistencyError(f"체결의 주문이 DB 에 없다: {fill.client_order_id}")
            if o.account_id != account_id or o.symbol != fill.symbol or o.side != fill.side.value:
                raise StoreConsistencyError(f"체결 내용이 주문과 다르다: {fill.exec_id}")
            new_filled = o.filled_qty + fill.qty
            if new_filled > o.qty:
                raise StoreConsistencyError(f"주문 수량보다 많이 체결됐다: {fill.client_order_id}")
            prev_value = (o.avg_fill_price or ZERO) * o.filled_qty
            avg_fill = q_amount((prev_value + fill.price * fill.qty) / new_filled)
            if status not in (OrderStatus.FILLED, OrderStatus.PARTIALLY_FILLED, OrderStatus.PENDING_CANCEL):
                raise StoreConsistencyError(f"체결 이벤트의 주문 상태가 이상하다: {status}")
            if (status is OrderStatus.FILLED) != (new_filled == o.qty):
                raise StoreConsistencyError(
                    f"체결 수량과 주문 상태가 맞지 않는다: {fill.client_order_id} {new_filled}/{o.qty} {status}"
                )

            res = c.execute(
                insert(m.fills).values(
                    order_id=o.id,
                    exec_id=fill.exec_id,
                    ts=to_db(fill.ts),
                    symbol=fill.symbol,
                    side=fill.side.value,
                    qty=fill.qty,
                    price=fill.price,
                    commission=fill.commission,
                    tax=fill.tax,
                    slippage=fill.slippage,
                )
            )
            fill_id = res.inserted_primary_key[0]  # type: ignore[index]
            c.execute(
                update(m.orders)
                .where(m.orders.c.id == o.id)
                .values(
                    filled_qty=new_filled, avg_fill_price=avg_fill, status=status.value, updated_at=to_db(now)
                )
            )
            c.execute(
                insert(m.order_events).values(
                    order_id=o.id,
                    ts=to_db(now),
                    event="FILL",
                    status=status.value,
                    detail=jsonable({"exec_id": fill.exec_id, "qty": fill.qty, "price": fill.price}),
                )
            )

            # 포지션
            p = c.execute(
                select(m.positions)
                .where(and_(m.positions.c.account_id == account_id, m.positions.c.symbol == fill.symbol))
                .with_for_update()
            ).first()
            qty = p.qty if p else ZERO
            avg = p.avg_price if p else ZERO
            realized = p.realized_pnl if p else ZERO
            if fill.side is Side.BUY:
                new_qty = qty + fill.qty
                avg = q_amount((qty * avg + fill.qty * fill.price) / new_qty)
            else:
                new_qty = qty - fill.qty
                if new_qty < 0:
                    raise StoreConsistencyError(f"보유 수량보다 많이 팔았다: {fill.symbol}")
                realized = q_amount(realized + (fill.price - avg) * fill.qty)
                if new_qty == 0:
                    avg = ZERO
            pos_values = {
                "qty": q_qty(new_qty),
                "avg_price": avg,
                "realized_pnl": realized,
                "updated_at": to_db(now),
            }
            if p is None:
                c.execute(insert(m.positions).values(account_id=account_id, symbol=fill.symbol, **pos_values))
            else:
                c.execute(
                    update(m.positions)
                    .where(and_(m.positions.c.account_id == account_id, m.positions.c.symbol == fill.symbol))
                    .values(**pos_values)
                )

            # 현금 원장
            notional = q_amount(fill.price * fill.qty)
            ledger = [
                ("BUY", -notional) if fill.side is Side.BUY else ("SELL", notional),
                ("COMMISSION", -fill.commission),
                ("TAX", -fill.tax),
            ]
            for kind, amount in ledger:
                if amount != 0:
                    c.execute(
                        insert(m.cash_ledger).values(
                            account_id=account_id,
                            ts=to_db(fill.ts),
                            amount=amount,
                            kind=kind,
                            fill_id=fill_id,
                        )
                    )
            if self._cash(c, account_id) < 0:
                raise StoreConsistencyError("현금이 음수가 된다")
        return True

    def get_order(self, client_order_id: str) -> OrderState | None:
        with self._engine.connect() as c:
            r = c.execute(select(m.orders).where(m.orders.c.client_order_id == client_order_id)).first()
        return _row_to_order(r) if r else None

    def list_open_orders(self, account_id: int) -> list[OrderState]:
        with self._engine.connect() as c:
            rows = c.execute(
                select(m.orders)
                .where(
                    and_(
                        m.orders.c.account_id == account_id,
                        m.orders.c.status.in_([s.value for s in OPEN_STATUSES]),
                    )
                )
                .order_by(m.orders.c.id)
            ).all()
        return [_row_to_order(r) for r in rows]

    # ── 시세 ─────────────────────────────────────────────────────────────

    def record_quotes(self, quotes: Sequence[Quote], received_at: datetime) -> None:
        if not quotes:
            return
        with self._engine.begin() as c:
            c.execute(
                insert(m.quotes),
                [
                    {
                        "symbol": q.symbol,
                        "ts": to_db(q.ts),
                        "price": q.price,
                        "bid": q.bid,
                        "ask": q.ask,
                        "volume": q.volume,
                        "source": q.source[:16],
                        "received_at": to_db(received_at),
                    }
                    for q in quotes
                ],
            )

    def record_bar(self, bar: Bar) -> None:
        with self._engine.begin() as c:
            c.execute(
                insert(m.bars)
                .values(
                    symbol=bar.symbol,
                    interval_s=bar.interval_s,
                    start_ts=to_db(bar.start_ts),
                    open=bar.open,
                    high=bar.high,
                    low=bar.low,
                    close=bar.close,
                    volume=bar.volume,
                )
                .prefix_with("IGNORE")
            )

    def recent_bars(self, symbol: str, interval_s: int, limit: int) -> list[Bar]:
        with self._engine.connect() as c:
            rows = c.execute(
                select(m.bars)
                .where(and_(m.bars.c.symbol == symbol, m.bars.c.interval_s == interval_s))
                .order_by(m.bars.c.start_ts.desc())
                .limit(limit)
            ).all()
        return [
            Bar(
                symbol=r.symbol,
                interval_s=r.interval_s,
                start_ts=from_db(r.start_ts),
                open=r.open,
                high=r.high,
                low=r.low,
                close=r.close,
                volume=r.volume,
            )
            for r in reversed(rows)
        ]

    # ── 전략 판단·위험 이벤트 ────────────────────────────────────────────

    def insert_decision(
        self,
        *,
        ts: datetime,
        strategy_id: str,
        symbol: str,
        bar_ts: datetime,
        action: str,
        reason: str,
        inputs: dict[str, Any],
    ) -> int:
        with self._engine.begin() as c:
            res = c.execute(
                insert(m.strategy_decisions).values(
                    ts=to_db(ts),
                    strategy_id=strategy_id,
                    symbol=symbol,
                    bar_ts=to_db(bar_ts),
                    action=action,
                    reason=reason[:255],
                    inputs=jsonable(inputs),
                )
            )
            return int(res.inserted_primary_key[0])  # type: ignore[index]

    def update_decision_risk(
        self, decision_id: int, result: str, reason: str | None, client_order_id: str | None
    ) -> None:
        with self._engine.begin() as c:
            c.execute(
                update(m.strategy_decisions)
                .where(m.strategy_decisions.c.id == decision_id)
                .values(
                    risk_result=result,
                    risk_reason=reason[:255] if reason else None,
                    client_order_id=client_order_id,
                )
            )

    def record_risk_event(
        self,
        kind: str,
        now: datetime,
        *,
        symbol: str | None = None,
        client_order_id: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> None:
        with self._engine.begin() as c:
            c.execute(
                insert(m.risk_events).values(
                    ts=to_db(now),
                    kind=kind[:32],
                    symbol=symbol,
                    client_order_id=client_order_id,
                    detail=jsonable(detail) if detail else None,
                )
            )

    # ── 엔진 상태(킬스위치 등) ───────────────────────────────────────────

    def get_engine_state(self, key: str) -> dict[str, Any] | None:
        with self._engine.connect() as c:
            v = c.execute(select(m.engine_state.c.value).where(m.engine_state.c.key == key)).scalar()
        return dict(v) if v is not None else None

    def set_engine_state(self, key: str, value: dict[str, Any], now: datetime, by: str) -> None:
        stmt = text(
            "INSERT INTO engine_state (`key`, `value`, updated_at, updated_by) VALUES (:k, :v, :t, :b) AS new "
            "ON DUPLICATE KEY UPDATE `value` = new.`value`, updated_at = new.updated_at, "
            "updated_by = new.updated_by"
        )
        with self._engine.begin() as c:
            c.execute(stmt, {"k": key, "v": json.dumps(jsonable(value)), "t": to_db(now), "b": by[:64]})

    # ── 일일 손실 기준 ───────────────────────────────────────────────────

    def get_daily_start_equity(self, account_id: int, trade_date: date) -> Decimal | None:
        with self._engine.connect() as c:
            v = c.execute(
                select(m.daily_equity.c.start_equity).where(
                    and_(m.daily_equity.c.account_id == account_id, m.daily_equity.c.trade_date == trade_date)
                )
            ).scalar()
        return Decimal(v) if v is not None else None

    def set_daily_start_equity(
        self, account_id: int, trade_date: date, equity: Decimal, now: datetime
    ) -> Decimal:
        """그날 처음 기록한 값이 기준이다. 이미 있으면 기존 값을 돌려준다 (재시작해도 기준 유지)."""
        with self._engine.begin() as c:
            c.execute(
                insert(m.daily_equity)
                .values(
                    account_id=account_id,
                    trade_date=trade_date,
                    start_equity=q_amount(equity),
                    start_ts=to_db(now),
                )
                .prefix_with("IGNORE")
            )
            v = c.execute(
                select(m.daily_equity.c.start_equity).where(
                    and_(m.daily_equity.c.account_id == account_id, m.daily_equity.c.trade_date == trade_date)
                )
            ).scalar_one()
        return Decimal(v)

    # ── 복구용 정합성 검사 ───────────────────────────────────────────────

    def check_consistency(self, account_id: int) -> list[Mismatch]:
        out: list[Mismatch] = []
        with self._engine.connect() as c:
            # 1) 주문별 체결수량 = fills 합계
            rows = c.execute(
                select(
                    m.orders.c.client_order_id,
                    m.orders.c.filled_qty,
                    func.coalesce(func.sum(m.fills.c.qty), 0).label("fill_sum"),
                )
                .select_from(m.orders.outerjoin(m.fills, m.fills.c.order_id == m.orders.c.id))
                .where(m.orders.c.account_id == account_id)
                .group_by(m.orders.c.id, m.orders.c.client_order_id, m.orders.c.filled_qty)
            ).all()
            for r in rows:
                if Decimal(r.filled_qty) != Decimal(r.fill_sum):
                    out.append(
                        Mismatch(
                            "ORDER_FILLED_QTY",
                            {
                                "client_order_id": r.client_order_id,
                                "order": r.filled_qty,
                                "fills": r.fill_sum,
                            },
                        )
                    )
            # 2) 종목별 포지션 = 매수 체결 - 매도 체결
            fill_rows = c.execute(
                select(m.fills.c.symbol, m.fills.c.side, func.sum(m.fills.c.qty).label("q"))
                .select_from(m.fills.join(m.orders, m.fills.c.order_id == m.orders.c.id))
                .where(m.orders.c.account_id == account_id)
                .group_by(m.fills.c.symbol, m.fills.c.side)
            ).all()
            net: dict[str, Decimal] = {}
            for r in fill_rows:
                sign = 1 if r.side == Side.BUY.value else -1
                net[r.symbol] = net.get(r.symbol, ZERO) + sign * Decimal(r.q)
            pos_rows = c.execute(
                select(m.positions.c.symbol, m.positions.c.qty).where(m.positions.c.account_id == account_id)
            ).all()
            pos = {r.symbol: Decimal(r.qty) for r in pos_rows}
            for sym in set(net) | set(pos):
                if net.get(sym, ZERO) != pos.get(sym, ZERO):
                    out.append(
                        Mismatch(
                            "POSITION_QTY",
                            {"symbol": sym, "fills_net": net.get(sym, ZERO), "position": pos.get(sym, ZERO)},
                        )
                    )
            # 3) 현금 음수
            cash = self._cash(c, account_id)
            if cash < 0:
                out.append(Mismatch("NEGATIVE_CASH", {"cash": cash}))
        return out
