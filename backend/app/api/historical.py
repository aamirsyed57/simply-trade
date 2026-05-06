"""Historical Data API."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.market_data_service import MarketDataService
from app.workers.data_fetcher import prefetch_historical_data

router = APIRouter(prefix="/historical", tags=["historical"])

class CoverageResponse(BaseModel):
    symbol_id: int
    coverage: list[dict]

class PrefetchRequest(BaseModel):
    symbol_id: int
    timeframe: str
    start: datetime
    end: datetime

class PrefetchResponse(BaseModel):
    task_id: str
    message: str

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
    # Celery requires basic types, so we convert datetimes to ISO strings
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
