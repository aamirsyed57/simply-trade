"""Strategies router — read-only (populated via seed/registry)."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.strategy import Strategy
from app.schemas.strategy import StrategyRead
from app.strategies import STRATEGY_REGISTRY

router = APIRouter(prefix="/strategies", tags=["strategies"])


@router.get("", response_model=list[StrategyRead], summary="List all registered strategies")
async def list_strategies():
    strategies = []
    for code, cls in STRATEGY_REGISTRY.items():
        strategies.append({
            "code": code,
            "name": cls.name,
            "description": cls.description,
            "documentation_url": getattr(cls, "documentation_url", None),
            "default_params": cls.ParamsModel().model_dump(),
            "params_schema": cls.get_params_schema(),
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        })
    strategies.sort(key=lambda s: s["name"])
    return strategies


@router.get("/{strategy_code}", response_model=StrategyRead, summary="Get strategy by code")
async def get_strategy(strategy_code: str):
    cls = STRATEGY_REGISTRY.get(strategy_code)
    if cls is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Strategy '{strategy_code}' not found")
    
    return {
        "code": strategy_code,
        "name": cls.name,
        "description": cls.description,
        "documentation_url": getattr(cls, "documentation_url", None),
        "default_params": cls.ParamsModel().model_dump(),
        "params_schema": cls.get_params_schema(),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
