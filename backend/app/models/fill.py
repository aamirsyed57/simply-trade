"""Fill model — execution report for an order."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Fill(Base):
    __tablename__ = "fills"

    id: Mapped[int] = mapped_column(primary_key=True)

    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # IBKR execution ID — unique per fill from IBKR
    ibkr_exec_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)

    qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    commission: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))

    # UTC timestamp of execution
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    order: Mapped["Order"] = relationship(back_populates="fills")  # type: ignore[name-defined]  # noqa: F821

    @property
    def notional(self) -> Decimal:
        return self.qty * self.price

    def __repr__(self) -> str:
        return f"<Fill id={self.id} order={self.order_id} qty={self.qty} price={self.price}>"
