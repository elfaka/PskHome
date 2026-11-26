"""MySQL 이 필요한 테스트용 fixture.

TRADER_TEST_DATABASE_URL (환경변수 또는 trader/.env) 이 없으면 건너뛴다.
DB 이름이 `_test` 로 끝나지 않으면 실패시킨다 — 개발·운영 DB 를 지우는 사고를 막는다.
"""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine, text
from sqlalchemy.engine import make_url

from trader.storage.db import create_db_engine
from trader.storage.models import metadata

ROOT = Path(__file__).resolve().parent.parent


def _test_url() -> str | None:
    url = os.environ.get("TRADER_TEST_DATABASE_URL")
    if url:
        return url
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("TRADER_TEST_DATABASE_URL="):
                return line.split("=", 1)[1].strip() or None
    return None


@pytest.fixture(scope="session")
def mysql_url() -> str:
    url = _test_url()
    if not url:
        pytest.skip("TRADER_TEST_DATABASE_URL 이 없어 MySQL 테스트를 건너뛴다")
    db = make_url(url).database or ""
    if not db.endswith("_test"):
        pytest.fail(f"테스트 DB 이름은 _test 로 끝나야 한다: {db!r}")
    return url


@pytest.fixture(scope="session")
def migrated_engine(mysql_url: str) -> Iterator[Engine]:
    """세션 시작 시 테스트 DB 를 비우고 head 로 → base 로 → head 로 실제 마이그레이션한다.

    (이전 실행이 중간에 죽어 버전 기록과 테이블이 어긋나 있어도 다시 시작할 수 있게 먼저 전부 지운다)
    """
    engine = create_db_engine(mysql_url)
    with engine.begin() as c:
        c.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        for (name,) in c.execute(text("SHOW TABLES")).all():
            c.execute(text(f"DROP TABLE `{name}`"))
        c.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    for action, target in (("upgrade", "head"), ("downgrade", "base"), ("upgrade", "head")):
        cmd = [sys.executable, "-m", "alembic", "-x", f"url={mysql_url}", action, target]
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            pytest.fail(f"alembic {action} {target} 실패:\n{r.stderr[-2000:]}")
    yield engine
    engine.dispose()


@pytest.fixture
def db_engine(migrated_engine: Engine) -> Engine:
    """테스트마다 모든 테이블을 비운다."""
    with migrated_engine.begin() as c:
        c.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        for t in reversed(metadata.sorted_tables):
            c.execute(text(f"DELETE FROM `{t.name}`"))
        c.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    return migrated_engine
