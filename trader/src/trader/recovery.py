"""재시작 복구.

1. DB 정합성 검사 (주문 체결수량 = 체결 합계, 포지션 = 체결 순합계, 현금 ≥ 0)
2. DB 의 잔고·미체결 주문으로 브로커 상태 복원 (PaperBroker 는 restore 로 되살린다)
3. PENDING_NEW(기록은 했지만 접수 확인 전) 주문은 브로커에 client_order_id 로 조회한다
   - 브로커에 있으면 그 상태로 맞춘다
   - 없으면 나가지 않은 주문이므로 CANCELED 로 정리한다
4. 브로커 잔고·미체결 주문과 DB 를 대조한다
하나라도 어긋나면 킬스위치를 켠 상태로 기동한다 (사람이 확인 후 `trader resume`).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Any

from trader.broker.base import Broker, OrderNotFound
from trader.domain import AccountBalance, OrderState, OrderStatus
from trader.risk.killswitch import KillSwitch
from trader.storage.store import TradingStore

log = logging.getLogger(__name__)

RestoreHook = Callable[[AccountBalance, list[OrderState]], None]


@dataclass(slots=True)
class RecoveryReport:
    cash: str = "0"
    positions: dict[str, str] = field(default_factory=dict)
    open_orders: list[str] = field(default_factory=list)
    resolved_pending: dict[str, str] = field(default_factory=dict)
    mismatches: list[dict[str, Any]] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.mismatches


async def recover(
    *,
    store: TradingStore,
    broker: Broker,
    account_id: int,
    killswitch: KillSwitch,
    now: datetime,
    restore: RestoreHook | None,
) -> RecoveryReport:
    report = RecoveryReport()
    for mm in store.check_consistency(account_id):
        report.mismatches.append({"kind": mm.kind, **mm.detail})

    balance = store.load_balance(account_id)
    open_orders = store.list_open_orders(account_id)
    if restore is not None:
        restore(balance, open_orders)

    for o in open_orders:
        if o.status is not OrderStatus.PENDING_NEW:
            continue
        try:
            st = await broker.get_order(o.client_order_id)
            store.update_order(st, "RECOVERED", now)
            report.resolved_pending[o.client_order_id] = st.status.value
        except OrderNotFound:
            canceled = replace(o, status=OrderStatus.CANCELED, reject_reason="recovery: 브로커 미접수")
            store.update_order(canceled, "RECOVERY_CANCELED", now)
            report.resolved_pending[o.client_order_id] = "CANCELED(not sent)"

    # 브로커와 DB 대조
    balance = store.load_balance(account_id)
    b = await broker.get_balance()
    if b.cash != balance.cash:
        report.mismatches.append({"kind": "CASH", "db": balance.cash, "broker": b.cash})
    for sym in set(b.positions) | set(balance.positions):
        if b.qty(sym) != balance.qty(sym):
            report.mismatches.append(
                {"kind": "POSITION", "symbol": sym, "db": balance.qty(sym), "broker": b.qty(sym)}
            )
    db_open = {o.client_order_id for o in store.list_open_orders(account_id)}
    br_open = {o.client_order_id for o in await broker.list_open_orders()}
    if db_open != br_open:
        report.mismatches.append(
            {
                "kind": "OPEN_ORDERS",
                "db_only": sorted(db_open - br_open),
                "broker_only": sorted(br_open - db_open),
            }
        )

    report.cash = format(balance.cash, "f")
    report.positions = {s: format(p.qty, "f") for s, p in balance.positions.items()}
    report.open_orders = sorted(db_open)

    if report.mismatches:
        store.record_risk_event("RECOVERY_MISMATCH", now, detail={"mismatches": report.mismatches})
        killswitch.halt("복구 중 DB·브로커 불일치 — 확인 후 resume", "recovery", now)
        log.error("recovery mismatch — halted", extra={"fields": {"mismatches": report.mismatches}})
    else:
        store.record_risk_event(
            "RECOVERED",
            now,
            detail={
                "cash": report.cash,
                "positions": report.positions,
                "open_orders": report.open_orders,
                "resolved_pending": report.resolved_pending,
            },
        )
        log.info(
            "recovery ok", extra={"fields": {"cash": report.cash, "open_orders": len(report.open_orders)}}
        )
    return report
