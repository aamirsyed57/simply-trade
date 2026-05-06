"""Market Data Service for fetching and caching historical bars."""

import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from ib_insync import IB, Contract

from app.models.historical_bar import HistoricalBar
from app.models.symbol import Symbol
from app.config import settings

logger = logging.getLogger(__name__)

TIMEFRAME_MAP = {
    "1m": "1 min",
    "5m": "5 mins",
    "15m": "15 mins",
    "1h": "1 hour",
    "1d": "1 day",
}

class MarketDataService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_coverage(self, symbol_id: int) -> dict:
        """Get the cached date ranges for a given symbol."""
        stmt = (
            select(
                HistoricalBar.timeframe,
                func.min(HistoricalBar.ts).label("min_ts"),
                func.max(HistoricalBar.ts).label("max_ts"),
                func.count(HistoricalBar.id).label("count")
            )
            .where(HistoricalBar.symbol_id == symbol_id)
            .group_by(HistoricalBar.timeframe)
        )
        result = await self.db.execute(stmt)
        
        coverage = []
        for row in result.all():
            coverage.append({
                "timeframe": row.timeframe,
                "start": row.min_ts,
                "end": row.max_ts,
                "count": row.count
            })
        return {"symbol_id": symbol_id, "coverage": coverage}

    async def prefetch_bars(self, symbol_id: int, timeframe: str, start: datetime, end: datetime) -> int:
        """
        Fetch missing slices from IBKR and save to the DB.
        """
        if timeframe not in TIMEFRAME_MAP:
            raise ValueError(f"Unsupported timeframe: {timeframe}")

        symbol = await self.db.get(Symbol, symbol_id)
        if not symbol:
            raise ValueError(f"Symbol not found: {symbol_id}")

        logger.info(f"Prefetching {timeframe} bars for {symbol.ticker} from {start} to {end}")
        
        ib = IB()
        client_id = 99  # Separate from bridge
        try:
            await ib.connectAsync(settings.TWS_PAPER_HOST, settings.TWS_PAPER_PORT, clientId=client_id, timeout=10)
        except Exception as e:
            logger.error(f"Failed to connect to IBKR for prefetch: {e}")
            raise
            
        try:
            contract = Contract()
            contract.symbol = symbol.ticker
            contract.secType = "STK"
            contract.exchange = symbol.exchange
            contract.currency = "USD"
            
            delta = end - start
            days = delta.days
            if days <= 1:
                duration_str = "1 D"
            elif days <= 7:
                duration_str = f"{days + 1} D"
            elif days <= 30:
                duration_str = f"{days + 2} D"
            elif days <= 365:
                duration_str = "1 Y"
            else:
                duration_str = "5 Y"
                
            end_str = end.strftime("%Y%m%d %H:%M:%S")

            bars = await ib.reqHistoricalDataAsync(
                contract,
                endDateTime=end_str,
                durationStr=duration_str,
                barSizeSetting=TIMEFRAME_MAP[timeframe],
                whatToShow="TRADES",
                useRTH=False,
                formatDate=2
            )
            
            if not bars:
                logger.warning(f"No bars returned from IBKR for {symbol.ticker}")
                return 0
                
            logger.info(f"Fetched {len(bars)} bars from IBKR for {symbol.ticker}")
            
            records = []
            for bar in bars:
                bar_time = bar.date
                if not bar_time.tzinfo:
                    bar_time = bar_time.replace(tzinfo=timezone.utc)
                    
                if not (start <= bar_time <= end):
                    continue
                    
                records.append({
                    "symbol_id": symbol_id,
                    "timeframe": timeframe,
                    "ts": bar_time,
                    "open": Decimal(str(bar.open)),
                    "high": Decimal(str(bar.high)),
                    "low": Decimal(str(bar.low)),
                    "close": Decimal(str(bar.close)),
                    "volume": Decimal(str(bar.volume)),
                    "source": "ibkr"
                })
                
            if not records:
                return 0
                
            stmt = insert(HistoricalBar).values(records)
            stmt = stmt.on_conflict_do_nothing(
                index_elements=["symbol_id", "timeframe", "ts"]
            )
            
            result = await self.db.execute(stmt)
            await self.db.commit()
            
            rows = result.rowcount
            logger.info(f"Upserted {rows} bars into DB")
            return rows
            
        finally:
            ib.disconnect()
