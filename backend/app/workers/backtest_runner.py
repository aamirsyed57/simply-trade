"""Celery task for running backtests asynchronously."""

import asyncio
import logging

from app.workers.celery_app import celery_app
from app.database import async_sessionmaker
from app.backtest.engine import BacktestEngine

logger = logging.getLogger(__name__)


async def _run_backtest(backtest_id: int):
    async with async_sessionmaker() as session:
        async with session.begin():
            engine = BacktestEngine(session)
            await engine.run(backtest_id)


@celery_app.task(name="app.workers.backtest_runner.run_backtest")
def run_backtest(backtest_id: int):
    """
    Celery task to execute a backtest asynchronously.
    Marks the Backtest status as RUNNING, COMPLETED, or FAILED in the DB.
    """
    logger.info(f"Starting backtest task for backtest_id={backtest_id}")
    try:
        asyncio.run(_run_backtest(backtest_id))
        logger.info(f"Backtest {backtest_id} completed")
    except Exception as e:
        logger.error(f"Backtest {backtest_id} task failed: {e}")
        raise
