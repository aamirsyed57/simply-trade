"""Ops router — health, IBKR status stub, kill-switch stub."""

import asyncio
import json
import os
from datetime import datetime, timezone

import redis.asyncio as redis
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.bridge.events import CHANNEL_COMMANDS, CHANNEL_EMERGENCY, EmergencyEvent, SyncCommandEvent
from app.config import settings
from app.database import get_db
from app.models.ibkr_order import IBKROrder

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


class SyncOrdersResponse(BaseModel):
    upserted: int
    triggered_bridge_refresh: bool
    message: str


@router.post(
    "/ibkr/sync-orders",
    response_model=SyncOrdersResponse,
    summary="Force-fetch all open IBKR orders and persist them to the DB",
)
async def sync_ibkr_orders(db: AsyncSession = Depends(get_db)):
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        # Tell the bridge to call reqOpenOrders() so IBKR fires openOrderEvent
        # for every open order — this refreshes bridge:ibkr_orders asynchronously.
        cmd = SyncCommandEvent(action="req_open_orders")
        await r.publish(CHANNEL_COMMANDS, cmd.model_dump_json())
        triggered = True

        # Give the bridge a moment to receive the command and fire the first callbacks.
        await asyncio.sleep(1)

        # Read whatever is currently in the hash and upsert everything to the DB.
        raw = await r.hgetall("bridge:ibkr_orders")
    finally:
        await r.aclose()

    now = datetime.now(timezone.utc)
    upserted = 0

    for entry_json in raw.values():
        try:
            entry = json.loads(entry_json)
        except Exception:
            continue

        ibkr_id = int(entry["ibkr_order_id"])
        is_platform = entry.get("order_ref", "").startswith("pf:")

        stmt = (
            pg_insert(IBKROrder)
            .values(
                ibkr_order_id=ibkr_id,
                order_ref=entry.get("order_ref", ""),
                ticker=entry.get("ticker", ""),
                exchange=entry.get("exchange", ""),
                action=entry.get("action", ""),
                order_type=entry.get("order_type", ""),
                total_quantity=float(entry.get("total_quantity", 0)),
                limit_price=entry.get("limit_price"),
                status=entry.get("status", ""),
                filled=float(entry.get("filled", 0)),
                remaining=float(entry.get("remaining", 0)),
                avg_fill_price=float(entry.get("avg_fill_price", 0)),
                is_platform_order=is_platform,
                first_seen_at=now,
                last_updated_at=now,
            )
            .on_conflict_do_update(
                index_elements=["ibkr_order_id"],
                set_={
                    "order_ref": entry.get("order_ref", ""),
                    "status": entry.get("status", ""),
                    "filled": float(entry.get("filled", 0)),
                    "remaining": float(entry.get("remaining", 0)),
                    "avg_fill_price": float(entry.get("avg_fill_price", 0)),
                    "is_platform_order": is_platform,
                    "last_updated_at": now,
                },
            )
        )
        await db.execute(stmt)
        upserted += 1

    return SyncOrdersResponse(
        upserted=upserted,
        triggered_bridge_refresh=triggered,
        message=f"Upserted {upserted} order(s) from bridge hash. Bridge refresh triggered — new orders will appear within seconds.",
    )


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
