"""Portfolio Pydantic schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import Field, field_validator

from app.models.portfolio import PortfolioMode, PortfolioStatus
from app.schemas.base import APIModel


class PortfolioCreate(APIModel):
    name: str = Field(..., min_length=1, max_length=255, examples=["My Paper Portfolio"])
    mode: PortfolioMode = PortfolioMode.PAPER
    budget_total: Decimal = Field(..., gt=0, examples=[100000])
    description: str | None = None
    ibkr_account_code: str | None = None


class PortfolioUpdate(APIModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    status: PortfolioStatus | None = None
    description: str | None = None


class PortfolioRead(APIModel):
    id: int
    name: str
    mode: PortfolioMode
    status: PortfolioStatus
    ibkr_account_code: str | None
    budget_total: Decimal
    cash_reserved: Decimal
    cash_deployed: Decimal
    cash_available: Decimal
    realized_pnl: Decimal
    unrealized_pnl_cached: Decimal
    description: str | None
    created_at: datetime
    updated_at: datetime
