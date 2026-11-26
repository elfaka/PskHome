"""로깅. JSON 한 줄 로그, 시각은 KST 오프셋 포함, 비밀값은 마스킹한다."""

from __future__ import annotations

import json
import logging
import re
import sys
from datetime import datetime
from typing import Any

from trader.clock import KST

# scheme://user:password@host 형태의 비밀번호
_URL_CRED = re.compile(r"(?P<scheme>[a-zA-Z][a-zA-Z0-9+.\-]*://)(?P<user>[^:/@\s]+):(?P<pw>[^@\s]+)@")
MASK = "***"


def mask_text(text: str, secrets: list[str]) -> str:
    text = _URL_CRED.sub(lambda m: f"{m['scheme']}{m['user']}:{MASK}@", text)
    for s in secrets:
        if s and len(s) >= 4:
            text = text.replace(s, MASK)
    return text


class SecretMaskingFilter(logging.Filter):
    def __init__(self, secrets: list[str]) -> None:
        super().__init__()
        self._secrets = [s for s in secrets if s]

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        record.msg = mask_text(msg, self._secrets)
        record.args = None
        extra = getattr(record, "fields", None)
        if isinstance(extra, dict):
            record.fields = json.loads(mask_text(json.dumps(extra, default=str), self._secrets))
        if record.exc_info:
            record.exc_text = mask_text(logging.Formatter().formatException(record.exc_info), self._secrets)
            record.exc_info = None
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, KST).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            payload.update(fields)
        if record.exc_text:
            payload["exc"] = record.exc_text
        return json.dumps(payload, ensure_ascii=False, default=str)


class TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created, KST).isoformat(timespec="milliseconds")
        line = f"{ts} {record.levelname:<7} {record.name}: {record.getMessage()}"
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict) and fields:
            line += " " + json.dumps(fields, ensure_ascii=False, default=str)
        if record.exc_text:
            line += "\n" + record.exc_text
        return line


def setup_logging(level: str, *, json_output: bool, secrets: list[str]) -> None:
    root = logging.getLogger()
    for h in list(root.handlers):
        root.removeHandler(h)
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(SecretMaskingFilter(secrets))
    handler.setFormatter(JsonFormatter() if json_output else TextFormatter())
    root.addHandler(handler)
    root.setLevel(level)
    # SQL 문장 로그에 바인드 값이 섞이지 않도록 SQLAlchemy 는 경고 이상만
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)


def log_fields(**fields: Any) -> dict[str, Any]:
    """logger.info("...", extra=log_fields(a=1)) 형태로 구조화 필드를 붙인다."""
    return {"fields": fields}
