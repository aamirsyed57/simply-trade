"""VirtualPosition — per-(portfolio, symbol) position view."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VirtualPosition(Base):
    __tablename__ = "virtual_positions"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "symbol_id", name="uq_vpos_portfolio_symbol"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    portfolio_id: Mapped[int] = mapped_column(
        ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol_id: Mapped[int] = mapped_column(
        ForeignKey("symbols.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    # Net quantity held (positive = long, negative = short)
    qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))

    # Volume-weighted average cost basis
    avg_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))

    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))

    # Cached unrealized PnL — refreshed on each market data tick
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))

    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    portfolio: Mapped["Portfolio"] = relationship(back_populates="positions")  # type: ignore[name-defined]  # noqa: F821
    symbol: Mapped["Symbol"] = relationship(back_populates="positions")  # type: ignore[name-defined]  # noqa: F821

    @property
    def market_value(self) -> Decimal:
        return self.qty * self.avg_price

    def __repr__(self) -> str:
        return f"<VirtualPosition portfolio={self.portfolio_id} symbol={self.symbol_id} qty={self.qty}>"
