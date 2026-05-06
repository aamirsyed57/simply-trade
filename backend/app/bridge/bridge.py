"""Main process for the IBKR Bridge."""

import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
import redis.asyncio as redis
from ib_insync import Contract, Order as IBOrder, Trade, Fill

from app.config import settings
from app.bridge.connection import IBKRConnection
from app.bridge.events import (
    CHANNEL_ORDER_REQUESTS,
    CHANNEL_FILLS,
    CHANNEL_ORDER_STATUS,
    CHANNEL_CONNECTION_STATUS,
    CHANNEL_EMERGENCY,
    OrderRequestEvent,
    FillEvent,
    OrderStatusEvent,
    ConnectionStatusEvent,
    EmergencyEvent,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("ibkr-bridge")

class BridgeService:
    def __init__(self):
        self.redis_pub = redis.from_url(settings.REDIS_URL, decode_responses=True)
        self.redis_sub = redis.from_url(settings.REDIS_URL, decode_responses=True)
        self.pubsub = self.redis_sub.pubsub()
        
        self.ibkr = IBKRConnection(
            host=settings.TWS_PAPER_HOST,
            port=settings.TWS_PAPER_PORT,
            client_id=1,
        )
        
        self.ibkr.on_fill = self._on_fill
        self.ibkr.on_status = self._on_order_status
        self.ibkr.on_connection_change = self._on_connection_change
        self.ibkr.on_account_value = self._on_account_value

        # Tags we want to surface in the API
        self._account_tags = {
            "NetLiquidation", "TotalCashValue", "BuyingPower",
            "UnrealizedPnL", "RealizedPnL", "GrossPositionValue",
            "DayTradesRemaining", "MaintMarginReq", "AvailableFunds",
        }
        self._account_snapshot: dict[str, str] = {}

    def _on_account_value(self, value):
        if value.tag not in self._account_tags or value.currency != "USD":
            return
        self._account_snapshot[value.tag] = value.value
        asyncio.create_task(
            self.redis_pub.set("bridge:account_values", json.dumps(self._account_snapshot))
        )

    def _on_connection_change(self, connected: bool):
        event = ConnectionStatusEvent(
            connected=connected,
            gateway_mode="paper",
            note="Connected to paper gateway" if connected else "Disconnected from paper gateway",
        )
        asyncio.create_task(self.redis_pub.publish(CHANNEL_CONNECTION_STATUS, event.model_dump_json()))
        asyncio.create_task(self.redis_pub.set("bridge:connection_status", event.model_dump_json()))

    def _on_fill(self, trade: Trade, fill: Fill):
        order_ref = trade.order.orderRef
        event = FillEvent(
            order_ref=order_ref,
            ibkr_exec_id=fill.execution.execId,
            symbol_id=0,  # Will be mapped by order_ref in the worker
            qty=float(fill.execution.shares),
            price=float(fill.execution.price),
            commission=float(fill.commissionReport.commission) if fill.commissionReport else 0.0,
            timestamp=datetime.now(timezone.utc)
        )
        asyncio.create_task(self.redis_pub.publish(CHANNEL_FILLS, event.model_dump_json()))

    def _on_order_status(self, trade: Trade):
        event = OrderStatusEvent(
            order_ref=trade.order.orderRef,
            status=trade.orderStatus.status,
            filled=float(trade.orderStatus.filled),
            remaining=float(trade.orderStatus.remaining),
            avg_fill_price=float(trade.orderStatus.avgFillPrice),
        )
        asyncio.create_task(self.redis_pub.publish(CHANNEL_ORDER_STATUS, event.model_dump_json()))

    async def _handle_order_request(self, event_data: str):
        try:
            req = OrderRequestEvent.model_validate_json(event_data)
        except Exception as e:
            logger.error(f"Invalid OrderRequestEvent: {e}")
            return

        if not self.ibkr.connected:
            logger.error("Bridge not connected to IBKR. Dropping order request.")
            return

        bp = self.ibkr.get_buying_power()
        logger.info(f"Account Buying Power: {bp}")

        contract = Contract()
        contract.symbol = req.ticker
        contract.secType = "STK"
        contract.exchange = req.exchange
        contract.currency = "USD"

        order = IBOrder()
        order.action = req.action
        order.orderType = req.order_type
        order.totalQuantity = req.total_quantity
        if req.limit_price:
            order.lmtPrice = req.limit_price
            
        order.orderRef = f"pf:{req.portfolio_id}:{req.strategy_code}:{req.mode}"

        try:
            self.ibkr.place_order(contract, order)
        except Exception as e:
            logger.error(f"Failed to place order: {e}")

    async def _handle_emergency(self, event_data: str):
        try:
            req = EmergencyEvent.model_validate_json(event_data)
            if req.action == "cancel_all":
                self.ibkr.cancel_all_orders()
        except Exception as e:
            logger.error(f"Invalid EmergencyEvent: {e}")

    async def _redis_listener(self):
        await self.pubsub.subscribe(CHANNEL_ORDER_REQUESTS, CHANNEL_EMERGENCY)
        logger.info(f"Subscribed to Redis channels: {CHANNEL_ORDER_REQUESTS}, {CHANNEL_EMERGENCY}")
        
        async for message in self.pubsub.listen():
            if message["type"] == "message":
                channel = message["channel"]
                data = message["data"]
                if channel == CHANNEL_ORDER_REQUESTS:
                    await self._handle_order_request(data)
                elif channel == CHANNEL_EMERGENCY:
                    await self._handle_emergency(data)

    async def _check_initial_connection(self):
        # We need to wait until connected to reqAccountUpdates
        # But we don't want to block the bridge start
        while not self.ibkr.connected:
            await asyncio.sleep(1)
        try:
            self.ibkr.ib.reqAccountUpdates(True)
        except Exception as e:
            logger.error(f"Failed to request account updates: {e}")

    async def start(self):
        logger.info("Starting IBKR Bridge...")
        asyncio.create_task(self.ibkr.connect_with_retry())
        asyncio.create_task(self._check_initial_connection())
        await self._redis_listener()


async def main():
    bridge = BridgeService()
    try:
        await bridge.start()
    except KeyboardInterrupt:
        logger.info("Shutting down bridge...")
        sys.exit(0)

if __name__ == "__main__":
    asyncio.run(main())
