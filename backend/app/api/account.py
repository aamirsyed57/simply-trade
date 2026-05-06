"""Account summary API endpoint."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.portfolio import Portfolio
from app.models.position import VirtualPosition

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
