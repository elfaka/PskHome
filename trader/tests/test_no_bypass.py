"""우회 경로가 없는지 정적으로 검사한다.

- 브로커 주문 함수(place_order)는 게이트웨이에서만 호출한다
- RiskApproval 발급(_issue)은 RiskManager 에서만 한다
- 전략 모듈은 브로커·저장소·게이트웨이를 import 하지 않는다
- 증권사 실주문 코드나 외부 HTTP 호출이 없다 (1단계)
"""

from __future__ import annotations

import ast
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src" / "trader"


def _files() -> list[Path]:
    return sorted(SRC.rglob("*.py"))


def _calls(path: Path, attr: str) -> list[int]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            f = node.func
            if (isinstance(f, ast.Attribute) and f.attr == attr) or (
                isinstance(f, ast.Name) and f.id == attr
            ):
                out.append(node.lineno)
    return out


def test_place_order_called_only_by_gateway() -> None:
    callers = {p.relative_to(SRC).as_posix() for p in _files() if _calls(p, "place_order")}
    assert callers == {"execution/gateway.py"}


def test_approval_issued_only_by_risk_manager() -> None:
    callers = {p.relative_to(SRC).as_posix() for p in _files() if _calls(p, "_issue")}
    assert callers == {"risk/manager.py"}


def test_strategy_does_not_touch_broker_or_store() -> None:
    forbidden = ("trader.broker", "trader.storage", "trader.execution", "trader.engine")
    for p in (SRC / "strategy").rglob("*.py"):
        tree = ast.parse(p.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            mods: list[str] = []
            if isinstance(node, ast.ImportFrom) and node.module:
                mods = [node.module]
            elif isinstance(node, ast.Import):
                mods = [a.name for a in node.names]
            for m in mods:
                assert not m.startswith(forbidden), f"{p.name} imports {m}"


def test_no_network_clients_in_phase1() -> None:
    banned = ("requests", "httpx", "aiohttp", "urllib.request", "websockets", "socket")
    for p in _files():
        tree = ast.parse(p.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            else:
                continue
            for n in names:
                assert not n.startswith(banned), f"{p.relative_to(SRC)} imports {n}"
