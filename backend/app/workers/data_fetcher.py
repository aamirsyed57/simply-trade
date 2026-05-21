"""Celery tasks for historical data fetching."""

import asyncio
import logging
from datetime import datetime
from decimal import Decimal

import pandas as pd
import yfinance as yf
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import CelerySessionLocal as AsyncSessionLocal
from app.models.historical_bar import HistoricalBar
from app.models.symbol import Symbol
from app.services.market_data_service import MarketDataService
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# Maps our internal timeframe codes to yfinance interval strings.
_YF_INTERVAL: dict[str, str] = {
    "1m":  "1m",
    "5m":  "5m",
    "15m": "15m",
    "1h":  "1h",
    "1d":  "1d",
}


async def _do_prefetch(symbol_id: int, timeframe: str, start: datetime, end: datetime) -> int:
    async with AsyncSessionLocal() as session:
        service = MarketDataService(session)
        return await service.prefetch_bars(symbol_id, timeframe, start, end)


async def _do_yfinance_fetch(
    symbol_id: int,
    timeframe: str,
    start: datetime,
    end: datetime,
    yf_ticker: str | None,
) -> int:
    if timeframe not in _YF_INTERVAL:
        raise ValueError(f"Unsupported timeframe '{timeframe}'. Choose from: {list(_YF_INTERVAL)}")

    # Step 1: resolve ticker from DB then close the session before calling yfinance.
    # Keeping asyncpg connections open while running synchronous yfinance causes a
    # "Future attached to different loop" error in the executor thread.
    async with AsyncSessionLocal() as session:
        symbol = await session.get(Symbol, symbol_id)
        if symbol is None:
            raise ValueError(f"Symbol {symbol_id} not found")
        ticker_str = yf_ticker or symbol.ticker

    interval = _YF_INTERVAL[timeframe]
    logger.info(f"yfinance fetch: {ticker_str} {interval} {start.date()} → {end.date()}")

    # Step 2: download synchronously — yfinance is sync and this is a Celery worker,
    # so blocking the event loop here is fine (nothing else shares it).
    df: pd.DataFrame = yf.download(
        ticker_str,
        start=start.date().isoformat(),
        end=end.date().isoformat(),
        interval=interval,
        auto_adjust=True,
        progress=False,
        multi_level_index=False,  # flat columns for single tickers
    )

    if df.empty:
        logger.warning(f"yfinance returned no data for {ticker_str}")
        return 0

    df.columns = [c.lower() for c in df.columns]
    df.index = pd.to_datetime(df.index, utc=True)
    df = df[["open", "high", "low", "close", "volume"]].dropna()

    records = [
        {
            "symbol_id": symbol_id,
            "timeframe": timeframe,
            "ts": ts.to_pydatetime(),
            "open":   Decimal(str(round(float(row["open"]),   6))),
            "high":   Decimal(str(round(float(row["high"]),   6))),
            "low":    Decimal(str(round(float(row["low"]),    6))),
            "close":  Decimal(str(round(float(row["close"]),  6))),
            "volume": Decimal(str(round(float(row["volume"]), 2))),
            "source": "yfinance",
        }
        for ts, row in df.iterrows()
    ]

    if not records:
        return 0

    # Step 3: upsert in a fresh session (no open connections during the yfinance call above).
    async with AsyncSessionLocal() as session:
        stmt = (
            pg_insert(HistoricalBar)
            .values(records)
            .on_conflict_do_nothing(constraint="uq_bar_symbol_timeframe_ts")
        )
        result = await session.execute(stmt)
        await session.commit()

    inserted = result.rowcount if result.rowcount >= 0 else len(records)
    logger.info(f"yfinance: inserted {inserted}/{len(records)} bars for {ticker_str} [{timeframe}]")
    return inserted


@celery_app.task(name="app.workers.data_fetcher.prefetch_historical_data")
def prefetch_historical_data(symbol_id: int, timeframe: str, start: str, end: str):
    """Celery task: fetch historical bars from IBKR and upsert into DB."""
    logger.info(f"IBKR prefetch: symbol={symbol_id} {timeframe} {start} → {end}")
    start_dt = datetime.fromisoformat(start)
    end_dt = datetime.fromisoformat(end)
    try:
        inserted = asyncio.run(_do_prefetch(symbol_id, timeframe, start_dt, end_dt))
        return {"status": "success", "inserted": inserted}
    except Exception as e:
        logger.error(f"IBKR prefetch failed: {e}")
        return {"status": "error", "message": str(e)}


@celery_app.task(name="app.workers.data_fetcher.fetch_yfinance_data")
def fetch_yfinance_data(
    symbol_id: int,
    timeframe: str,
    start: str,
    end: str,
    yf_ticker: str | None = None,
):
    """Celery task: fetch historical bars from Yahoo Finance and upsert into DB."""
    logger.info(f"yfinance task: symbol={symbol_id} {timeframe} {start} → {end} ticker={yf_ticker}")
    start_dt = datetime.fromisoformat(start)
    end_dt = datetime.fromisoformat(end)
    try:
        inserted = asyncio.run(_do_yfinance_fetch(symbol_id, timeframe, start_dt, end_dt, yf_ticker))
        return {"status": "success", "inserted": inserted}
    except Exception as e:
        logger.error(f"yfinance fetch failed: {e}")
        return {"status": "error", "message": str(e)}
