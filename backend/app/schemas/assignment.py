"""Assignment (PortfolioSymbolStrategy) Pydantic schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.base import APIModel
from app.schemas.portfolio import PortfolioRead
from app.schemas.strategy import StrategyRead
from app.schemas.symbol import SymbolRead


class AssignmentCreate(APIModel):
    portfolio_id: int
    symbol_id: int
    strategy_code: str = Field(..., min_length=1, max_length=50)
    params: dict = Field(default_factory=dict)
    allocation: Decimal = Field(..., gt=0)


class AssignmentUpdate(APIModel):
    params: dict | None = None
    allocation: Decimal | None = Field(None, gt=0)
    enabled: bool | None = None


class AssignmentRead(APIModel):
    id: int
    portfolio_id: int
    symbol_id: int
    strategy_code: str
    params: dict
    allocation: Decimal
    enabled: bool
    created_at: datetime
    updated_at: datetime


class AssignmentReadDetailed(AssignmentRead):
    """Assignment with nested portfolio, symbol, strategy objects."""
    portfolio: PortfolioRead
    symbol: SymbolRead
    strategy: StrategyRead
