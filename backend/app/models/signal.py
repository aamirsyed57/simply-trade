"""Signal / TradeLog model — every strategy decision recorded for audit."""

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SignalDirection(str, enum.Enum):
    LONG = "long"
    SHORT = "short"
    EXIT = "exit"
    HOLD = "hold"


class Signal(Base):
    __tablename__ = "signals"

    id: Mapped[int] = mapped_column(primary_key=True)

    portfolio_id: Mapped[int] = mapped_column(
        ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol_id: Mapped[int] = mapped_column(
        ForeignKey("symbols.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    strategy_code: Mapped[str] = mapped_column(String(50), nullable=False)
    strategy_version: Mapped[str] = mapped_column(String(20), nullable=False, default="0.1.0")

    direction: Mapped[SignalDirection] = mapped_column(
        Enum(SignalDirection, name="signal_direction"), nullable=False
    )

    # Trigger price at signal generation time
    trigger_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)

    # Human-readable explanation of why the signal fired
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")

    execution_mode: Mapped[str] = mapped_column(String(20), nullable=False)

    # Linked order (nullable — signal may be generated but not acted upon)
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )

    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    def __repr__(self) -> str:
        return f"<Signal id={self.id} {self.strategy_code} {self.direction} @ {self.ts}>"
