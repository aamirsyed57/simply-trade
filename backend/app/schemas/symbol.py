"""Symbol Pydantic schemas."""

from datetime import datetime

from pydantic import Field

from app.schemas.base import APIModel


class SymbolCreate(APIModel):
    ticker: str = Field(..., min_length=1, max_length=20, examples=["AAPL"])
    exchange: str = Field(..., min_length=1, max_length=20, examples=["NASDAQ"])
    asset_class: str = Field("STK", max_length=20)
    contract_meta: dict = Field(
        default_factory=dict,
        examples=[{"currency": "USD", "primary_exchange": "NASDAQ", "secType": "STK"}],
    )


class SymbolRead(APIModel):
    id: int
    ticker: str
    exchange: str
    asset_class: str
    contract_meta: dict
    created_at: datetime
    updated_at: datetime
