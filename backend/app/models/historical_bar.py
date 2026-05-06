"""HistoricalBar — cached OHLCV bars for backtesting and market data."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class HistoricalBar(Base):
    __tablename__ = "historical_bars"
    __table_args__ = (
        UniqueConstraint("symbol_id", "timeframe", "ts", name="uq_bar_symbol_timeframe_ts"),
        Index("ix_bar_symbol_timeframe_ts", "symbol_id", "timeframe", "ts"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    symbol_id: Mapped[int] = mapped_column(
        ForeignKey("symbols.id", ondelete="CASCADE"), nullable=False
    )

    # Timeframe string: "1m", "5m", "15m", "1h", "1d"
    timeframe: Mapped[str] = mapped_column(String(10), nullable=False)

    # UTC timestamp of the bar open
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    open: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    high: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    low: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    close: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    volume: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)

    # Data source tag: "ibkr", "parquet"
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="ibkr")

    # Relationships
    symbol: Mapped["Symbol"] = relationship(back_populates="historical_bars")  # type: ignore[name-defined]  # noqa: F821

    def __repr__(self) -> str:
        return f"<HistoricalBar symbol={self.symbol_id} {self.timeframe} @ {self.ts}>"
