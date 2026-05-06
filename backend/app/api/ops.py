"""Ops router — health, IBKR status stub, kill-switch stub."""

from fastapi import APIRouter
from pydantic import BaseModel
import json
import os
import redis.asyncio as redis
from app.config import settings
from app.bridge.events import CHANNEL_EMERGENCY, EmergencyEvent

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
    summary="IBKR bridge connection status",
)
async def ibkr_status():
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    val = await r.get("bridge:connection_status")
    await r.aclose()
    
    if val:
        try:
            status = json.loads(val)
            return {
                "connected": status.get("connected", False),
                "paper_gateway": "connected" if status.get("gateway_mode") == "paper" else "disconnected",
                "live_gateway": "not connected — Phase 3",
                "note": status.get("note", "Connected to bridge"),
            }
        except Exception:
            pass
            
    return {
        "connected": False,
        "paper_gateway": "unknown",
        "live_gateway": "unknown",
        "note": "Bridge not responding",
    }


@router.post(
    "/kill-switch",
    response_model=KillSwitchResponse,
    summary="Emergency kill switch — halt all live trading",
)
async def kill_switch():
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    event = EmergencyEvent(action="cancel_all")
    await r.publish(CHANNEL_EMERGENCY, event.model_dump_json())
    
    # Phase 8: set LIVE_TRADING_ENABLED=false in Redis
    await r.set("ops:live_trading_enabled", "false")
    await r.aclose()
    
    return {
        "live_trading_enabled": False,
        "message": "Kill switch activated. Sent cancel_all to bridge.",
    }


@router.get(
    "/logs/worker",
    summary="Fetch recent worker logs",
)
async def worker_logs(lines: int = 200):
    """Returns the last N lines of the celery worker log."""
    log_path = "/app/logs/worker.log"
    if not os.path.exists(log_path):
        return {"logs": ["Worker logs not available yet."]}
    
    try:
        # A simple python-based tail equivalent
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.readlines()
            return {"logs": content[-lines:]}
    except Exception as e:
        return {"logs": [f"Error reading logs: {str(e)}"]}
