"""Alembic 실행 환경.

접속 URL 우선순위
1. `alembic -x url=...` (테스트에서 사용)
2. 환경변수 TRADER_MIGRATE_DATABASE_URL (`.env` 도 읽는다)

엔진 계정(trader_app)에는 DDL 권한이 없으므로 마이그레이션은 trader_migrate 계정으로 한다.
"""

from __future__ import annotations

import os
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine, pool

from trader.storage.models import metadata

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = metadata


def _load_dotenv() -> None:
    env_file = Path(__file__).resolve().parent.parent / ".env"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def _url() -> str:
    x_args = context.get_x_argument(as_dictionary=True)
    if x_args.get("url"):
        return x_args["url"]
    _load_dotenv()
    url = os.environ.get("TRADER_MIGRATE_DATABASE_URL")
    if not url:
        raise SystemExit("TRADER_MIGRATE_DATABASE_URL 이 없다 (.env 또는 환경변수)")
    return url


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(
        _url(), poolclass=pool.NullPool, connect_args={"init_command": "SET time_zone='+00:00'"}
    )
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
