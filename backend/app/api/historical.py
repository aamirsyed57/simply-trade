"""Historical Data API — coverage, prefetch, CSV upload, bar listing, and bar deletion."""

from __future__ import annotations

import io
import logging
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.historical_bar import HistoricalBar
from app.models.symbol import Symbol
from app.services.market_data_service import MarketDataService
from app.workers.data_fetcher import fetch_yfinance_data, prefetch_historical_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/historical", tags=["historical"])

# ──────────────────────────────────────────────────────────
# Pydantic helpers
# ──────────────────────────────────────────────────────────

class CoverageResponse(BaseModel):
    symbol_id: int
    coverage: list[dict]


class PrefetchRequest(BaseModel):
    symbol_id: int
    timeframe: str
    start: datetime
    end: datetime


class YFinanceFetchRequest(BaseModel):
    symbol_id: int
    timeframe: str = "1d"
    start: datetime
    end: datetime
    yf_ticker: str | None = None  # override when Yahoo ticker differs from stored ticker (e.g. "VOD.L")


class PrefetchResponse(BaseModel):
    task_id: str
    message: str


class UploadResponse(BaseModel):
    symbol_id: int
    timeframe: str
    rows_inserted: int
    rows_skipped: int
    message: str


class BarRead(BaseModel):
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


# ──────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────

_REQUIRED_COLS = {"ts", "open", "high", "low", "close", "volume"}
_ALT_COL_MAP = {
    # common Yahoo Finance / Alpha Vantage column names → canonical
    "date": "ts",
    "datetime": "ts",
    "timestamp": "ts",
    "time": "ts",
    "open": "open",
    "high": "high",
    "low": "low",
    "close": "close",
    "adj close": "close",
    "adjusted close": "close",
    "volume": "volume",
}


def _normalise_df(df: pd.DataFrame) -> pd.DataFrame:
    """Lowercase + remap column names, validate required columns exist."""
    df.columns = [c.strip().lower() for c in df.columns]
    df = df.rename(columns=_ALT_COL_MAP)
    missing = _REQUIRED_COLS - set(df.columns)
    if missing:
        raise ValueError(
            f"CSV is missing required columns: {missing}. "
            f"Found columns: {list(df.columns)}"
        )
    df = df[list(_REQUIRED_COLS)].copy()
    df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
    df = df.dropna(subset=["ts"])
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna()
    return df


# ──────────────────────────────────────────────────────────
# Existing endpoints
# ──────────────────────────────────────────────────────────

@router.get(
    "/coverage/{symbol_id}",
    response_model=CoverageResponse,
    summary="Get cached date ranges per timeframe for a symbol",
)
async def get_coverage(symbol_id: int, db: AsyncSession = Depends(get_db)):
    service = MarketDataService(db)
    return await service.get_coverage(symbol_id)


@router.post(
    "/prefetch",
    response_model=PrefetchResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue a bulk fetch of historical data",
)
async def prefetch_data(req: PrefetchRequest):
    task = prefetch_historical_data.delay(
        symbol_id=req.symbol_id,
        timeframe=req.timeframe,
        start=req.start.isoformat(),
        end=req.end.isoformat(),
    )
    return {
        "task_id": task.id,
        "message": f"Prefetch task queued for symbol {req.symbol_id} ({req.timeframe})",
    }


@router.post(
    "/yfinance",
    response_model=PrefetchResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Fetch historical bars from Yahoo Finance (background task)",
    description=(
        "Queues a Celery task that downloads OHLCV bars from Yahoo Finance and upserts them into "
        "the DB. Returns immediately with a `task_id` you can poll. "
        "Set `yf_ticker` when the Yahoo Finance ticker differs from the stored one "
        "(e.g. `VOD.L` for LSE-listed Vodafone). "
        "**yfinance data limits by timeframe:** 1m → 7 days, 5m/15m → 60 days, 1h → 730 days, 1d → unlimited."
    ),
)
async def fetch_from_yfinance(req: YFinanceFetchRequest, db: AsyncSession = Depends(get_db)) -> Any:
    sym = await db.get(Symbol, req.symbol_id)
    if sym is None:
        raise HTTPException(status_code=404, detail=f"Symbol {req.symbol_id} not found")
    task = fetch_yfinance_data.delay(
        symbol_id=req.symbol_id,
        timeframe=req.timeframe,
        start=req.start.isoformat(),
        end=req.end.isoformat(),
        yf_ticker=req.yf_ticker,
    )
    ticker_label = req.yf_ticker or sym.ticker
    return PrefetchResponse(
        task_id=task.id,
        message=f"yfinance fetch queued for {ticker_label} [{req.timeframe}] {req.start.date()} → {req.end.date()}",
    )


# ──────────────────────────────────────────────────────────
# NEW: CSV upload
# ──────────────────────────────────────────────────────────

