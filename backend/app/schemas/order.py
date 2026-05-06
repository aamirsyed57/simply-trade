"""Order and Fill Pydantic schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.models.order import OrderSide, OrderStatus, OrderType
from app.schemas.base import APIModel


class OrderCreate(APIModel):
    portfolio_id: int
    symbol_id: int
    strategy_code: str = Field(..., min_length=1, max_length=50)
    side: OrderSide
    qty: Decimal = Field(..., gt=0)
    order_type: OrderType = OrderType.MKT
    limit_price: Decimal | None = Field(None, gt=0)


class FillRead(APIModel):
    id: int
    order_id: int
    ibkr_exec_id: str
    qty: Decimal
    price: Decimal
    commission: Decimal
    ts: datetime


class OrderRead(APIModel):
    id: int
    client_order_id: str
    ibkr_order_id: int | None
    portfolio_id: int
    symbol_id: int
    strategy_code: str
    side: OrderSide
    qty: Decimal
    order_type: OrderType
    limit_price: Decimal | None
    status: OrderStatus
    order_ref: str
    reserved_cash: Decimal
    execution_mode: str
    created_at: datetime
    updated_at: datetime
    fills: list[FillRead] = []
