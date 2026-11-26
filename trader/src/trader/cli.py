"""명령줄.

trader run                     엔진 실행 (가상매매)
trader halt --reason "..."     킬스위치 켜기: 신규 주문 차단 + 실행 중 엔진이 미체결 일괄 취소
trader resume                  킬스위치 끄기
trader status                  잔고·포지션·미체결·킬스위치 상태 (JSON)
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import logging
import signal
import sys
from datetime import UTC, datetime

from trader.config import Settings
from trader.logging_setup import setup_logging
from trader.storage.db import create_db_engine
from trader.storage.store import SqlTradingStore, jsonable

log = logging.getLogger("trader")


def _settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


def _store(s: Settings) -> SqlTradingStore:
    return SqlTradingStore(create_db_engine(s.database_url.get_secret_value()))


def cmd_run(s: Settings) -> int:
    from trader.app import build_engine

    async def main() -> int:
        engine = build_engine(s)
        task = asyncio.current_task()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            # Windows 에서는 지원되지 않는다 — Ctrl+C 는 KeyboardInterrupt 로 들어온다
            with contextlib.suppress(NotImplementedError, RuntimeError):
                loop.add_signal_handler(sig, lambda: task.cancel() if task else None)
        log.info(
            "engine starting",
            extra={"fields": {"mode": s.mode, "feed": s.feed, "pace": s.pace, "symbols": s.symbols}},
        )
        return await engine.run()

    try:
        return asyncio.run(main())
    except (KeyboardInterrupt, asyncio.CancelledError):
        log.info("stopped by signal")
        return 0


def cmd_halt(s: Settings, reason: str) -> int:
    from trader.risk.killswitch import KillSwitch

    KillSwitch(_store(s), 0).halt(reason, "cli", datetime.now(UTC))
    print("halted: 실행 중인 엔진이 다음 감시 주기에 미체결 주문을 일괄 취소한다")
    return 0


def cmd_resume(s: Settings) -> int:
    from trader.risk.killswitch import KillSwitch

    KillSwitch(_store(s), 0).resume("cli", datetime.now(UTC))
    print("resumed")
    return 0


def cmd_status(s: Settings) -> int:
    from sqlalchemy import select

    from trader.risk.killswitch import KEY
    from trader.storage import models as m

    store = _store(s)
    with store._engine.connect() as c:
        acc = c.execute(select(m.accounts.c.id).where(m.accounts.c.name == s.account_name)).scalar()
    if acc is None:
        print(json.dumps({"account": s.account_name, "exists": False}, ensure_ascii=False))
        return 1
    bal = store.load_balance(int(acc))
    out = {
        "account": s.account_name,
        "killswitch": store.get_engine_state(KEY) or {"halted": False},
        "cash": bal.cash,
        "positions": {
            k: {"qty": p.qty, "avg_price": p.avg_price, "realized_pnl": p.realized_pnl}
            for k, p in bal.positions.items()
        },
        "open_orders": [
            {
                "coid": o.client_order_id,
                "symbol": o.symbol,
                "side": o.side,
                "qty": o.qty,
                "filled": o.filled_qty,
                "status": o.status,
            }
            for o in store.list_open_orders(int(acc))
        ],
    }
    print(json.dumps(jsonable(out), ensure_ascii=False, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="trader", description="개인용 자동매매 엔진 (1단계: 가상매매)")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("run")
    h = sub.add_parser("halt")
    h.add_argument("--reason", required=True)
    sub.add_parser("resume")
    sub.add_parser("status")
    args = p.parse_args(argv)

    s = _settings()
    setup_logging(s.log_level, json_output=s.log_json, secrets=s.secret_values())
    if args.cmd == "run":
        return cmd_run(s)
    if args.cmd == "halt":
        return cmd_halt(s, args.reason)
    if args.cmd == "resume":
        return cmd_resume(s)
    return cmd_status(s)


if __name__ == "__main__":
    sys.exit(main())
