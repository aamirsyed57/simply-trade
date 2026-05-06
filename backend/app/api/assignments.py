"""Assignments router — link symbols + strategies to portfolios."""

from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.assignment import PortfolioSymbolStrategy
from app.models.portfolio import Portfolio
from app.models.strategy import Strategy
from app.models.symbol import Symbol
from app.schemas.assignment import AssignmentCreate, AssignmentRead, AssignmentReadDetailed, AssignmentUpdate
from app.services.portfolio_service import PortfolioService

router = APIRouter(prefix="/assignments", tags=["assignments"])


async def _get_or_404(db: AsyncSession, assignment_id: int) -> PortfolioSymbolStrategy:
    result = await db.execute(
        select(PortfolioSymbolStrategy)
        .options(
            selectinload(PortfolioSymbolStrategy.portfolio),
            selectinload(PortfolioSymbolStrategy.symbol),
            selectinload(PortfolioSymbolStrategy.strategy),
        )
        .where(PortfolioSymbolStrategy.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    return assignment


@router.get("", response_model=list[AssignmentRead], summary="List all assignments")
async def list_assignments(
    portfolio_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(PortfolioSymbolStrategy)
    if portfolio_id is not None:
        q = q.where(PortfolioSymbolStrategy.portfolio_id == portfolio_id)
    result = await db.execute(q.order_by(PortfolioSymbolStrategy.id))
    return result.scalars().all()


@router.post(
    "",
    response_model=AssignmentReadDetailed,
    status_code=status.HTTP_201_CREATED,
    summary="Assign a strategy+symbol to a portfolio",
)
async def create_assignment(data: AssignmentCreate, db: AsyncSession = Depends(get_db)):
    # Validate FK references
    portfolio = await db.get(Portfolio, data.portfolio_id)
    if portfolio is None:
        raise HTTPException(status_code=404, detail=f"Portfolio {data.portfolio_id} not found")

    symbol = await db.get(Symbol, data.symbol_id)
    if symbol is None:
        raise HTTPException(status_code=404, detail=f"Symbol {data.symbol_id} not found")

    strategy = await db.get(Strategy, data.strategy_code)
    if strategy is None:
        raise HTTPException(status_code=404, detail=f"Strategy '{data.strategy_code}' not found")

    # Check for duplicate (portfolio, symbol) — only one strategy per symbol per portfolio
    existing = await db.scalar(
        select(PortfolioSymbolStrategy).where(
            PortfolioSymbolStrategy.portfolio_id == data.portfolio_id,
            PortfolioSymbolStrategy.symbol_id == data.symbol_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Symbol {data.symbol_id} is already assigned to portfolio {data.portfolio_id} (assignment id={existing.id})",
        )

    # Validate allocation does not push total allocated budget over portfolio budget_total
    allocated_result = await db.execute(
        select(func.coalesce(func.sum(PortfolioSymbolStrategy.allocation), Decimal("0")))
        .where(PortfolioSymbolStrategy.portfolio_id == data.portfolio_id)
    )
    already_allocated = allocated_result.scalar_one()
    remaining = portfolio.budget_total - already_allocated
    if data.allocation > remaining:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Allocation {data.allocation} exceeds remaining budget {remaining} (budget {portfolio.budget_total} − already allocated {already_allocated})",
        )

    # Use strategy defaults if no params provided
    params = data.params if data.params else strategy.default_params

    assignment = PortfolioSymbolStrategy(
        portfolio_id=data.portfolio_id,
        symbol_id=data.symbol_id,
        strategy_code=data.strategy_code,
        params=params,
        allocation=data.allocation,
    )
    db.add(assignment)
    await db.flush()
    return await _get_or_404(db, assignment.id)


@router.get("/{assignment_id}", response_model=AssignmentReadDetailed, summary="Get assignment by ID")
async def get_assignment(assignment_id: int, db: AsyncSession = Depends(get_db)):
    return await _get_or_404(db, assignment_id)


@router.patch("/{assignment_id}", response_model=AssignmentReadDetailed, summary="Update assignment params/allocation/enabled")
async def update_assignment(assignment_id: int, data: AssignmentUpdate, db: AsyncSession = Depends(get_db)):
    assignment = await _get_or_404(db, assignment_id)
    if data.allocation is not None:
        portfolio = await db.get(Portfolio, assignment.portfolio_id)
        allocated_result = await db.execute(
            select(func.coalesce(func.sum(PortfolioSymbolStrategy.allocation), Decimal("0")))
            .where(PortfolioSymbolStrategy.portfolio_id == assignment.portfolio_id)
            .where(PortfolioSymbolStrategy.id != assignment_id)
        )
        others_allocated = allocated_result.scalar_one()
        remaining = portfolio.budget_total - others_allocated
        if data.allocation > remaining:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Allocation {data.allocation} exceeds remaining budget {remaining} (budget {portfolio.budget_total} − other assignments {others_allocated})",
            )
        assignment.allocation = data.allocation
    if data.params is not None:
        assignment.params = data.params
    if data.enabled is not None:
        assignment.enabled = data.enabled
    await db.flush()
    return await _get_or_404(db, assignment_id)


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove an assignment")
async def delete_assignment(assignment_id: int, db: AsyncSession = Depends(get_db)):
    assignment = await _get_or_404(db, assignment_id)
    await db.delete(assignment)
    await db.flush()
