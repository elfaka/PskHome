"""MySQL 테이블 정의 (SQLAlchemy Core).

규칙
- 금액·가격: DECIMAL(20,4), 수량: DECIMAL(20,6)
- 시각: DATETIME(6), UTC (tz 정보 없이 저장)
- 주문의 client_order_id 는 UNIQUE — 같은 신호로 두 번 주문하지 못한다
- 체결의 exec_id 는 UNIQUE — 같은 체결을 두 번 반영하지 못한다

스키마 변경은 반드시 Alembic 마이그레이션(migrations/versions)으로 한다.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Column,
    Date,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    PrimaryKeyConstraint,
    SmallInteger,
    String,
    Table,
    UniqueConstraint,
    false,
)
from sqlalchemy.dialects.mysql import DATETIME

# 엔진이 기대하는 마이그레이션 버전. 새 마이그레이션을 추가하면 함께 올린다 (테스트가 head 와 비교한다)
SCHEMA_REVISION = "0002"

metadata = MetaData(
    naming_convention={
        "ix": "ix_%(table_name)s_%(column_0_N_name)s",
        "uq": "uq_%(table_name)s_%(column_0_N_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    }
)


def Amount() -> Numeric[Decimal]:
    return Numeric(20, 4, asdecimal=True)


def Qty() -> Numeric[Decimal]:
    return Numeric(20, 6, asdecimal=True)


def Ts() -> DATETIME:
    return DATETIME(fsp=6)


accounts = Table(
    "accounts",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("name", String(64), nullable=False, unique=True),
    Column("broker", String(32), nullable=False),
    Column("currency", String(3), nullable=False),
    Column("created_at", Ts(), nullable=False),
)

cash_ledger = Table(
    "cash_ledger",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("account_id", BigInteger, ForeignKey("accounts.id"), nullable=False),
    Column("ts", Ts(), nullable=False),
    # 입금·매도대금은 +, 매수대금·수수료·세금은 -
    Column("amount", Amount(), nullable=False),
    Column("kind", String(16), nullable=False),  # DEPOSIT / BUY / SELL / COMMISSION / TAX
    Column("fill_id", BigInteger, ForeignKey("fills.id"), nullable=True),
    Column("memo", String(255), nullable=True),
    Index(None, "account_id", "ts"),
)

positions = Table(
    "positions",
    metadata,
    Column("account_id", BigInteger, ForeignKey("accounts.id"), nullable=False),
    Column("symbol", String(16), nullable=False),
    Column("qty", Qty(), nullable=False),
    Column("avg_price", Amount(), nullable=False),
    Column("realized_pnl", Amount(), nullable=False),
    Column("updated_at", Ts(), nullable=False),
    PrimaryKeyConstraint("account_id", "symbol"),
)

orders = Table(
    "orders",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("client_order_id", String(64), nullable=False, unique=True),
    Column("account_id", BigInteger, ForeignKey("accounts.id"), nullable=False),
    Column("broker", String(32), nullable=False),
    Column("broker_order_id", String(64), nullable=True),
    Column("symbol", String(16), nullable=False),
    Column("side", String(4), nullable=False),
    Column("order_type", String(8), nullable=False),
    Column("tif", String(8), nullable=False),
    Column("qty", Qty(), nullable=False),
    Column("limit_price", Amount(), nullable=True),
    Column("status", String(20), nullable=False),
    Column("filled_qty", Qty(), nullable=False),
    Column("avg_fill_price", Amount(), nullable=True),
    Column("strategy_id", String(64), nullable=True),
    Column("decision_id", BigInteger, nullable=True),
    Column("reject_reason", String(255), nullable=True),
    Column("created_at", Ts(), nullable=False),
    Column("updated_at", Ts(), nullable=False),
    Index(None, "account_id", "status"),
)

order_events = Table(
    "order_events",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("order_id", BigInteger, ForeignKey("orders.id"), nullable=False),
    Column("ts", Ts(), nullable=False),
    Column("event", String(24), nullable=False),
    Column("status", String(20), nullable=False),
    Column("detail", JSON, nullable=True),
    Index(None, "order_id", "ts"),
)

fills = Table(
    "fills",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("order_id", BigInteger, ForeignKey("orders.id"), nullable=False),
    Column("exec_id", String(64), nullable=False, unique=True),
    Column("ts", Ts(), nullable=False),
    Column("symbol", String(16), nullable=False),
    Column("side", String(4), nullable=False),
    Column("qty", Qty(), nullable=False),
    Column("price", Amount(), nullable=False),
    Column("commission", Amount(), nullable=False),
    Column("tax", Amount(), nullable=False),
    # 기준가 대비 슬리피지로 불리해진 금액 (기록용)
    Column("slippage", Amount(), nullable=False),
    Index(None, "symbol", "ts"),
)

quotes = Table(
    "quotes",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("symbol", String(16), nullable=False),
    Column("ts", Ts(), nullable=False),
    Column("price", Amount(), nullable=False),
    Column("bid", Amount(), nullable=True),
    Column("ask", Amount(), nullable=True),
    Column("volume", Qty(), nullable=False),
    Column("source", String(16), nullable=False),
    Column("received_at", Ts(), nullable=False),
    Index(None, "symbol", "ts"),
)

bars = Table(
    "bars",
    metadata,
    Column("symbol", String(16), nullable=False),
    Column("interval_s", Integer, nullable=False),
    Column("start_ts", Ts(), nullable=False),
    Column("open", Amount(), nullable=False),
    Column("high", Amount(), nullable=False),
    Column("low", Amount(), nullable=False),
    Column("close", Amount(), nullable=False),
    Column("volume", Qty(), nullable=False),
    PrimaryKeyConstraint("symbol", "interval_s", "start_ts"),
)

strategy_decisions = Table(
    "strategy_decisions",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("ts", Ts(), nullable=False),
    Column("strategy_id", String(64), nullable=False),
    Column("symbol", String(16), nullable=False),
    Column("bar_ts", Ts(), nullable=False),
    Column("action", String(8), nullable=False),  # BUY / SELL / HOLD / WAIT / EXIT
    Column("reason", String(255), nullable=False),
    Column("inputs", JSON, nullable=True),
    # 위험 관리 결과: APPROVED / REJECTED / DUPLICATE / SHADOW(주문 없이 기록만) / NULL(주문 의도 없음)
    Column("risk_result", String(16), nullable=True),
    Column("risk_reason", String(255), nullable=True),
    Column("client_order_id", String(64), nullable=True),
    # ── 0002: 신호 상세 ──
    # 그림자 전략: 주문하지 않고 신호·성과만 기록
    Column("shadow", Boolean, nullable=False, server_default=false()),
    Column("score", Numeric(7, 2), nullable=True),
    # 규칙이 매긴 확신도 (수익 확률이 아니다)
    Column("confidence", Numeric(5, 4), nullable=True),
    # 진입가·손절·목표가·손익비는 위험 관리가 계산한다 (전략·AI 가 아니다)
    Column("entry_price", Amount(), nullable=True),
    Column("stop_loss", Amount(), nullable=True),
    Column("take_profit", Amount(), nullable=True),
    Column("risk_reward", Numeric(10, 4), nullable=True),
    Column("valid_until", Ts(), nullable=True),
    Column("reasons", JSON, nullable=True),
    Column("invalidation", JSON, nullable=True),
    Index(None, "strategy_id", "symbol", "ts"),
)

# 신호 이후 실제 가격 흐름 (신호 판단과 분리해 둔다 — 사후 평가용)
signal_performance = Table(
    "signal_performance",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("decision_id", BigInteger, ForeignKey("strategy_decisions.id"), nullable=False),
    Column("symbol", String(16), nullable=False),
    Column("horizon", String(8), nullable=False),  # 5m / 15m / 30m / close
    # 1: 오르면 좋은 신호(BUY), -1: 내리면 좋은 신호(SELL/EXIT)
    Column("direction", SmallInteger, nullable=False),
    Column("signal_ts", Ts(), nullable=False),
    Column("ref_price", Amount(), nullable=False),
    Column("due_ts", Ts(), nullable=False),
    Column("status", String(12), nullable=False),  # PENDING / DONE / NO_DATA
    Column("close_price", Amount(), nullable=True),
    Column("max_price", Amount(), nullable=True),
    Column("min_price", Amount(), nullable=True),
    # 방향 반영 수익률·최대 유리/불리 폭 (비율)
    Column("return_pct", Numeric(12, 6), nullable=True),
    Column("mfe_pct", Numeric(12, 6), nullable=True),
    Column("mae_pct", Numeric(12, 6), nullable=True),
    Column("evaluated_at", Ts(), nullable=True),
    UniqueConstraint("decision_id", "horizon"),
    Index(None, "status", "due_ts"),
)

risk_events = Table(
    "risk_events",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("ts", Ts(), nullable=False),
    Column("kind", String(32), nullable=False),
    Column("symbol", String(16), nullable=True),
    Column("client_order_id", String(64), nullable=True),
    Column("detail", JSON, nullable=True),
    Index(None, "ts"),
)

daily_equity = Table(
    "daily_equity",
    metadata,
    Column("account_id", BigInteger, ForeignKey("accounts.id"), nullable=False),
    # KST 거래일
    Column("trade_date", Date, nullable=False),
    Column("start_equity", Amount(), nullable=False),
    Column("start_ts", Ts(), nullable=False),
    PrimaryKeyConstraint("account_id", "trade_date"),
)

engine_state = Table(
    "engine_state",
    metadata,
    Column("key", String(64), primary_key=True),
    Column("value", JSON, nullable=False),
    Column("updated_at", Ts(), nullable=False),
    Column("updated_by", String(64), nullable=False),
)
