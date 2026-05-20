"""Ops router — health, IBKR status stub, kill-switch stub."""

import asyncio
import json
import os
from datetime import datetime, timezone

import redis.asyncio as redis
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.bridge.events import CHANNEL_COMMANDS, CHANNEL_EMERGENCY, EmergencyEvent, SyncCommandEvent
from app.config import settings
from app.database import get_db
from app.models.fill import Fill
from app.models.ibkr_order import IBKROrder
from app.models.order import Order, OrderStatus
from app.models.symbol import Symbol
from app.services.flex_query import FlexQueryError, sync_flex_fills

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
    from app.services.notification_service import notifier
    
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    event = EmergencyEvent(action="cancel_all")
    await r.publish(CHANNEL_EMERGENCY, event.model_dump_json())
    
    # Phase 8: set LIVE_TRADING_ENABLED=false in Redis
    await r.set("ops:live_trading_enabled", "false")
    await r.aclose()
    
    try:
        await notifier.send("kill_switch", "EMERGENCY: Kill switch activated. Sent cancel_all to bridge. Trading disabled.")
    except Exception:
        pass
        
    return {
        "live_trading_enabled": False,
        "message": "Kill switch activated. Sent cancel_all to bridge.",
    }


# Internal OrderStatus → IBKR status string for ibkr_orders rows built from the platform DB
_STATUS_TO_IBKR: dict[str, str] = {
    OrderStatus.PENDING.value:          "PreSubmitted",
    OrderStatus.SUBMITTED.value:        "Submitted",
    OrderStatus.PARTIALLY_FILLED.value: "PartiallyFilled",
    OrderStatus.FILLED.value:           "Filled",
    OrderStatus.CANCELLED.value:        "Cancelled",
    OrderStatus.REJECTED.value:         "Inactive",
}


async def _upsert_from_hash_entry(db: AsyncSession, entry: dict, now: datetime) -> None:
    ibkr_id = int(entry["ibkr_order_id"])
    is_platform = entry.get("order_ref", "").startswith("pf:")
    stmt = (
        pg_insert(IBKROrder)
        .values(
            ibkr_order_id=ibkr_id,
            ibkr_perm_id=entry.get("ibkr_perm_id"),
            order_ref=entry.get("order_ref", ""),
            ticker=entry.get("ticker", ""),
            exchange=entry.get("exchange", ""),
            action=entry.get("action", ""),
            order_type=entry.get("order_type", ""),
            total_quantity=float(entry.get("total_quantity") or 0),
            limit_price=entry.get("limit_price"),
            status=entry.get("status", ""),
            filled=float(entry.get("filled") or 0),
            remaining=float(entry.get("remaining") or 0),
            avg_fill_price=float(entry.get("avg_fill_price") or 0),
            is_platform_order=is_platform,
            first_seen_at=now,
            last_updated_at=now,
        )
        .on_conflict_do_update(
            index_elements=["ibkr_order_id"],
            set_={
                "ibkr_perm_id":     entry.get("ibkr_perm_id"),
                "order_ref":        entry.get("order_ref", ""),
                "ticker":           entry.get("ticker", ""),
                "exchange":         entry.get("exchange", ""),
                "action":           entry.get("action", ""),
                "order_type":       entry.get("order_type", ""),
                "total_quantity":   float(entry.get("total_quantity") or 0),
                "status":           entry.get("status", ""),
                "filled":           float(entry.get("filled") or 0),
                "remaining":        float(entry.get("remaining") or 0),
                "avg_fill_price":   float(entry.get("avg_fill_price") or 0),
                "is_platform_order": is_platform,
                "last_updated_at":  now,
            },
        )
    )
    await db.execute(stmt)


class SyncOrdersResponse(BaseModel):
    bridge_upserted: int
    platform_upserted: int
    triggered_bridge_refresh: bool
    message: str


