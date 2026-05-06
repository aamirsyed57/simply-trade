"""Strategies router — read-only (populated via seed/registry)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.strategy import Strategy
from app.schemas.strategy import StrategyRead

router = APIRouter(prefix="/strategies", tags=["strategies"])


@router.get("", response_model=list[StrategyRead], summary="List all registered strategies")
async def list_strategies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Strategy).order_by(Strategy.name))
    return result.scalars().all()


@router.get("/{strategy_code}", response_model=StrategyRead, summary="Get strategy by code")
async def get_strategy(strategy_code: str, db: AsyncSession = Depends(get_db)):
    strategy = await db.get(Strategy, strategy_code)
    if strategy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Strategy '{strategy_code}' not found")
    return strategy
