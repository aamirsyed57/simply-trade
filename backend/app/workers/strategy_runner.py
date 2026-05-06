"""Strategy runner Celery task — evaluates assignments and places orders."""

import asyncio
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.workers.celery_app import celery_app
from app.database import async_sessionmaker
from app.models.assignment import PortfolioSymbolStrategy
from app.models.symbol import Symbol
from app.services.order_service import InsufficientCashError, OrderManager
from app.strategies import STRATEGY_REGISTRY
from app.strategies.clocks import WallClock
from app.strategies.context import ExecutionContext
from app.strategies.data_sources import LiveDataSource
from app.strategies.routers import IBKRBridgeRouter

logger = logging.getLogger(__name__)

ET = ZoneInfo("America/New_York")
MARKET_OPEN_HOUR = 9
MARKET_OPEN_MINUTE = 30
MARKET_CLOSE_HOUR = 16


def is_market_hours() -> bool:
    """Return True if current time is within US market hours (9:30–16:00 ET, weekdays)."""
    now_et = datetime.now(ET)
    if now_et.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    market_open = now_et.replace(hour=MARKET_OPEN_HOUR, minute=MARKET_OPEN_MINUTE, second=0, microsecond=0)
    market_close = now_et.replace(hour=MARKET_CLOSE_HOUR, minute=0, second=0, microsecond=0)
    return market_open <= now_et < market_close


async def _run_tick(assignment_id: int):
    """Core async logic for a strategy tick."""
    async with async_sessionmaker() as session:
        assignment = await session.get(PortfolioSymbolStrategy, assignment_id)

        if not assignment:
            logger.warning(f"Assignment {assignment_id} not found")
            return

        if not assignment.enabled:
            logger.debug(f"Assignment {assignment_id} is disabled, skipping")
            return

        symbol = await session.get(Symbol, assignment.symbol_id)
        if not symbol:
            logger.warning(f"Symbol {assignment.symbol_id} not found")
            return

        strategy_cls = STRATEGY_REGISTRY.get(assignment.strategy_code)
        if not strategy_cls:
            logger.error(f"Strategy '{assignment.strategy_code}' not registered")
            return

        # Determine mode from portfolio
        portfolio = await session.get(
            __import__("app.models.portfolio", fromlist=["Portfolio"]).Portfolio,
            assignment.portfolio_id
        )
        mode = portfolio.mode.value if portfolio else "paper"

        # Build ExecutionContext
        ctx = ExecutionContext(
            clock=WallClock(),
            data=LiveDataSource(session),
            router=IBKRBridgeRouter(),
            portfolio_id=assignment.portfolio_id,
            mode=mode,
        )

        # Merge assignment params with strategy defaults
        params = strategy_cls.ParamsModel().model_dump()
        params.update(assignment.params or {})

        strategy = strategy_cls(params=params)

        try:
            signal = await strategy.generate_signal(assignment.symbol_id, ctx)
        except Exception as e:
            logger.error(f"Strategy {assignment.strategy_code} raised an error: {e}")
            return

        if signal is None:
            logger.debug(f"No signal from {assignment.strategy_code} for symbol {symbol.ticker}")
            return

        logger.info(f"Signal: {signal.direction} {signal.qty} {symbol.ticker} via {assignment.strategy_code}")

        # Place order via OrderManager
        try:
            async with session.begin():
                om = OrderManager(session)
                order = await om.submit_order(assignment, signal, mode=mode)

            # Publish to bridge via router
            await ctx.router.place_order(
                portfolio_id=assignment.portfolio_id,
                strategy_code=assignment.strategy_code,
                symbol_id=assignment.symbol_id,
                ticker=symbol.ticker,
                exchange=symbol.exchange,
                direction=signal.direction,
                qty=signal.qty,
                order_type=signal.order_type,
                limit_price=signal.limit_price,
                mode=mode,
            )

        except InsufficientCashError as e:
            logger.warning(f"Pre-trade check failed: {e}")
        except Exception as e:
            logger.error(f"Order submission failed: {e}")


@celery_app.task(name="app.workers.strategy_runner.run_strategy_tick")
def run_strategy_tick(assignment_id: int):
    """
    Entry point for Celery. Runs one strategy tick for a given assignment.
    Market hours are checked here to avoid running during non-trading periods.
    """
    if not is_market_hours():
        logger.debug(f"Outside market hours, skipping assignment {assignment_id}")
        return

    asyncio.run(_run_tick(assignment_id))


@celery_app.task(name="app.workers.strategy_runner.dispatch_all_assignments")
def dispatch_all_assignments():
    """
    Beat task: query all enabled assignments and fan out individual ticks.
    This avoids hardcoding assignment IDs in the Beat schedule.
    """
    if not is_market_hours():
        return

    async def _fetch_ids():
        async with async_sessionmaker() as session:
            result = await session.execute(
                select(PortfolioSymbolStrategy.id).where(PortfolioSymbolStrategy.enabled == True)
            )
            return [row[0] for row in result.all()]

    assignment_ids = asyncio.run(_fetch_ids())
    for aid in assignment_ids:
        run_strategy_tick.delay(aid)

    logger.info(f"Dispatched {len(assignment_ids)} strategy ticks")

