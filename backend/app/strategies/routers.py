"""Order Router abstractions for Live, Paper, and Simulated execution."""

from abc import ABC, abstractmethod
import logging
from typing import Literal

import redis.asyncio as redis

from app.config import settings
from app.bridge.events import OrderRequestEvent, CHANNEL_ORDER_REQUESTS

logger = logging.getLogger(__name__)


class OrderRouter(ABC):
    @abstractmethod
    async def place_order(
        self,
        portfolio_id: int,
        strategy_code: str,
        symbol_id: int,
        ticker: str,
        exchange: str,
        direction: Literal["BUY", "SELL"],
        qty: float,
        order_type: Literal["MKT", "LMT"],
        limit_price: float | None = None,
        mode: Literal["live", "paper", "backtest"] = "paper",
    ) -> str:
        """Place an order and return an internal order reference."""
        pass


class IBKRBridgeRouter(OrderRouter):
    """Submits orders to the IBKR Bridge via Redis."""
    
    def __init__(self):
        self.redis = redis.from_url(settings.REDIS_URL, decode_responses=True)

    async def place_order(
        self,
        portfolio_id: int,
        strategy_code: str,
        symbol_id: int,
        ticker: str,
        exchange: str,
        direction: Literal["BUY", "SELL"],
        qty: float,
        order_type: Literal["MKT", "LMT"],
        limit_price: float | None = None,
        mode: Literal["live", "paper", "backtest"] = "paper",
    ) -> str:
        if mode not in ("live", "paper"):
            raise ValueError("IBKRBridgeRouter only supports live or paper mode.")

        order_ref = f"pf:{portfolio_id}:{strategy_code}:{mode}"
        
        event = OrderRequestEvent(
            portfolio_id=portfolio_id,
            strategy_code=strategy_code,
            symbol_id=symbol_id,
            ticker=ticker,
            exchange=exchange,
            action=direction,
            order_type=order_type,
            total_quantity=qty,
            limit_price=limit_price,
            mode=mode,
        )
        
        logger.info(f"Publishing order to bridge: {order_ref}")
        await self.redis.publish(CHANNEL_ORDER_REQUESTS, event.model_dump_json())
        return order_ref

    async def close(self):
        await self.redis.aclose()


class SimulatedRouter(OrderRouter):
    """In-memory queue for backtesting fills."""
    
    def __init__(self):
        self.pending_orders = []
        
    async def place_order(
        self,
        portfolio_id: int,
        strategy_code: str,
        symbol_id: int,
        ticker: str,
        exchange: str,
        direction: Literal["BUY", "SELL"],
        qty: float,
        order_type: Literal["MKT", "LMT"],
        limit_price: float | None = None,
        mode: Literal["live", "paper", "backtest"] = "backtest",
    ) -> str:
        order_ref = f"pf:{portfolio_id}:{strategy_code}:backtest"
        order = {
            "order_ref": order_ref,
            "symbol_id": symbol_id,
            "direction": direction,
            "qty": qty,
            "order_type": order_type,
            "limit_price": limit_price,
        }
        self.pending_orders.append(order)
        logger.info(f"SimulatedRouter accepted order: {order_ref}")
        return order_ref
