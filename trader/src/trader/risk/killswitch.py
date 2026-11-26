"""킬스위치 (즉시 중지).

상태는 DB(engine_state.killswitch)에 둔다. 그래서
- CLI(`trader halt`)로 다른 프로세스에서 켤 수 있고
- 재시작해도 켜진 상태가 유지되며
- 끄는 것은 사람이 `trader resume` 으로만 한다.

켜지면 엔진은 신규 주문을 막고 미체결 주문을 일괄 취소한다.
DB 를 읽지 못하면 켜진 것으로 본다 (fail closed).
"""

from __future__ import annotations

import logging
import time as _time
from datetime import datetime
from typing import Any

from trader.storage.store import TradingStore

log = logging.getLogger(__name__)
KEY = "killswitch"


class KillSwitch:
    def __init__(self, store: TradingStore, poll_seconds: float) -> None:
        self._store = store
        self._poll = poll_seconds
        self._halted = True  # 첫 조회 전까지는 켜진 것으로
        self._reason: str | None = "not loaded"
        self._last_poll: float | None = None

    @property
    def halted(self) -> bool:
        return self._halted

    @property
    def reason(self) -> str | None:
        return self._reason

    def refresh(self, *, force: bool = False) -> bool:
        """DB 에서 상태를 다시 읽는다. 상태가 바뀌었으면 True."""
        now = _time.monotonic()
        if not force and self._last_poll is not None and now - self._last_poll < self._poll:
            return False
        self._last_poll = now
        before = self._halted
        try:
            state = self._store.get_engine_state(KEY)
        except Exception as e:
            log.error("killswitch read failed — treating as halted", extra={"fields": {"err": str(e)[:200]}})
            self._halted, self._reason = True, "킬스위치 상태를 읽지 못했다"
            return before != self._halted
        if state is None:
            self._halted, self._reason = False, None
        else:
            self._halted = bool(state.get("halted"))
            self._reason = state.get("reason") if self._halted else None
        return before != self._halted

    def halt(self, reason: str, by: str, now: datetime) -> None:
        value: dict[str, Any] = {"halted": True, "reason": reason[:200], "at": now.isoformat()}
        self._store.set_engine_state(KEY, value, now, by)
        self._store.record_risk_event("HALT", now, detail={"reason": reason, "by": by})
        self._halted, self._reason = True, reason
        log.warning("KILL SWITCH ON", extra={"fields": {"reason": reason, "by": by}})

    def resume(self, by: str, now: datetime) -> None:
        self._store.set_engine_state(KEY, {"halted": False, "at": now.isoformat()}, now, by)
        self._store.record_risk_event("RESUME", now, detail={"by": by})
        self._halted, self._reason = False, None
        log.warning("kill switch off", extra={"fields": {"by": by}})
