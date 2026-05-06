"""PortfolioService — enforces cash invariants before writing to the DB.

All cash mutations must go through this service, never directly via the ORM.
This mirrors the design doc invariant: cash_available = budget_total - cash_reserved - cash_deployed ≥ 0
"""

from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.portfolio import Portfolio, PortfolioStatus
from app.schemas.portfolio import PortfolioCreate, PortfolioUpdate


class PortfolioService:

    # ------------------------------------------------------------------
    # Read helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def get_or_404(db: AsyncSession, portfolio_id: int) -> Portfolio:
        pf = await db.get(Portfolio, portfolio_id)
        if pf is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfolio not found")
        return pf

    @staticmethod
    async def list_all(db: AsyncSession) -> list[Portfolio]:
        result = await db.execute(select(Portfolio).order_by(Portfolio.id))
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Write helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def create(db: AsyncSession, data: PortfolioCreate) -> Portfolio:
        pf = Portfolio(
            name=data.name,
            mode=data.mode,
            budget_total=data.budget_total,
            description=data.description,
            ibkr_account_code=data.ibkr_account_code,
        )
        db.add(pf)
        await db.flush()
        await db.refresh(pf)
        return pf

    @staticmethod
    async def update(db: AsyncSession, portfolio_id: int, data: PortfolioUpdate) -> Portfolio:
        pf = await PortfolioService.get_or_404(db, portfolio_id)
        if data.name is not None:
            pf.name = data.name
        if data.status is not None:
            pf.status = data.status
        if data.description is not None:
            pf.description = data.description
        if data.budget_total is not None:
            if data.budget_total < pf.cash_reserved + pf.cash_deployed:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Budget cannot be lower than deployed+reserved cash ({pf.cash_reserved + pf.cash_deployed})"
                )
            pf.budget_total = data.budget_total
        await db.flush()
        await db.refresh(pf)
        return pf

    @staticmethod
    async def delete(db: AsyncSession, portfolio_id: int) -> None:
        pf = await PortfolioService.get_or_404(db, portfolio_id)
        await db.delete(pf)
        await db.flush()

    # ------------------------------------------------------------------
    # Cash invariant helpers (called by order service in later phases)
    # ------------------------------------------------------------------

    @staticmethod
    async def reserve_cash(db: AsyncSession, portfolio_id: int, amount: Decimal) -> Portfolio:
        """Atomically reserve cash for a pending order. Raises 422 if insufficient."""
        pf = await PortfolioService.get_or_404(db, portfolio_id)
        if pf.cash_available < amount:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Insufficient cash: need {amount}, "
                    f"available {pf.cash_available} "
                    f"(budget={pf.budget_total}, reserved={pf.cash_reserved}, deployed={pf.cash_deployed})"
                ),
            )
        pf.cash_reserved += amount
        await db.flush()
        return pf

    @staticmethod
    async def release_cash(db: AsyncSession, portfolio_id: int, reserved: Decimal, deployed: Decimal) -> Portfolio:
        """Move cash from reserved → deployed on fill, or release reserved on cancel."""
        pf = await PortfolioService.get_or_404(db, portfolio_id)
        pf.cash_reserved = max(Decimal("0"), pf.cash_reserved - reserved)
        pf.cash_deployed += deployed
        await db.flush()
        return pf

    @staticmethod
    async def record_realized_pnl(db: AsyncSession, portfolio_id: int, pnl: Decimal) -> Portfolio:
        pf = await PortfolioService.get_or_404(db, portfolio_id)
        pf.realized_pnl += pnl
        await db.flush()
        return pf
