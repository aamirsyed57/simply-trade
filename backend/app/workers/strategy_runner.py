"""Strategy runner Celery task — evaluates assignments and places orders."""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.workers.celery_app import celery_app
from app.database import CelerySessionLocal
from app.models.assignment import PortfolioSymbolStrategy
from app.models.symbol import Symbol
from app.services.order_service import InsufficientCashError, OrderManager
from app.strategies import STRATEGY_REGISTRY
from app.strategies.clocks import WallClock
from app.strategies.context import ExecutionContext
from app.strategies.data_sources import LiveDataSource
from app.strategies.routers import IBKRBridgeRouter
from app.utils.market_hours import is_trading_session

logger = logging.getLogger(__name__)


async def _run_tick(assignment_id: int):
    """Core async logic for a strategy tick."""
    tick_start = datetime.now(timezone.utc)
    logger.info(f"[tick:{assignment_id}] Starting strategy tick at {tick_start.isoformat()}")

    async with CelerySessionLocal() as session:
        assignment = await session.get(PortfolioSymbolStrategy, assignment_id)

        if not assignment:
            logger.error(f"[tick:{assignment_id}] Assignment not found in DB")
            return

        if not assignment.enabled:
            logger.info(f"[tick:{assignment_id}] Assignment is disabled — skipping")
            return

        symbol = await session.get(Symbol, assignment.symbol_id)
        if not symbol:
            logger.error(f"[tick:{assignment_id}] Symbol {assignment.symbol_id} not found")
            return

        strategy_cls = STRATEGY_REGISTRY.get(assignment.strategy_code)
        if not strategy_cls:
            logger.error(
                f"[tick:{assignment_id}] Strategy '{assignment.strategy_code}' not in registry. "
                f"Available: {list(STRATEGY_REGISTRY.keys())}"
            )
            return

        portfolio = await session.get(
            __import__("app.models.portfolio", fromlist=["Portfolio"]).Portfolio,
            assignment.portfolio_id
        )
        mode = portfolio.mode.value if portfolio else "paper"

        logger.info(
            f"[tick:{assignment_id}] Running {assignment.strategy_code} on "
            f"{symbol.ticker} ({symbol.exchange}) | portfolio={assignment.portfolio_id} mode={mode}"
        )

        # Build ExecutionContext
        ctx = ExecutionContext(
            clock=WallClock(),
            data=LiveDataSource(session),
            router=IBKRBridgeRouter(),
            portfolio_id=assignment.portfolio_id,
            mode=mode,
            timeframe="1d",
        )

        # Merge assignment params with strategy defaults
        params = strategy_cls.ParamsModel().model_dump()
        params.update(assignment.params or {})
        logger.debug(f"[tick:{assignment_id}] Effective params: {params}")

        strategy = strategy_cls(params=params)

        try:
            signal = await strategy.generate_signal(assignment.symbol_id, ctx)
        except Exception as e:
            logger.error(
                f"[tick:{assignment_id}] {assignment.strategy_code} raised an error "
                f"for {symbol.ticker}: {e}",
                exc_info=True,
            )
            return

        if signal is None:
            logger.info(
                f"[tick:{assignment_id}] {assignment.strategy_code} → no signal "
                f"for {symbol.ticker} (insufficient data or no condition met)"
            )
            return

        logger.info(
            f"[tick:{assignment_id}] SIGNAL {signal.direction} {signal.qty}x {symbol.ticker} "
            f"via {assignment.strategy_code} | reason: {signal.reason}"
        )

        # Place order via OrderManager
        try:
            async with session.begin():
                om = OrderManager(session)
                order = await om.submit_order(assignment, signal, mode=mode)

            logger.info(
                f"[tick:{assignment_id}] Order submitted: id={order.id} "
                f"{signal.direction} {signal.qty}x {symbol.ticker} mode={mode}"
            )

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
            logger.info(f"[tick:{assignment_id}] Order published to bridge for {symbol.ticker}")

        except InsufficientCashError as e:
            logger.warning(f"[tick:{assignment_id}] Pre-trade check failed for {symbol.ticker}: {e}")
        except Exception as e:
            logger.error(
                f"[tick:{assignment_id}] Order submission failed for {symbol.ticker}: {e}",
                exc_info=True,
            )

    elapsed = (datetime.now(timezone.utc) - tick_start).total_seconds()
    logger.info(f"[tick:{assignment_id}] Tick complete in {elapsed:.2f}s")


@celery_app.task(name="app.workers.strategy_runner.run_strategy_tick")
def run_strategy_tick(assignment_id: int, exchange: str = "NYSE"):
    """Entry point for Celery. Exchange-aware market hours check before running the tick."""
    in_session = is_trading_session(exchange)
    if not in_session:
        logger.info(
            f"[tick:{assignment_id}] Outside trading session for {exchange} "
            f"(now={datetime.now(timezone.utc).isoformat()}) — skipping"
        )
        return
    logger.info(f"[tick:{assignment_id}] Market open for {exchange} — executing tick")
    asyncio.run(_run_tick(assignment_id))


@celery_app.task(name="app.workers.strategy_runner.dispatch_all_assignments")
def dispatch_all_assignments():
    """
    Beat task: query all enabled assignments, fan out only those whose exchange is open.
    Runs every minute on weekdays.
    """
    now_utc = datetime.now(timezone.utc).isoformat()

    async def _fetch():
        async with CelerySessionLocal() as session:
            result = await session.execute(
                select(PortfolioSymbolStrategy.id, Symbol.exchange, Symbol.ticker)
                .join(Symbol, Symbol.id == PortfolioSymbolStrategy.symbol_id)
                .where(PortfolioSymbolStrategy.enabled == True)
            )
            return result.all()

    rows = asyncio.run(_fetch())

    if not rows:
        logger.info(f"[dispatch] {now_utc} — no enabled assignments found")
        return

    logger.info(f"[dispatch] {now_utc} — checking {len(rows)} enabled assignment(s)")

    dispatched = 0
    skipped = 0
    for aid, exchange, ticker in rows:
        in_session = is_trading_session(exchange)
        if in_session:
            run_strategy_tick.delay(aid, exchange)
            logger.info(f"[dispatch] Queued assignment {aid} ({ticker} on {exchange})")
            dispatched += 1
        else:
            logger.info(f"[dispatch] Skipped assignment {aid} ({ticker} on {exchange}) — market closed")
            skipped += 1

    logger.info(f"[dispatch] Done — dispatched={dispatched} skipped={skipped} total={len(rows)}")
