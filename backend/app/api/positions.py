"""Positions router — virtual position views per portfolio."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.position import VirtualPosition
from app.schemas.position import PositionReadDetailed

router = APIRouter(prefix="/portfolios/{portfolio_id}/positions", tags=["positions"])


@router.get("", response_model=list[PositionReadDetailed], summary="List positions for a portfolio")
async def list_positions(portfolio_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(VirtualPosition)
        .options(selectinload(VirtualPosition.symbol))
        .where(VirtualPosition.portfolio_id == portfolio_id)
        .order_by(VirtualPosition.id)
    )
    return result.scalars().all()
