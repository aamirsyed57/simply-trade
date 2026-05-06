"""Portfolios router — full CRUD."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.portfolio import PortfolioCreate, PortfolioRead, PortfolioUpdate
from app.services.portfolio_service import PortfolioService

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


@router.get("", response_model=list[PortfolioRead], summary="List all portfolios")
async def list_portfolios(db: AsyncSession = Depends(get_db)):
    return await PortfolioService.list_all(db)


@router.post("", response_model=PortfolioRead, status_code=status.HTTP_201_CREATED, summary="Create a portfolio")
async def create_portfolio(data: PortfolioCreate, db: AsyncSession = Depends(get_db)):
    return await PortfolioService.create(db, data)


@router.get("/{portfolio_id}", response_model=PortfolioRead, summary="Get portfolio by ID")
async def get_portfolio(portfolio_id: int, db: AsyncSession = Depends(get_db)):
    return await PortfolioService.get_or_404(db, portfolio_id)


@router.patch("/{portfolio_id}", response_model=PortfolioRead, summary="Update portfolio name/status/description")
async def update_portfolio(portfolio_id: int, data: PortfolioUpdate, db: AsyncSession = Depends(get_db)):
    return await PortfolioService.update(db, portfolio_id, data)


@router.delete("/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a portfolio")
async def delete_portfolio(portfolio_id: int, db: AsyncSession = Depends(get_db)):
    await PortfolioService.delete(db, portfolio_id)
