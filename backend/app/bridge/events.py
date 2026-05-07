"""Redis pub/sub channels and event schemas for the IBKR Bridge."""

from datetime import datetime
from pydantic import BaseModel

# Redis Channels
CHANNEL_ORDER_REQUESTS = "orders:request"
CHANNEL_FILLS = "orders:fills"
CHANNEL_ORDER_STATUS = "orders:status"
CHANNEL_CONNECTION_STATUS = "bridge:connection"
CHANNEL_EMERGENCY = "bridge:emergency"
CHANNEL_COMMANDS = "bridge:commands"

class OrderRequestEvent(BaseModel):
    portfolio_id: int
    strategy_code: str
    symbol_id: int
    ticker: str
    exchange: str
    action: str  # BUY or SELL
    order_type: str  # MKT or LMT
    total_quantity: float
    limit_price: float | None = None
    mode: str  # live or paper

class FillEvent(BaseModel):
    order_ref: str
    ibkr_exec_id: str
    symbol_id: int
    qty: float
    price: float
    commission: float
    timestamp: datetime

class OrderStatusEvent(BaseModel):
    order_ref: str
    ibkr_order_id: int
    status: str
    filled: float
    remaining: float
    avg_fill_price: float

class ConnectionStatusEvent(BaseModel):
    connected: bool
    gateway_mode: str  # paper or live
    note: str

class EmergencyEvent(BaseModel):
    action: str  # cancel_all

class SyncCommandEvent(BaseModel):
    action: str  # req_open_orders
