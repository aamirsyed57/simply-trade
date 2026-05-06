"""Tests for SQLAlchemy models — constraints, relationships, seed data.

Uses a per-test async engine to avoid asyncpg event-loop cross-contamination.
"""

import pytest
import pytest_asyncio
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models.portfolio import Portfolio, PortfolioMode
from app.models.symbol import Symbol
from app.models.strategy import Strategy


@pytest_asyncio.fixture
async def db():
    """Creates a fresh async engine + session for each test, then disposes."""
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        yield session
        await session.rollback()
    await engine.dispose()


# ---------------------------------------------------------------------------
# Seed data verification
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_six_strategies_seeded(db: AsyncSession) -> None:
    result = await db.execute(select(Strategy))
    strategies = result.scalars().all()
    codes = {s.code for s in strategies}
    assert codes == {
        "gap_and_go",
        "bull_flag",
        "vwap_reclaim",
        "sentiment_momentum",
        "mean_reversion",
        "opening_range_breakout",
    }


@pytest.mark.asyncio
async def test_five_symbols_seeded(db: AsyncSession) -> None:
    result = await db.execute(select(Symbol))
    symbols = result.scalars().all()
    tickers = {s.ticker for s in symbols}
    assert tickers == {"AAPL", "MSFT", "TSLA", "GOOGL", "AMZN"}


@pytest.mark.asyncio
async def test_demo_portfolio_seeded(db: AsyncSession) -> None:
    result = await db.execute(
        select(Portfolio).where(Portfolio.name == "Demo Paper Portfolio")
    )
    pf = result.scalar_one()
    assert pf.mode == PortfolioMode.PAPER
    assert pf.budget_total == Decimal("100000")
    assert pf.cash_reserved == Decimal("0")
    assert pf.cash_deployed == Decimal("0")
    assert pf.cash_available == Decimal("100000")


@pytest.mark.asyncio
async def test_strategies_have_params_schema(db: AsyncSession) -> None:
    result = await db.execute(select(Strategy))
    for strategy in result.scalars().all():
        assert strategy.params_schema, f"Strategy {strategy.code} has empty params_schema"
        assert "properties" in strategy.params_schema, (
            f"Strategy {strategy.code} params_schema missing 'properties'"
        )
        assert "required" in strategy.params_schema, (
            f"Strategy {strategy.code} params_schema missing 'required'"
        )


# ---------------------------------------------------------------------------
# Portfolio cash invariant constraints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cash_available_computed_correctly(db: AsyncSession) -> None:
    pf = Portfolio(
        name="Test Portfolio",
        mode=PortfolioMode.PAPER,
        budget_total=Decimal("50000"),
        cash_reserved=Decimal("5000"),
        cash_deployed=Decimal("10000"),
    )
    db.add(pf)
    await db.flush()
    assert pf.cash_available == Decimal("35000")


@pytest.mark.asyncio
async def test_negative_cash_available_rejected(db: AsyncSession) -> None:
    """DB check constraint must reject cash_reserved + cash_deployed > budget_total."""
    pf = Portfolio(
        name="Overdraft Portfolio",
        mode=PortfolioMode.PAPER,
        budget_total=Decimal("10000"),
        cash_reserved=Decimal("8000"),
        cash_deployed=Decimal("5000"),  # 8000 + 5000 > 10000 → constraint violation
    )
    db.add(pf)
    with pytest.raises(Exception):
        await db.flush()


@pytest.mark.asyncio
async def test_negative_cash_reserved_rejected(db: AsyncSession) -> None:
    pf = Portfolio(
        name="Negative Reserved",
        mode=PortfolioMode.PAPER,
        budget_total=Decimal("10000"),
        cash_reserved=Decimal("-1"),
        cash_deployed=Decimal("0"),
    )
    db.add(pf)
    with pytest.raises(Exception):
        await db.flush()


# ---------------------------------------------------------------------------
# Symbol constraints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_duplicate_ticker_exchange_rejected(db: AsyncSession) -> None:
    """Unique constraint on (ticker, exchange) must prevent duplicates."""
    s1 = Symbol(
        ticker="DUPE",
        exchange="NYSE",
        contract_meta={"currency": "USD", "primary_exchange": "NYSE", "secType": "STK"},
    )
    db.add(s1)
    await db.flush()

    s2 = Symbol(
        ticker="DUPE",
        exchange="NYSE",
        contract_meta={"currency": "USD", "primary_exchange": "NYSE", "secType": "STK"},
    )
    db.add(s2)
    with pytest.raises(Exception):
        await db.flush()
