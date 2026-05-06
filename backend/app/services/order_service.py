"""OrderManager — pre-trade validation, cash management, and fill handling."""

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import PortfolioSymbolStrategy
from app.models.fill import Fill
from app.models.order import Order, OrderSide, OrderStatus, OrderType
from app.models.portfolio import Portfolio
from app.models.position import VirtualPosition
from app.strategies.signals import Signal

logger = logging.getLogger(__name__)


class InsufficientCashError(Exception):
    pass


class OrderManager:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def submit_order(
        self,
        assignment: PortfolioSymbolStrategy,
        signal: Signal,
        mode: str = "paper",
    ) -> Order:
        """
        Validate cash availability, reserve notional, and create an Order row.
        The bridge receives the order via Redis (handled by IBKRBridgeRouter).
        """
        portfolio = await self.db.get(Portfolio, assignment.portfolio_id)
        if not portfolio:
            raise ValueError(f"Portfolio {assignment.portfolio_id} not found")

        # Estimate notional (we don't have a live price here; use allocation as proxy)
        qty = Decimal(str(signal.qty))
        notional = qty * Decimal(str(signal.limit_price)) if signal.limit_price else assignment.allocation

        if notional > portfolio.cash_available:
            raise InsufficientCashError(
                f"Insufficient cash: notional={notional}, available={portfolio.cash_available}"
            )

        order_ref = f"pf:{assignment.portfolio_id}:{assignment.strategy_code}:{mode}"
        client_order_id = str(uuid.uuid4())

        order = Order(
            client_order_id=client_order_id,
            portfolio_id=assignment.portfolio_id,
            symbol_id=assignment.symbol_id,
            strategy_code=assignment.strategy_code,
            side=OrderSide(signal.direction),
            qty=qty,
            order_type=OrderType(signal.order_type),
            limit_price=Decimal(str(signal.limit_price)) if signal.limit_price else None,
            status=OrderStatus.SUBMITTED,
            order_ref=order_ref,
            reserved_cash=notional,
            execution_mode=mode,
        )

        # Reserve cash atomically
        portfolio.cash_reserved = portfolio.cash_reserved + notional

        self.db.add(order)
        await self.db.flush()  # Get the ID without committing

        logger.info(
            f"Submitted order {client_order_id}: {signal.direction} {qty} "
            f"(mode={mode}, notional={notional}, reserved={portfolio.cash_reserved})"
        )
        return order

    async def handle_fill(
        self,
        order_ref: str,
        ibkr_exec_id: str,
        qty: float,
        price: float,
        commission: float,
        timestamp: datetime,
    ) -> Fill | None:
        """
        On receiving a fill event from the bridge:
        - Find the open Order by order_ref
        - Create a Fill row
        - Update VirtualPosition (FIFO average)
        - Move cash_reserved → cash_deployed
        """
        result = await self.db.execute(
            select(Order)
            .where(Order.order_ref == order_ref)
            .where(Order.status.in_([OrderStatus.SUBMITTED, OrderStatus.PARTIALLY_FILLED]))
            .order_by(Order.created_at.desc())
        )
        order = result.scalars().first()

        if not order:
            logger.warning(f"No open order found for order_ref={order_ref}, ignoring fill")
            return None

        fill_qty = Decimal(str(qty))
        fill_price = Decimal(str(price))
        fill_commission = Decimal(str(commission))
        notional = fill_qty * fill_price

        # Create Fill record
        fill = Fill(
            order_id=order.id,
            ibkr_exec_id=ibkr_exec_id,
            qty=fill_qty,
            price=fill_price,
            commission=fill_commission,
            ts=timestamp,
        )
        self.db.add(fill)

        # Update order status
        if fill_qty >= order.qty:
            order.status = OrderStatus.FILLED
        else:
            order.status = OrderStatus.PARTIALLY_FILLED

        # Move cash_reserved → cash_deployed
        portfolio = await self.db.get(Portfolio, order.portfolio_id)
        if portfolio:
            cash_to_move = min(order.reserved_cash, notional)
            portfolio.cash_reserved = max(Decimal("0"), portfolio.cash_reserved - cash_to_move)
            portfolio.cash_deployed = portfolio.cash_deployed + notional

        # Update VirtualPosition (FIFO average cost)
        result = await self.db.execute(
            select(VirtualPosition).where(
                VirtualPosition.portfolio_id == order.portfolio_id,
                VirtualPosition.symbol_id == order.symbol_id,
            )
        )
        position = result.scalars().first()

        if not position:
            position = VirtualPosition(
                portfolio_id=order.portfolio_id,
                symbol_id=order.symbol_id,
                qty=Decimal("0"),
                avg_price=Decimal("0"),
            )
            self.db.add(position)

        if order.side == OrderSide.BUY:
            total_cost = (position.qty * position.avg_price) + notional
            position.qty = position.qty + fill_qty
            if position.qty > 0:
                position.avg_price = total_cost / position.qty
        elif order.side == OrderSide.SELL:
            realized = fill_qty * (fill_price - position.avg_price)
            position.qty = position.qty - fill_qty
            position.realized_pnl = position.realized_pnl + realized
            if portfolio:
                portfolio.realized_pnl = portfolio.realized_pnl + realized

        position.last_updated = datetime.now(timezone.utc)

        await self.db.flush()
        logger.info(f"Processed fill: order_ref={order_ref}, qty={qty}, price={price}")
        return fill

    # IBKR status strings → our OrderStatus
    _IBKR_STATUS_MAP: dict[str, OrderStatus] = {
        "PreSubmitted": OrderStatus.SUBMITTED,
        "Submitted": OrderStatus.SUBMITTED,
        "Filled": OrderStatus.FILLED,
        "Cancelled": OrderStatus.CANCELLED,
        "Inactive": OrderStatus.CANCELLED,
    }

    async def handle_order_status(
        self,
        order_ref: str,
        ibkr_order_id: int,
        status: str,
    ) -> Order | None:
        """
        Update Order.ibkr_order_id and status from an IBKR OrderStatus event.
        Matches the most recent open order for the given order_ref that has no
        ibkr_order_id yet (first call) or matches the known ibkr_order_id.
        """
        result = await self.db.execute(
            select(Order)
            .where(Order.order_ref == order_ref)
            .where(Order.status.in_([OrderStatus.PENDING, OrderStatus.SUBMITTED, OrderStatus.PARTIALLY_FILLED]))
            .where(
                (Order.ibkr_order_id == ibkr_order_id) | (Order.ibkr_order_id == None)  # noqa: E711
            )
            .order_by(Order.created_at.desc())
        )
        order = result.scalars().first()
        if not order:
            logger.warning(f"handle_order_status: no open order for ref={order_ref} ibkr_id={ibkr_order_id}")
            return None

        if order.ibkr_order_id is None:
            order.ibkr_order_id = ibkr_order_id

        new_status = self._IBKR_STATUS_MAP.get(status)
        if new_status:
            order.status = new_status

        await self.db.flush()
        logger.info(f"Order status updated: ref={order_ref} ibkr_id={ibkr_order_id} status={status}")
        return order

    async def handle_cancel(self, order_id: int) -> Order | None:
        """Release cash_reserved and mark order as cancelled."""
        order = await self.db.get(Order, order_id)
        if not order or order.status in (OrderStatus.FILLED, OrderStatus.CANCELLED):
            return None

        portfolio = await self.db.get(Portfolio, order.portfolio_id)
        if portfolio:
            portfolio.cash_reserved = max(Decimal("0"), portfolio.cash_reserved - order.reserved_cash)

        order.status = OrderStatus.CANCELLED
        await self.db.flush()

        logger.info(f"Cancelled order {order_id}, released cash_reserved={order.reserved_cash}")
        return order
