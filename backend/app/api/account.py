"""Account summary API endpoint."""

import json
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.config import settings
from app.database import get_db
from app.models.ibkr_fill import IBKRFill
from app.models.ibkr_order import IBKROrder
from app.models.portfolio import Portfolio
from app.models.position import VirtualPosition
from app.models.order import Order, OrderStatus

router = APIRouter(prefix="/account", tags=["account"])


class AccountSummary(BaseModel):
    portfolio_count: int
    total_budget: float
    total_cash_available: float
    total_cash_reserved: float
    total_cash_deployed: float
    total_realized_pnl: float
    total_unrealized_pnl: float
    open_position_count: int


@router.get("/summary", response_model=AccountSummary, summary="Aggregate stats across all portfolios")
async def get_account_summary(db: AsyncSession = Depends(get_db)):
    portfolios_result = await db.execute(
        select(
            func.count(Portfolio.id).label("count"),
            func.coalesce(func.sum(Portfolio.budget_total), 0).label("budget"),
            func.coalesce(func.sum(Portfolio.cash_reserved), 0).label("reserved"),
            func.coalesce(func.sum(Portfolio.cash_deployed), 0).label("deployed"),
            func.coalesce(func.sum(Portfolio.realized_pnl), 0).label("realized_pnl"),
            func.coalesce(func.sum(Portfolio.unrealized_pnl_cached), 0).label("unrealized_pnl"),
        )
    )
    row = portfolios_result.one()

    positions_result = await db.execute(
        select(func.count(VirtualPosition.id)).where(VirtualPosition.qty != 0)
    )
    open_positions = positions_result.scalar_one()

    budget = float(row.budget)
    reserved = float(row.reserved)
    deployed = float(row.deployed)

    return AccountSummary(
        portfolio_count=int(row.count),
        total_budget=budget,
        total_cash_available=budget - reserved - deployed,
        total_cash_reserved=reserved,
        total_cash_deployed=deployed,
        total_realized_pnl=float(row.realized_pnl),
        total_unrealized_pnl=float(row.unrealized_pnl),
        open_position_count=int(open_positions),
    )


class IBKRAccountSummary(BaseModel):
    net_liquidation: float | None = None
    total_cash: float | None = None
    buying_power: float | None = None
    unrealized_pnl: float | None = None
    realized_pnl: float | None = None
    gross_position_value: float | None = None
    available_funds: float | None = None
    maint_margin_req: float | None = None
    day_trades_remaining: float | None = None


@router.get("/ibkr", response_model=IBKRAccountSummary, summary="Live account values from IBKR bridge")
async def get_ibkr_account():
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        raw = await r.get("bridge:account_values")
    finally:
        await r.aclose()

    if not raw:
        return IBKRAccountSummary()

    data: dict[str, str] = json.loads(raw)

    def f(key: str) -> float | None:
        v = data.get(key)
        try:
            return float(v) if v is not None else None
        except (ValueError, TypeError):
            return None

    return IBKRAccountSummary(
        net_liquidation=f("NetLiquidation"),
        total_cash=f("TotalCashValue"),
        buying_power=f("BuyingPower"),
        unrealized_pnl=f("UnrealizedPnL"),
        realized_pnl=f("RealizedPnL"),
        gross_position_value=f("GrossPositionValue"),
        available_funds=f("AvailableFunds"),
        maint_margin_req=f("MaintMarginReq"),
        day_trades_remaining=f("DayTradesRemaining"),
    )


class IBKROrderEntry(BaseModel):
    ibkr_order_id: int
    order_ref: str
    ticker: str
    exchange: str
    action: str
    order_type: str
    total_quantity: float
    limit_price: float | None
    status: str
    filled: float
    remaining: float
    avg_fill_price: float
    is_platform_order: bool
    is_live: bool          # True if the order is still open in the bridge right now
    execution_mode: str    # paper | live | ""
    first_seen_at: str
    last_updated_at: str


class IBKRDBOrphan(BaseModel):
    id: int
    order_ref: str
    side: str
    qty: float
    order_type: str
    status: str
    created_at: str
    portfolio_id: int
    symbol_id: int
    strategy_code: str


