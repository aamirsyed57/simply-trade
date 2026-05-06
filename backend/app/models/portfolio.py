"""Portfolio model — virtual portfolio on a single IBKR account."""

import enum
from decimal import Decimal

from sqlalchemy import CheckConstraint, Enum, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class PortfolioMode(str, enum.Enum):
    PAPER = "paper"
    LIVE = "live"


class PortfolioStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    DISABLED = "disabled"


class Portfolio(Base, TimestampMixin):
    __tablename__ = "portfolios"
    __table_args__ = (
        CheckConstraint("budget_total > 0", name="ck_portfolio_budget_positive"),
        CheckConstraint("cash_reserved >= 0", name="ck_portfolio_cash_reserved_nonneg"),
        CheckConstraint("cash_deployed >= 0", name="ck_portfolio_cash_deployed_nonneg"),
        CheckConstraint(
            "budget_total - cash_reserved - cash_deployed >= 0",
            name="ck_portfolio_cash_available_nonneg",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mode: Mapped[PortfolioMode] = mapped_column(
        Enum(PortfolioMode, name="portfolio_mode"), nullable=False, default=PortfolioMode.PAPER
    )
    status: Mapped[PortfolioStatus] = mapped_column(
        Enum(PortfolioStatus, name="portfolio_status"), nullable=False, default=PortfolioStatus.ACTIVE
    )
    # Reserved for future real sub-account routing (§4.3)
    ibkr_account_code: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)

    # Cash accounting (all USD, v1)
    budget_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    cash_reserved: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, server_default="0")
    cash_deployed: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, server_default="0")

    # PnL
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, server_default="0")
    unrealized_pnl_cached: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, server_default="0")

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    assignments: Mapped[list["PortfolioSymbolStrategy"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="portfolio", cascade="all, delete-orphan"
    )
    orders: Mapped[list["Order"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="portfolio", cascade="all, delete-orphan"
    )
    positions: Mapped[list["VirtualPosition"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="portfolio", cascade="all, delete-orphan"
    )

    @property
    def cash_available(self) -> Decimal:
        return self.budget_total - self.cash_reserved - self.cash_deployed

    def __repr__(self) -> str:
        return f"<Portfolio id={self.id} name={self.name!r} mode={self.mode}>"
