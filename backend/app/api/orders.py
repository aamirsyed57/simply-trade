"""Orders router — order submission (stub in Phase 2; real execution in Phase 5)."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.order import Order, OrderStatus
from app.models.portfolio import Portfolio
from app.models.symbol import Symbol
from app.schemas.order import OrderCreate, OrderRead

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
