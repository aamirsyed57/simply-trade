"""Symbol model — a tradeable instrument."""

from sqlalchemy import String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class Symbol(Base, TimestampMixin):
    __tablename__ = "symbols"
    __table_args__ = (UniqueConstraint("ticker", "exchange", name="uq_symbol_ticker_exchange"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False)
    exchange: Mapped[str] = mapped_column(String(20), nullable=False)
    asset_class: Mapped[str] = mapped_column(String(20), nullable=False, default="STK")

    # IBKR contract metadata: {"currency": "USD", "primary_exchange": "NASDAQ", "secType": "STK"}
    contract_meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    assignments: Mapped[list["PortfolioSymbolStrategy"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="symbol"
    )
    positions: Mapped[list["VirtualPosition"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="symbol"
    )
    historical_bars: Mapped[list["HistoricalBar"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="symbol", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Symbol {self.ticker}:{self.exchange}>"
