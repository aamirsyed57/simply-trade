"""Strategy runner Celery task — evaluates assignments and places orders."""

import asyncio
import logging

from sqlalchemy import select

from app.workers.celery_app import celery_app
from app.database import AsyncSessionLocal
from app.models.assignment import PortfolioSymbolStrategy
from app.models.symbol import Symbol
from app.services.order_service import InsufficientCashError, OrderManager
from app.strategies import STRATEGY_REGISTRY
from app.strategies.clocks import WallClock
from app.strategies.context import ExecutionContext
from app.strategies.data_sources import LiveDataSource
from app.strategies.routers import IBKRBridgeRouter
from app.utils.market_hours import is_market_hours

logger = logging.getLogger(__name__)


async def _run_tick(assignment_id: int):
    """Core async logic for a strategy tick."""
    async with AsyncSessionLocal() as session:
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
def run_strategy_tick(assignment_id: int, exchange: str = "NYSE"):
    """Entry point for Celery. Exchange-aware market hours check before running the tick."""
    if not is_market_hours(exchange):
        logger.debug(f"Outside market hours for {exchange}, skipping assignment {assignment_id}")
        return
    asyncio.run(_run_tick(assignment_id))


@celery_app.task(name="app.workers.strategy_runner.dispatch_all_assignments")
def dispatch_all_assignments():
    """
    Beat task: query all enabled assignments with their symbol exchange, then fan out
    only those whose exchange is currently open.
    """
    async def _fetch():
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PortfolioSymbolStrategy.id, Symbol.exchange)
                .join(Symbol, Symbol.id == PortfolioSymbolStrategy.symbol_id)
                .where(PortfolioSymbolStrategy.enabled == True)
            )
            return result.all()

    rows = asyncio.run(_fetch())
    dispatched = 0
    for aid, exchange in rows:
        if is_market_hours(exchange):
            run_strategy_tick.delay(aid, exchange)
            dispatched += 1

    logger.info(f"Dispatched {dispatched}/{len(rows)} strategy ticks")

