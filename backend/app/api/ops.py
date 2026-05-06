"""Ops router — health, IBKR status stub, kill-switch stub."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/ops", tags=["ops"])


class HealthResponse(BaseModel):
    status: str


class IBKRStatusResponse(BaseModel):
    connected: bool
    paper_gateway: str
    live_gateway: str
    note: str


class KillSwitchResponse(BaseModel):
    live_trading_enabled: bool
    message: str


@router.get("/health", response_model=HealthResponse, summary="Service health check")
async def health():
    return {"status": "ok"}


@router.get(
    "/ibkr/status",
    response_model=IBKRStatusResponse,
    summary="IBKR bridge connection status (stub — Phase 3)",
)
async def ibkr_status():
    return {
        "connected": False,
        "paper_gateway": "not connected — Phase 3",
        "live_gateway": "not connected — Phase 3",
        "note": "IBKR bridge will be implemented in Phase 3",
    }


@router.post(
    "/kill-switch",
    response_model=KillSwitchResponse,
    summary="Emergency kill switch — halt all live trading (stub — Phase 8)",
)
async def kill_switch():
    # Phase 8: set LIVE_TRADING_ENABLED=false in Redis and cancel all open orders
    return {
        "live_trading_enabled": False,
        "message": "Kill switch stub — full implementation in Phase 8",
    }
