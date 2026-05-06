"""PortfolioSymbolStrategy — assignment of a strategy to a symbol within a portfolio."""

from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class PortfolioSymbolStrategy(Base, TimestampMixin):
    __tablename__ = "portfolio_symbol_strategies"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "symbol_id", name="uq_assignment_portfolio_symbol"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    portfolio_id: Mapped[int] = mapped_column(
        ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol_id: Mapped[int] = mapped_column(
        ForeignKey("symbols.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    strategy_code: Mapped[str] = mapped_column(
        ForeignKey("strategies.code", ondelete="RESTRICT"), nullable=False
    )

    # Custom parameters for this assignment (overrides strategy defaults)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Capital allocation in USD for this assignment
    allocation: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)

    # Whether this assignment is actively running
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Relationships
    portfolio: Mapped["Portfolio"] = relationship(back_populates="assignments")  # type: ignore[name-defined]  # noqa: F821
    symbol: Mapped["Symbol"] = relationship(back_populates="assignments")  # type: ignore[name-defined]  # noqa: F821
    strategy: Mapped["Strategy"] = relationship(back_populates="assignments")  # type: ignore[name-defined]  # noqa: F821

    def __repr__(self) -> str:
        return f"<Assignment portfolio={self.portfolio_id} symbol={self.symbol_id} strategy={self.strategy_code!r}>"
