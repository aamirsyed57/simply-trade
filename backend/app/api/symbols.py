"""Symbols router — CRUD."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.symbol import Symbol
from app.schemas.symbol import SymbolCreate, SymbolRead

router = APIRouter(prefix="/symbols", tags=["symbols"])


async def _get_or_404(db: AsyncSession, symbol_id: int) -> Symbol:
    sym = await db.get(Symbol, symbol_id)
    if sym is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Symbol not found")
    return sym


@router.get("", response_model=list[SymbolRead], summary="List all symbols")
async def list_symbols(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Symbol).order_by(Symbol.ticker))
    return result.scalars().all()


@router.post("", response_model=SymbolRead, status_code=status.HTTP_201_CREATED, summary="Register a new symbol")
async def create_symbol(data: SymbolCreate, db: AsyncSession = Depends(get_db)):
    # Check for duplicate (ticker, exchange)
    existing = await db.scalar(
        select(Symbol).where(Symbol.ticker == data.ticker, Symbol.exchange == data.exchange)
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Symbol {data.ticker}:{data.exchange} already exists (id={existing.id})",
        )
    sym = Symbol(**data.model_dump())
    db.add(sym)
    await db.flush()
    await db.refresh(sym)
    return sym


@router.get("/{symbol_id}", response_model=SymbolRead, summary="Get symbol by ID")
async def get_symbol(symbol_id: int, db: AsyncSession = Depends(get_db)):
    return await _get_or_404(db, symbol_id)


@router.delete("/{symbol_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a symbol")
async def delete_symbol(symbol_id: int, db: AsyncSession = Depends(get_db)):
    sym = await _get_or_404(db, symbol_id)
    await db.delete(sym)
    await db.flush()
