"""Backtests API — create, query, and retrieve results."""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.backtest import Backtest, BacktestResult, BacktestStatus, FillModel
from app.workers.backtest_runner import run_backtest as enqueue_backtest

router = APIRouter(prefix="/backtests", tags=["backtests"])


# ---- Schemas ----

class BacktestCreate(BaseModel):
    name: str
    strategy_code: str
    params: dict = {}
    symbol_ids: list[int]
    timeframe: str = "1m"
    start_date: date
    end_date: date
    initial_capital: float = 100_000.0
    fill_model: FillModel = FillModel.NEXT_BAR_OPEN
    slippage_bps: int = 5
    commission_model: str = "ibkr_tiered"


class BacktestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    strategy_code: str
    symbol_ids: list[int]
    timeframe: str
    start_date: date
    end_date: date
    initial_capital: float
    fill_model: str
    slippage_bps: int
    status: str
    error_message: str | None = None


class BacktestResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    backtest_id: int
    metrics: dict[str, Any]
    per_symbol_metrics: dict[str, Any]


# ---- Endpoints ----

@router.post("", response_model=BacktestRead, status_code=status.HTTP_202_ACCEPTED)
async def create_backtest(payload: BacktestCreate, db: AsyncSession = Depends(get_db)):
    """Create a new backtest and enqueue it for execution."""
    from app.strategies import STRATEGY_REGISTRY
    if payload.strategy_code not in STRATEGY_REGISTRY:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown strategy code: {payload.strategy_code}",
        )

    backtest = Backtest(
        name=payload.name,
        strategy_code=payload.strategy_code,
        params=payload.params,
        symbol_ids=payload.symbol_ids,
        timeframe=payload.timeframe,
        start_date=payload.start_date,
        end_date=payload.end_date,
        initial_capital=payload.initial_capital,
        fill_model=payload.fill_model,
        slippage_bps=payload.slippage_bps,
        commission_model=payload.commission_model,
        status=BacktestStatus.PENDING,
    )
    db.add(backtest)
    await db.commit()
    await db.refresh(backtest)

    # Enqueue async
    enqueue_backtest.delay(backtest.id)
    return backtest


@router.get("", response_model=list[BacktestRead])
async def list_backtests(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Backtest).order_by(Backtest.created_at.desc()))
    return result.scalars().all()


@router.get("/{backtest_id}", response_model=BacktestRead)
async def get_backtest(backtest_id: int, db: AsyncSession = Depends(get_db)):
    bt = await db.get(Backtest, backtest_id)
    if not bt:
        raise HTTPException(status_code=404, detail="Backtest not found")
    return bt


@router.get("/{backtest_id}/result", response_model=BacktestResultRead)
async def get_backtest_result(backtest_id: int, db: AsyncSession = Depends(get_db)):
    bt = await db.get(Backtest, backtest_id)
    if not bt:
        raise HTTPException(status_code=404, detail="Backtest not found")
    if bt.status != BacktestStatus.COMPLETED:
        raise HTTPException(status_code=409, detail=f"Backtest status is {bt.status.value}")

    result = await db.execute(
        select(BacktestResult).where(BacktestResult.backtest_id == backtest_id)
    )
    bt_result = result.scalars().first()
    if not bt_result:
        raise HTTPException(status_code=404, detail="Result not yet available")
    return bt_result


@router.get("/{backtest_id}/equity")
async def get_equity_curve(backtest_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BacktestResult).where(BacktestResult.backtest_id == backtest_id)
    )
    bt_result = result.scalars().first()
    if not bt_result:
        raise HTTPException(status_code=404, detail="Result not found")
    return {"equity_curve": bt_result.equity_curve, "drawdown_curve": bt_result.drawdown_curve}


@router.get("/{backtest_id}/trades")
async def get_trade_log(backtest_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BacktestResult).where(BacktestResult.backtest_id == backtest_id)
    )
    bt_result = result.scalars().first()
    if not bt_result:
        raise HTTPException(status_code=404, detail="Result not found")
    return {"trades": bt_result.trades}


@router.delete("/{backtest_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_backtest(backtest_id: int, db: AsyncSession = Depends(get_db)):
    bt = await db.get(Backtest, backtest_id)
    if not bt:
        raise HTTPException(status_code=404, detail="Backtest not found")
    await db.delete(bt)
    await db.commit()
