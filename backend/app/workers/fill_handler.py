"""Fill handler — subscribes to Redis bridge fill and order-status events."""

import asyncio
import json
import logging
from datetime import datetime, timezone

import redis.asyncio as aioredis
from celery.signals import worker_ready
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.workers.celery_app import celery_app
from app.config import settings
from app.database import AsyncSessionLocal
from app.models.ibkr_order import IBKROrder
from app.models.order import Order, OrderStatus
from app.services.order_service import OrderManager

logger = logging.getLogger(__name__)

CHANNEL_FILLS = "orders:fills"
CHANNEL_ORDER_STATUS = "orders:status"


async def _upsert_ibkr_order(session, entry: dict) -> None:
    """Insert or update a row in ibkr_orders from a bridge hash entry."""
    ibkr_id = int(entry["ibkr_order_id"])
    is_platform = bool(entry.get("order_ref", "").startswith("pf:"))
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
            first_seen_at=datetime.now(timezone.utc),
            last_updated_at=datetime.now(timezone.utc),
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
                "last_updated_at": datetime.now(timezone.utc),
            },
        )
    )
    await session.execute(stmt)


async def _handle_fill(data: dict) -> None:
    order_ref = data["order_ref"]
    qty = float(data["qty"])
    price = float(data["price"])

    async with AsyncSessionLocal() as session:
        async with session.begin():
            om = OrderManager(session)
            fill = await om.handle_fill(
                order_ref=order_ref,
                ibkr_exec_id=data["ibkr_exec_id"],
                qty=qty,
                price=price,
                commission=float(data.get("commission", 0.0)),
                timestamp=datetime.fromisoformat(data["timestamp"]),
            )
            if fill:
                logger.info(f"Processed fill for order_ref={order_ref}: qty={qty} @ {price}")


async def _handle_order_status(data: dict) -> None:
    order_ref = data["order_ref"]
    ibkr_order_id = int(data["ibkr_order_id"])
    status = data["status"]

    async with AsyncSessionLocal() as session:
        async with session.begin():
            om = OrderManager(session)
            await om.handle_order_status(
                order_ref=order_ref,
                ibkr_order_id=ibkr_order_id,
                status=status,
            )

            # Persist into ibkr_orders table (upsert).
            # ticker/exchange/action etc. are populated when the event came from
            # _on_completed_order or _on_open_order (full Trade context available).
            await _upsert_ibkr_order(session, {
                "ibkr_order_id": ibkr_order_id,
                "order_ref": order_ref,
                "ticker": data.get("ticker", ""),
                "exchange": data.get("exchange", ""),
                "action": data.get("action", ""),
                "order_type": data.get("order_type", ""),
                "total_quantity": float(data.get("total_quantity") or 0),
                "limit_price": data.get("limit_price"),
                "status": status,
                "filled": float(data.get("filled") or 0),
                "remaining": float(data.get("remaining") or 0),
                "avg_fill_price": float(data.get("avg_fill_price") or 0),
            })


async def _listen_for_fills():
    """Subscribe to Redis channels and dispatch events. Reconnects on error."""
    while True:
        try:
            r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            pubsub = r.pubsub()
            await pubsub.subscribe(CHANNEL_FILLS, CHANNEL_ORDER_STATUS)
            logger.info(f"Fill handler subscribed to {CHANNEL_FILLS}, {CHANNEL_ORDER_STATUS}")

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                    if message["channel"] == CHANNEL_FILLS:
                        await _handle_fill(data)
                    elif message["channel"] == CHANNEL_ORDER_STATUS:
                        await _handle_order_status(data)
                except Exception as e:
                    logger.error(f"Error processing event on {message['channel']}: {e} — data={message['data'][:200]}")

            await r.aclose()
        except Exception as e:
            logger.error(f"Fill listener connection error: {e}. Reconnecting in 5s…")
            await asyncio.sleep(5)


async def _reconcile_ibkr_ids() -> None:
    """
    Read bridge:ibkr_orders Redis hash, backfill ibkr_order_id for platform DB orders
    that missed the initial OrderStatusEvent, and upsert all entries into ibkr_orders table.
    """
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        raw = await r.hgetall("bridge:ibkr_orders")
    finally:
        await r.aclose()

    if not raw:
        return

    entries: list[dict] = []
    ref_to_ibkr: dict[str, int] = {}
    for ibkr_id_str, entry_json in raw.items():
        try:
            entry = json.loads(entry_json)
            entries.append(entry)
            ref = entry.get("order_ref", "")
            if ref.startswith("pf:"):
                ref_to_ibkr[ref] = int(ibkr_id_str)
        except Exception:
            pass

    async with AsyncSessionLocal() as session:
        async with session.begin():
            # Upsert every live order from Redis into the DB table
            for entry in entries:
                await _upsert_ibkr_order(session, entry)

            # Backfill ibkr_order_id on platform DB orders that missed the status event
            if ref_to_ibkr:
                result = await session.execute(
                    select(Order)
                    .where(Order.ibkr_order_id.is_(None))
                    .where(Order.status.in_([OrderStatus.PENDING, OrderStatus.SUBMITTED]))
                )
                orders = result.scalars().all()
                updated = 0
                for order in orders:
                    ibkr_id = ref_to_ibkr.get(order.order_ref)
                    if ibkr_id is not None:
                        order.ibkr_order_id = ibkr_id
                        updated += 1
                if updated:
                    logger.info(f"Reconciliation: backfilled ibkr_order_id for {updated} order(s)")


@celery_app.task(name="app.workers.fill_handler.reconcile_ibkr_ids")
def reconcile_ibkr_ids():
    """Periodic task: sync bridge:ibkr_orders hash → DB and backfill ibkr_order_id."""
    asyncio.run(_reconcile_ibkr_ids())


@celery_app.task(name="app.workers.fill_handler.start_fill_listener", bind=True)
def start_fill_listener(self):
    """Long-running task that subscribes to Redis fill/status events. Started automatically on worker_ready."""
    logger.info("Starting fill listener")
    asyncio.run(_listen_for_fills())


@worker_ready.connect
def _auto_start_fill_listener(sender, **kwargs):
    """Fire the fill listener task as soon as the Celery worker is ready."""
    logger.info("Worker ready — launching fill listener task")
    start_fill_listener.apply_async()
