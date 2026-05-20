"""Order model — every IBKR order placed by the platform."""

import enum
from decimal import Decimal

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class OrderSide(str, enum.Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(str, enum.Enum):
    """V1: MKT and LMT only. STP/BRACKET deferred."""
    MKT = "MKT"
    LMT = "LMT"


class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


class Order(Base, TimestampMixin):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint("reserved_cash >= 0", name="ck_order_reserved_cash_nonneg"),
        CheckConstraint("qty > 0", name="ck_order_qty_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # Our internal order ID (UUID stored as string for IBKR compatibility)
    client_order_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)

    # IBKR-assigned order ID (set after submission, volatile per session)
    ibkr_order_id: Mapped[int | None] = mapped_column(nullable=True)

    # IBKR Permanent ID (globally unique across sessions)
    ibkr_perm_id: Mapped[int | None] = mapped_column(nullable=True)

    # Non-negotiable: every order must have a portfolio_id (§4.2)
    portfolio_id: Mapped[int] = mapped_column(
        ForeignKey("portfolios.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    symbol_id: Mapped[int] = mapped_column(
        ForeignKey("symbols.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    strategy_code: Mapped[str] = mapped_column(String(50), nullable=False)

    side: Mapped[OrderSide] = mapped_column(Enum(OrderSide, name="order_side"), nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    order_type: Mapped[OrderType] = mapped_column(Enum(OrderType, name="order_type"), nullable=False)
    limit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)

    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status"), nullable=False, default=OrderStatus.PENDING
    )

    # IBKR orderRef: "pf:{portfolio_id}:{strategy_code}:{mode}" — non-negotiable
    order_ref: Mapped[str] = mapped_column(String(255), nullable=False)

    # Cash reserved at order submission; released on fill or cancel
    reserved_cash: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))

    execution_mode: Mapped[str] = mapped_column(String(20), nullable=False)  # live | paper | backtest

    # Relationships
    portfolio: Mapped["Portfolio"] = relationship(back_populates="orders")  # type: ignore[name-defined]  # noqa: F821
    symbol: Mapped["Symbol"] = relationship()  # type: ignore[name-defined]  # noqa: F821
    fills: Mapped[list["Fill"]] = relationship(back_populates="order", cascade="all, delete-orphan")  # type: ignore[name-defined]  # noqa: F821

    def __repr__(self) -> str:
        return f"<Order id={self.id} {self.side} {self.qty} {self.order_type} status={self.status}>"
