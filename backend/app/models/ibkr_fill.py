"""IBKRFill — one row per IBKR execution report, platform and orphan alike."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, DateTime, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IBKRFill(Base):
    __tablename__ = "ibkr_fills"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ibkr_exec_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    ibkr_order_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    order_ref: Mapped[str] = mapped_column(String, nullable=False, default="")
    ticker: Mapped[str] = mapped_column(String, nullable=False, default="")
    exchange: Mapped[str] = mapped_column(String, nullable=False, default="")
    action: Mapped[str] = mapped_column(String, nullable=False, default="")   # BUY / SELL
    qty: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    commission: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False, default=Decimal("0"))
    is_platform_order: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    execution_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="")  # paper | live | ""
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
