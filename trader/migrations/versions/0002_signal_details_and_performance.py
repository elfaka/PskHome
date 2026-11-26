"""signal details and performance

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-26 17:35:16.192619
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # (alembic autogenerate 후 검토함)
    op.create_table(
        "signal_performance",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("decision_id", sa.BigInteger(), nullable=False),
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.Column("horizon", sa.String(length=8), nullable=False),
        sa.Column("direction", sa.SmallInteger(), nullable=False),
        sa.Column("signal_ts", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("ref_price", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("due_ts", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("close_price", sa.Numeric(precision=20, scale=4), nullable=True),
        sa.Column("max_price", sa.Numeric(precision=20, scale=4), nullable=True),
        sa.Column("min_price", sa.Numeric(precision=20, scale=4), nullable=True),
        sa.Column("return_pct", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("mfe_pct", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("mae_pct", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("evaluated_at", mysql.DATETIME(fsp=6), nullable=True),
        sa.ForeignKeyConstraint(
            ["decision_id"],
            ["strategy_decisions.id"],
            name=op.f("fk_signal_performance_decision_id_strategy_decisions"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_signal_performance")),
        sa.UniqueConstraint("decision_id", "horizon", name=op.f("uq_signal_performance_decision_id_horizon")),
    )
    op.create_index(
        op.f("ix_signal_performance_status_due_ts"), "signal_performance", ["status", "due_ts"], unique=False
    )
    op.add_column(
        "strategy_decisions",
        sa.Column("shadow", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("strategy_decisions", sa.Column("score", sa.Numeric(precision=7, scale=2), nullable=True))
    op.add_column(
        "strategy_decisions", sa.Column("confidence", sa.Numeric(precision=5, scale=4), nullable=True)
    )
    op.add_column(
        "strategy_decisions", sa.Column("entry_price", sa.Numeric(precision=20, scale=4), nullable=True)
    )
    op.add_column(
        "strategy_decisions", sa.Column("stop_loss", sa.Numeric(precision=20, scale=4), nullable=True)
    )
    op.add_column(
        "strategy_decisions", sa.Column("take_profit", sa.Numeric(precision=20, scale=4), nullable=True)
    )
    op.add_column(
        "strategy_decisions", sa.Column("risk_reward", sa.Numeric(precision=10, scale=4), nullable=True)
    )
    op.add_column("strategy_decisions", sa.Column("valid_until", mysql.DATETIME(fsp=6), nullable=True))
    op.add_column("strategy_decisions", sa.Column("reasons", sa.JSON(), nullable=True))
    op.add_column("strategy_decisions", sa.Column("invalidation", sa.JSON(), nullable=True))


def downgrade() -> None:
    # (alembic autogenerate 후 검토함)
    op.drop_column("strategy_decisions", "invalidation")
    op.drop_column("strategy_decisions", "reasons")
    op.drop_column("strategy_decisions", "valid_until")
    op.drop_column("strategy_decisions", "risk_reward")
    op.drop_column("strategy_decisions", "take_profit")
    op.drop_column("strategy_decisions", "stop_loss")
    op.drop_column("strategy_decisions", "entry_price")
    op.drop_column("strategy_decisions", "confidence")
    op.drop_column("strategy_decisions", "score")
    op.drop_column("strategy_decisions", "shadow")
    op.drop_table("signal_performance")
