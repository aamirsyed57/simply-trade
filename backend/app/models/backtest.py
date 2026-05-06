"""Backtest and BacktestResult models."""

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class BacktestStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class FillModel(str, enum.Enum):
    NEXT_BAR_OPEN = "next_bar_open"  # Default — avoids look-ahead bias
    BAR_CLOSE = "bar_close"
    MIDPOINT = "midpoint"


class Backtest(Base, TimestampMixin):
    __tablename__ = "backtests"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    strategy_code: Mapped[str] = mapped_column(String(50), nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Symbols as list of symbol IDs (stored in JSONB for flexibility)
    symbol_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    timeframe: Mapped[str] = mapped_column(String(10), nullable=False, default="1m")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    initial_capital: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)

    fill_model: Mapped[FillModel] = mapped_column(
        Enum(FillModel, name="fill_model"), nullable=False, default=FillModel.NEXT_BAR_OPEN
    )
    slippage_bps: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    commission_model: Mapped[str] = mapped_column(String(50), nullable=False, default="ibkr_tiered")

    status: Mapped[BacktestStatus] = mapped_column(
        Enum(BacktestStatus, name="backtest_status"), nullable=False, default=BacktestStatus.PENDING
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationship
    result: Mapped["BacktestResult | None"] = relationship(
        back_populates="backtest", cascade="all, delete-orphan", uselist=False
    )

    def __repr__(self) -> str:
        return f"<Backtest id={self.id} strategy={self.strategy_code!r} status={self.status}>"


class BacktestResult(Base):
    __tablename__ = "backtest_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    backtest_id: Mapped[int] = mapped_column(
        ForeignKey("backtests.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    # Time series stored as JSONB arrays: [{"ts": "...", "equity": 100000}, ...]
    equity_curve: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    drawdown_curve: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    trades: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Aggregate metrics
    metrics: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Per-symbol breakdown: {"AAPL": {"sharpe": 1.2, ...}, ...}
    per_symbol_metrics: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationship
    backtest: Mapped["Backtest"] = relationship(back_populates="result")

    def __repr__(self) -> str:
        return f"<BacktestResult backtest={self.backtest_id}>"