class IBKROrdersResponse(BaseModel):
    ibkr_orders: list[IBKROrderEntry]
    db_orphans: list[IBKRDBOrphan]


@router.get("/ibkr-orders", response_model=IBKROrdersResponse, summary="Persisted IBKR orders + DB orphans")
async def get_ibkr_orders(db: AsyncSession = Depends(get_db)):
    # Read the live Redis hash to know which orders are still open in IBKR right now
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        raw_hash = await r.hgetall("bridge:ibkr_orders")
    finally:
        await r.aclose()

    live_ids: set[int] = set()
    for ibkr_id_str in raw_hash:
        try:
            live_ids.add(int(ibkr_id_str))
        except ValueError:
            pass

    # Return all persisted IBKR orders from the DB, newest first
    result = await db.execute(
        select(IBKROrder).order_by(IBKROrder.first_seen_at.desc())
    )
    rows = result.scalars().all()

    def _parse_mode(order_ref: str) -> str:
        parts = order_ref.split(":")
        return parts[-1] if len(parts) >= 4 and parts[0] == "pf" else ""

    ibkr_orders = [
        IBKROrderEntry(
            ibkr_order_id=row.ibkr_order_id,
            order_ref=row.order_ref,
            ticker=row.ticker,
            exchange=row.exchange,
            action=row.action,
            order_type=row.order_type,
            total_quantity=float(row.total_quantity),
            limit_price=float(row.limit_price) if row.limit_price is not None else None,
            status=row.status,
            filled=float(row.filled),
            remaining=float(row.remaining),
            avg_fill_price=float(row.avg_fill_price),
            is_platform_order=row.is_platform_order,
            is_live=row.ibkr_order_id in live_ids,
            execution_mode=_parse_mode(row.order_ref),
            first_seen_at=row.first_seen_at.isoformat(),
            last_updated_at=row.last_updated_at.isoformat(),
        )
        for row in rows
    ]

    # Platform orders still pending/submitted but with no IBKR ID at all
    orphan_result = await db.execute(
        select(Order).where(
            Order.status.in_([OrderStatus.PENDING, OrderStatus.SUBMITTED]),
            Order.ibkr_order_id.is_(None),
        )
    )
    orphan_rows = orphan_result.scalars().all()

    db_orphans = [
        IBKRDBOrphan(
            id=o.id,
            order_ref=o.order_ref,
            side=o.side.value,
            qty=float(o.qty),
            order_type=o.order_type.value,
            status=o.status.value,
            created_at=o.created_at.isoformat(),
            portfolio_id=o.portfolio_id,
            symbol_id=o.symbol_id,
            strategy_code=o.strategy_code,
        )
        for o in orphan_rows
    ]

    return IBKROrdersResponse(ibkr_orders=ibkr_orders, db_orphans=db_orphans)


class IBKRFillEntry(BaseModel):
    id: int
    ibkr_exec_id: str
    ibkr_order_id: int | None
    order_ref: str
    ticker: str
    exchange: str
    action: str
    qty: float
    price: float
    commission: float
    is_platform_order: bool
    execution_mode: str
    timestamp: str
    first_seen_at: str


@router.get("/ibkr-fills", response_model=list[IBKRFillEntry], summary="All persisted IBKR fills")
async def get_ibkr_fills(
    mode: str | None = Query(None, description="Filter by execution_mode: paper | live"),
    db: AsyncSession = Depends(get_db),
):
    q = select(IBKRFill).order_by(IBKRFill.timestamp.desc())
    if mode:
        q = q.where(IBKRFill.execution_mode == mode)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        IBKRFillEntry(
            id=row.id,
            ibkr_exec_id=row.ibkr_exec_id,
            ibkr_order_id=row.ibkr_order_id,
            order_ref=row.order_ref,
            ticker=row.ticker,
            exchange=row.exchange,
            action=row.action,
            qty=float(row.qty),
            price=float(row.price),
            commission=float(row.commission),
            is_platform_order=row.is_platform_order,
            execution_mode=row.execution_mode,
            timestamp=row.timestamp.isoformat(),
            first_seen_at=row.first_seen_at.isoformat(),
        )
        for row in rows
    ]
