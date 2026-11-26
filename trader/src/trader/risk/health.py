"""거래 가능 상태. 하나라도 나쁘면 신규 주문을 막는다."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class TradingHealth:
    db_ok: bool = True
    db_error: str | None = None
    # 엔진 수준 오류 (예: 시세 공급 실패). 재시작 전까지 풀리지 않는다
    engine_error: str | None = None
    # 종목별 데이터 문제 (잘못된 시세, 봉 누락 등). 정상 봉이 다시 쌓이면 엔진이 지운다
    data_issues: dict[str, str] = field(default_factory=dict)

    def mark_db_failure(self, err: str) -> None:
        self.db_ok = False
        self.db_error = err[:200]

    def mark_db_ok(self) -> None:
        self.db_ok = True
        self.db_error = None

    def block_reason(self, symbol: str) -> tuple[str, str] | None:
        if self.engine_error:
            return "ENGINE_ERROR", self.engine_error
        if not self.db_ok:
            return "DB_UNHEALTHY", self.db_error or "DB 기록 실패"
        if symbol in self.data_issues:
            return "DATA_UNHEALTHY", self.data_issues[symbol]
        return None
