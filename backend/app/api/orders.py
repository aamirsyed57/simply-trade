"""Orders router — order submission (stub in Phase 2; real execution in Phase 5)."""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import redis.asyncio as aioredis

from app.config import settings
from app.database import get_db
from app.models.order import Order, OrderStatus
from app.models.portfolio import Portfolio
from app.models.symbol import Symbol
from app.schemas.order import OrderCreate, OrderRead, ManualFillRequest
from app.services.order_service import OrderManager
from app.bridge.events import CHANNEL_ORDER_REQUESTS, OrderRequestEvent

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=list[OrderRead], summary="List orders (optionally filtered by portfolio)")
async def list_orders(
    portfolio_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Order).options(selectinload(Order.fills))
    if portfolio_id is not None:
        q = q.where(Order.portfolio_id == portfolio_id)
    result = await db.execute(q.order_by(Order.id.desc()))
    return result.scalars().all()


@router.post(
    "",
    response_model=OrderRead,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an order (paper/live routing wired in Phase 5)",
)
async def create_order(data: OrderCreate, db: AsyncSession = Depends(get_db)):
    portfolio = await db.get(Portfolio, data.portfolio_id)
    if portfolio is None:
        raise HTTPException(status_code=404, detail=f"Portfolio {data.portfolio_id} not found")

    symbol = await db.get(Symbol, data.symbol_id)
    if symbol is None:
        raise HTTPException(status_code=404, detail=f"Symbol {data.symbol_id} not found")

    if data.order_type.value == "LMT" and data.limit_price is None:
        raise HTTPException(status_code=422, detail="limit_price is required for LMT orders")

    client_order_id = str(uuid.uuid4())
    order_ref = f"pf:{data.portfolio_id}:{data.strategy_code}:{portfolio.mode.value}"

    order = Order(
        client_order_id=client_order_id,
        portfolio_id=data.portfolio_id,
        symbol_id=data.symbol_id,
        strategy_code=data.strategy_code,
        side=data.side,
        qty=data.qty,
        order_type=data.order_type,
        limit_price=data.limit_price,
        status=OrderStatus.PENDING,
        order_ref=order_ref,
        execution_mode=portfolio.mode.value,
    )
    db.add(order)
    await db.flush()
    # Reload with eager fills to satisfy the response schema
    result = await db.execute(
        select(Order).options(selectinload(Order.fills)).where(Order.id == order.id)
    )
    order = result.scalar_one()
    # Phase 5: dispatch to broker bridge here
    return order


@router.get("/{order_id}", response_model=OrderRead, summary="Get order by ID")
async def get_order(order_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Order).options(selectinload(Order.fills)).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post(
    "/{order_id}/retry",
    response_model=OrderRead,
    summary="Re-submit a pending order to the IBKR bridge via Redis",
)
async def retry_order(order_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Order).options(selectinload(Order.fills)).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status not in (OrderStatus.PENDING, OrderStatus.SUBMITTED):
        raise HTTPException(
            status_code=422,
            detail=f"Cannot retry order with status '{order.status.value}'",
        )
    if order.ibkr_order_id is not None:
        raise HTTPException(status_code=422, detail="Order already has an IBKR order ID")

    symbol = await db.get(Symbol, order.symbol_id)
    if symbol is None:
        raise HTTPException(status_code=404, detail="Symbol not found")

    event = OrderRequestEvent(
        portfolio_id=order.portfolio_id,
        strategy_code=order.strategy_code,
        symbol_id=order.symbol_id,
        ticker=symbol.ticker,
        exchange=symbol.exchange,
        action=order.side.value,
        order_type=order.order_type.value,
        total_quantity=float(order.qty),
        limit_price=float(order.limit_price) if order.limit_price else None,
        mode=order.execution_mode,
    )

    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await r.publish(CHANNEL_ORDER_REQUESTS, event.model_dump_json())
    finally:
        await r.aclose()

    return order


@router.post(
    "/{order_id}/fill",
    response_model=OrderRead,
    summary="Manually fill a pending order (used before Phase 5 bridge is live)",
)
async def fill_order(order_id: int, data: ManualFillRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Order).options(selectinload(Order.fills)).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status not in (OrderStatus.PENDING, OrderStatus.SUBMITTED):
        raise HTTPException(
            status_code=422,
            detail=f"Cannot fill order with status '{order.status.value}'",
        )

    # Ensure order is SUBMITTED before the fill handler runs
    order.status = OrderStatus.SUBMITTED
    await db.flush()

    om = OrderManager(db)
    await om.handle_fill(
        order_ref=order.order_ref,
        ibkr_exec_id=f"manual-{uuid.uuid4()}",
        qty=float(order.qty),
        price=float(data.fill_price),
        commission=0.0,
        timestamp=datetime.now(timezone.utc),
    )

    result = await db.execute(
        select(Order).options(selectinload(Order.fills)).where(Order.id == order_id)
    )
    return result.scalar_one()


@router.patch("/{order_id}/cancel", response_model=OrderRead, summary="Cancel a pending order")
async def cancel_order(order_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Order).options(selectinload(Order.fills)).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status not in (OrderStatus.PENDING, OrderStatus.SUBMITTED):
        raise HTTPException(
            status_code=422,
            detail=f"Cannot cancel order with status '{order.status.value}'",
        )
    order.status = OrderStatus.CANCELLED
    await db.flush()
    
    # Reload with eager fills to satisfy the response schema
    result = await db.execute(
        select(Order).options(selectinload(Order.fills)).where(Order.id == order_id)
    )
    return result.scalar_one()