@router.post(
    "/ibkr/sync-orders",
    response_model=SyncOrdersResponse,
    summary="Force-fetch all IBKR orders (live + historical platform) and persist to DB",
)
async def sync_ibkr_orders(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)

    # ── 1. Tell the bridge to refresh: reqOpenOrders + reqCompletedOrders ──────
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        cmd = SyncCommandEvent(action="req_open_orders")
        await r.publish(CHANNEL_COMMANDS, cmd.model_dump_json())

        # Wait for the first bridge callbacks to land
        await asyncio.sleep(1)

        raw = await r.hgetall("bridge:ibkr_orders")
    finally:
        await r.aclose()

    # ── 2. Upsert everything currently in the bridge:ibkr_orders hash ─────────
    bridge_upserted = 0
    for entry_json in raw.values():
        try:
            entry = json.loads(entry_json)
        except Exception:
            continue
        await _upsert_from_hash_entry(db, entry, now)
        bridge_upserted += 1

    # ── 3. Upsert all platform orders from the DB (full history) ──────────────
    # Aggregate fills per order so we have accurate filled qty and avg price.
    rows = await db.execute(
        select(
            Order,
            Symbol.ticker,
            Symbol.exchange,
            func.coalesce(func.sum(Fill.qty), 0).label("total_filled"),
            case(
                (func.sum(Fill.qty) > 0,
                 func.sum(Fill.qty * Fill.price) / func.sum(Fill.qty)),
                else_=0,
            ).label("avg_fill_price"),
        )
        .join(Symbol, Symbol.id == Order.symbol_id)
        .outerjoin(Fill, Fill.order_id == Order.id)
        .where(Order.ibkr_order_id.is_not(None))
        .group_by(Order.id, Symbol.ticker, Symbol.exchange)
    )

    platform_upserted = 0
    for row in rows:
        order: Order = row.Order
        total_filled = float(row.total_filled)
        avg_px = float(row.avg_fill_price)
        remaining = float(order.qty) - total_filled
        ibkr_status = _STATUS_TO_IBKR.get(order.status.value, order.status.value)

        stmt = (
            pg_insert(IBKROrder)
            .values(
                ibkr_order_id=order.ibkr_order_id,
                order_ref=order.order_ref,
                ticker=row.ticker,
                exchange=row.exchange,
                action=order.side.value,
                order_type=order.order_type.value,
                total_quantity=float(order.qty),
                limit_price=float(order.limit_price) if order.limit_price else None,
                status=ibkr_status,
                filled=total_filled,
                remaining=max(0.0, remaining),
                avg_fill_price=avg_px,
                is_platform_order=True,
                first_seen_at=order.created_at,   # preserve original timestamp for new rows
                last_updated_at=now,
            )
            .on_conflict_do_update(
                index_elements=["ibkr_order_id"],
                set_={
                    # Refresh status + fill data from our authoritative DB records.
                    # ticker/exchange/action/order_type are stable — update them too
                    # in case an earlier row had empty strings from a bridge gap.
                    "ticker":           row.ticker,
                    "exchange":         row.exchange,
                    "action":           order.side.value,
                    "order_type":       order.order_type.value,
                    "total_quantity":   float(order.qty),
                    "status":           ibkr_status,
                    "filled":           total_filled,
                    "remaining":        max(0.0, remaining),
                    "avg_fill_price":   avg_px,
                    "is_platform_order": True,
                    "last_updated_at":  now,
                },
            )
        )
        await db.execute(stmt)
        platform_upserted += 1

    total = bridge_upserted + platform_upserted
    return SyncOrdersResponse(
        bridge_upserted=bridge_upserted,
        platform_upserted=platform_upserted,
        triggered_bridge_refresh=True,
        message=f"Synced {total} order(s): {bridge_upserted} from IBKR bridge, {platform_upserted} from platform history.",
    )


class SyncFlexFillsResponse(BaseModel):
    inserted: int
    message: str


@router.post(
    "/ibkr/sync-flex-fills",
    response_model=SyncFlexFillsResponse,
    summary="Fetch historical execution reports via IBKR Flex Query and persist to ibkr_fills",
)
async def sync_flex_fills_endpoint(db: AsyncSession = Depends(get_db)):
    token = settings.IBKR_FLEX_TOKEN
    query_id = settings.IBKR_FLEX_QUERY_ID
    if not token or not query_id:
        raise HTTPException(
            status_code=422,
            detail="IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID must be set in .env to use Flex Query sync.",
        )
    try:
        async with db.begin():
            inserted = await sync_flex_fills(db, token, query_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Flex Query failed: {e}")
    return SyncFlexFillsResponse(
        inserted=inserted,
        message=f"Flex Query sync complete — {inserted} new fill(s) inserted.",
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
