"""Data Source abstractions for fetching OHLCV bars during execution."""

from abc import ABC, abstractmethod
from datetime import datetime
import pandas as pd

class MarketDataSource(ABC):
    @abstractmethod
    async def get_bars(self, symbol_id: int, timeframe: str, start: datetime, end: datetime) -> pd.DataFrame:
        """Fetch historical bars as a DataFrame."""
        pass

class ReplayDataSource(MarketDataSource):
    """Fetches bars exclusively from the local PostgreSQL database for backtesting."""
    
    def __init__(self, db_session):
        self.db = db_session
        
    async def get_bars(self, symbol_id: int, timeframe: str, start: datetime, end: datetime) -> pd.DataFrame:
        from app.models.historical_bar import HistoricalBar
        from sqlalchemy import select
        
        stmt = (
            select(HistoricalBar)
            .where(
                HistoricalBar.symbol_id == symbol_id,
                HistoricalBar.timeframe == timeframe,
                HistoricalBar.ts >= start,
                HistoricalBar.ts <= end
            )
            .order_by(HistoricalBar.ts.asc())
        )
        
        result = await self.db.execute(stmt)
        bars = result.scalars().all()
        
        data = []
        for b in bars:
            data.append({
                "ts": b.ts,
                "open": float(b.open),
                "high": float(b.high),
                "low": float(b.low),
                "close": float(b.close),
                "volume": float(b.volume)
            })
            
        df = pd.DataFrame(data)
        if not df.empty:
            df.set_index("ts", inplace=True)
        return df

class LiveDataSource(MarketDataSource):
    """Fetches bars for live trading. Currently identical to ReplayDataSource until streaming is added."""
    
    def __init__(self, db_session):
        self.db = db_session
        
    async def get_bars(self, symbol_id: int, timeframe: str, start: datetime, end: datetime) -> pd.DataFrame:
        return await ReplayDataSource(self.db).get_bars(symbol_id, timeframe, start, end)
