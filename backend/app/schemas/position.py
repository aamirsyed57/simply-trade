"""VirtualPosition Pydantic schemas."""

from datetime import datetime
from decimal import Decimal

from app.schemas.base import APIModel
from app.schemas.symbol import SymbolRead


class PositionRead(APIModel):
    id: int
    portfolio_id: int
    symbol_id: int
    qty: Decimal
    avg_price: Decimal
    realized_pnl: Decimal
    unrealized_pnl: Decimal
    market_value: Decimal
    last_updated: datetime


class PositionReadDetailed(PositionRead):
    symbol: SymbolRead
