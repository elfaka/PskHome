"""DB 엔진 생성, 헬스체크, 단일 인스턴스 락."""

from __future__ import annotations

import logging

from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.engine import make_url

log = logging.getLogger(__name__)


def create_db_engine(url: str) -> Engine:
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=5,
        max_overflow=2,
        # 세션 시간대를 UTC 로 고정한다. DATETIME 은 tz 를 갖지 않으므로 모든 값은 UTC 다.
        connect_args={"init_command": "SET time_zone='+00:00'", "connect_timeout": 5},
        # 접속 URL(비밀번호 포함)이 로그로 나가지 않게 echo 는 켜지 않는다.
        echo=False,
        hide_parameters=True,
    )


class InstanceLockError(Exception):
    pass


class InstanceLock:
    """MySQL GET_LOCK 으로 엔진 인스턴스를 1개로 제한한다.

    락은 그것을 잡은 DB 연결에 묶인다. 그 연결이 끊기면 락이 풀려 다른 인스턴스가 뜰 수 있으므로
    `still_held()` 가 False 가 되면 엔진은 즉시 멈춰야 한다.
    """

    def __init__(self, engine: Engine) -> None:
        self._engine = engine
        db = make_url(str(engine.url)).database or "default"
        self.name = f"trader_engine:{db}"
        self._conn: Connection | None = None

    def acquire(self) -> None:
        conn = self._engine.connect()
        got = conn.execute(text("SELECT GET_LOCK(:n, 0)"), {"n": self.name}).scalar()
        conn.commit()
        if got != 1:
            conn.close()
            raise InstanceLockError(f"다른 엔진 인스턴스가 실행 중이다 (lock={self.name})")
        self._conn = conn
        log.info("instance lock acquired", extra={"fields": {"lock": self.name}})

    def still_held(self) -> bool:
        if self._conn is None:
            return False
        try:
            held = self._conn.execute(
                text("SELECT IS_USED_LOCK(:n) = CONNECTION_ID()"), {"n": self.name}
            ).scalar()
            self._conn.commit()
            return held == 1
        except Exception:
            log.exception("instance lock check failed")
            return False

    def release(self) -> None:
        if self._conn is None:
            return
        try:
            self._conn.execute(text("SELECT RELEASE_LOCK(:n)"), {"n": self.name})
            self._conn.commit()
        except Exception:
            log.warning("instance lock release failed (연결 종료로 풀린다)")
        finally:
            self._conn.close()
            self._conn = None
