import asyncio
import logging
from typing import Callable
import ib_insync
from ib_insync import IB, Contract, Order, Trade, AccountValue

logger = logging.getLogger(__name__)

class IBKRConnection:
    def __init__(self, host: str, port: int, client_id: int = 1):
        self.host = host
        self.port = port
        self.client_id = client_id
        self.ib = IB()
        self.connected = False

        # Callbacks
        self.on_fill: Callable[[Trade, ib_insync.Fill], None] | None = None
        self.on_status: Callable[[Trade], None] | None = None
        self.on_open_order: Callable[[Trade], None] | None = None
        self.on_connection_change: Callable[[bool], None] | None = None
        self.on_account_value: Callable[[AccountValue], None] | None = None

        self.ib.connectedEvent += self._on_connected
        self.ib.disconnectedEvent += self._on_disconnected
        self.ib.execDetailsEvent += self._on_exec_details
        self.ib.orderStatusEvent += self._on_order_status
        self.ib.openOrderEvent += self._on_open_order
        self.ib.accountValueEvent += self._on_account_value

    async def connect_with_retry(self):
        while not self.connected:
            try:
                logger.info(f"Attempting connection to IB Gateway at {self.host}:{self.port}")
                await self.ib.connectAsync(self.host, self.port, clientId=self.client_id, timeout=10)
                # self.connected is set in _on_connected
                return
            except Exception as e:
                logger.warning(f"Connection failed: {e}. Retrying in 5 seconds...")
                await asyncio.sleep(5)

    def _on_connected(self):
        logger.info("Connected to IB Gateway")
        self.connected = True
        if self.on_connection_change:
            self.on_connection_change(True)

    def _on_disconnected(self):
        logger.warning("Disconnected from IB Gateway")
        self.connected = False
        if self.on_connection_change:
            self.on_connection_change(False)
        # Attempt reconnect
        asyncio.create_task(self.connect_with_retry())

    def _on_exec_details(self, trade: Trade, fill: ib_insync.Fill):
        if self.on_fill:
            self.on_fill(trade, fill)

    def _on_order_status(self, trade: Trade):
        if self.on_status:
            self.on_status(trade)

    def _on_open_order(self, trade: Trade):
        if self.on_open_order:
            self.on_open_order(trade)

    def _on_account_value(self, value: AccountValue):
        if self.on_account_value:
            self.on_account_value(value)

    def place_order(self, contract: Contract, order: Order) -> Trade:
        if not self.connected:
            raise RuntimeError("Cannot place order: Not connected to IBKR")
        logger.info(f"Placing order: {order.action} {order.totalQuantity} {contract.symbol} {order.orderType}")
        return self.ib.placeOrder(contract, order)

    def cancel_all_orders(self):
        if not self.connected:
            return
        logger.info("Cancelling all open orders")
        self.ib.reqGlobalCancel()

    def get_buying_power(self) -> float:
        if not self.connected:
            return 0.0
        
        # Pull from cached account values
        for val in self.ib.accountValues():
            if val.tag == "BuyingPower":
                try:
                    return float(val.value)
                except ValueError:
                    return 0.0
        return 0.0