@router.post(
    "/upload",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload OHLCV bars from a CSV file",
    description=(
        "Accepts a CSV with columns: **ts, open, high, low, close, volume** "
        "(or common aliases like *date*, *adj close*, *timestamp*). "
        "Rows are upserted — duplicates (symbol_id, timeframe, ts) are skipped."
    ),
)
async def upload_csv(
    symbol_id: int = Query(..., description="Target symbol ID"),
    timeframe: str = Query("1d", description='Bar timeframe: "1m", "5m", "15m", "1h", "1d"'),
    file: UploadFile = File(..., description="CSV file"),
    db: AsyncSession = Depends(get_db),
) -> Any:
    # Validate symbol exists
    sym = await db.get(Symbol, symbol_id)
    if sym is None:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol_id} not found")

    # Read & parse
    raw = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(raw))
        df = _normalise_df(df)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {exc}")

    if df.empty:
        raise HTTPException(status_code=422, detail="CSV contains no valid rows after parsing.")

    # Build records
    records = [
        {
            "symbol_id": symbol_id,
            "timeframe": timeframe,
            "ts": row["ts"].to_pydatetime().replace(tzinfo=timezone.utc)
            if row["ts"].tzinfo is None
            else row["ts"].to_pydatetime(),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]),
            "source": "csv",
        }
        for _, row in df.iterrows()
    ]

    # Upsert — skip duplicates via ON CONFLICT DO NOTHING
    stmt = (
        pg_insert(HistoricalBar)
        .values(records)
        .on_conflict_do_nothing(constraint="uq_bar_symbol_timeframe_ts")
    )
    result = await db.execute(stmt)
    await db.commit()

    rows_inserted = result.rowcount if result.rowcount >= 0 else len(records)
    rows_skipped = len(records) - rows_inserted

    logger.info(
        f"CSV upload: symbol={symbol_id} tf={timeframe} "
        f"total={len(records)} inserted={rows_inserted} skipped={rows_skipped}"
    )
    return UploadResponse(
        symbol_id=symbol_id,
        timeframe=timeframe,
        rows_inserted=rows_inserted,
        rows_skipped=rows_skipped,
        message=f"Imported {rows_inserted} bars ({rows_skipped} duplicates skipped) for {sym.ticker} [{timeframe}]",
    )


# ──────────────────────────────────────────────────────────
# NEW: List bars (for preview / charting)
# ──────────────────────────────────────────────────────────

@router.get(
    "/bars/{symbol_id}",
    response_model=list[BarRead],
    summary="List stored OHLCV bars for a symbol",
)
async def list_bars(
    symbol_id: int,
    timeframe: str = Query("1d"),
    limit: int = Query(500, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
) -> Any:
    sym = await db.get(Symbol, symbol_id)
    if sym is None:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol_id} not found")

    result = await db.execute(
        select(HistoricalBar)
        .where(
            HistoricalBar.symbol_id == symbol_id,
            HistoricalBar.timeframe == timeframe,
        )
        .order_by(HistoricalBar.ts.desc())
        .limit(limit)
    )
    bars = result.scalars().all()
    # Return in chronological order
    return sorted(
        [
            BarRead(
                ts=b.ts,
                open=float(b.open),
                high=float(b.high),
                low=float(b.low),
                close=float(b.close),
                volume=float(b.volume),
            )
            for b in bars
        ],
        key=lambda x: x.ts,
    )


# ──────────────────────────────────────────────────────────
# NEW: Bar counts per timeframe (for coverage table)
# ──────────────────────────────────────────────────────────

@router.get(
    "/summary/{symbol_id}",
    summary="Bar count per timeframe for a symbol",
)
async def bar_summary(symbol_id: int, db: AsyncSession = Depends(get_db)) -> Any:
    sym = await db.get(Symbol, symbol_id)
    if sym is None:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol_id} not found")

    result = await db.execute(
        select(HistoricalBar.timeframe, func.count().label("bar_count"))
        .where(HistoricalBar.symbol_id == symbol_id)
        .group_by(HistoricalBar.timeframe)
        .order_by(HistoricalBar.timeframe)
    )
    rows = result.all()
    return {
        "symbol_id": symbol_id,
        "ticker": sym.ticker,
        "timeframes": [{"timeframe": r.timeframe, "bar_count": r.bar_count} for r in rows],
    }


# ──────────────────────────────────────────────────────────
# NEW: Delete bars
# ──────────────────────────────────────────────────────────

@router.delete(
    "/bars/{symbol_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete stored bars for a symbol (optionally filter by timeframe)",
)
async def delete_bars(
    symbol_id: int,
    timeframe: str | None = Query(None, description="Leave empty to delete all timeframes"),
    db: AsyncSession = Depends(get_db),
) -> Any:
    sym = await db.get(Symbol, symbol_id)
    if sym is None:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol_id} not found")

    stmt = delete(HistoricalBar).where(HistoricalBar.symbol_id == symbol_id)
    if timeframe:
        stmt = stmt.where(HistoricalBar.timeframe == timeframe)

    result = await db.execute(stmt)
    await db.commit()
    return {"deleted": result.rowcount, "symbol_id": symbol_id, "timeframe": timeframe or "all"}

