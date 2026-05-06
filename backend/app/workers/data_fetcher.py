"""Celery tasks for historical data fetching."""

import asyncio
import logging
from datetime import datetime

from app.workers.celery_app import celery_app
from app.database import async_sessionmaker
from app.services.market_data_service import MarketDataService

logger = logging.getLogger(__name__)

async def _do_prefetch(symbol_id: int, timeframe: str, start: datetime, end: datetime) -> int:
    async with async_sessionmaker() as session:
        service = MarketDataService(session)
        return await service.prefetch_bars(symbol_id, timeframe, start, end)

@celery_app.task(name="app.workers.data_fetcher.prefetch_historical_data")
def prefetch_historical_data(symbol_id: int, timeframe: str, start: str, end: str):
    """
    Celery task to prefetch historical data.
    Note: start and end are passed as ISO-8601 strings because Celery requires JSON-serializable args.
    """
    logger.info(f"Starting prefetch task for symbol_id={symbol_id}, {timeframe}, {start} to {end}")
    
    start_dt = datetime.fromisoformat(start)
    end_dt = datetime.fromisoformat(end)
    
    try:
        inserted = asyncio.run(_do_prefetch(symbol_id, timeframe, start_dt, end_dt))
        return {"status": "success", "inserted": inserted}
    except Exception as e:
        logger.error(f"Prefetch task failed: {e}")
        return {"status": "error", "message": str(e)}
