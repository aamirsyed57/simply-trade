"""Fill handler — subscribes to Redis bridge fill events and routes to OrderManager."""

import asyncio
import json
import logging
from datetime import datetime

import redis.asyncio as aioredis

from app.workers.celery_app import celery_app
from app.config import settings
from app.database import async_sessionmaker
from app.services.order_service import OrderManager

logger = logging.getLogger(__name__)

CHANNEL_FILLS = "orders:fills"


async def _listen_for_fills():
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(CHANNEL_FILLS)

    logger.info(f"Fill handler subscribed to {CHANNEL_FILLS}")

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue

        try:
            data = json.loads(message["data"])
            order_ref = data["order_ref"]
            ibkr_exec_id = data["ibkr_exec_id"]
            symbol_id = data["symbol_id"]
            qty = float(data["qty"])
            price = float(data["price"])
            commission = float(data.get("commission", 0.0))
            ts = datetime.fromisoformat(data["timestamp"])

            async with async_sessionmaker() as session:
                async with session.begin():
                    om = OrderManager(session)
                    fill = await om.handle_fill(
                        order_ref=order_ref,
                        ibkr_exec_id=ibkr_exec_id,
                        qty=qty,
                        price=price,
                        commission=commission,
                        timestamp=ts,
                    )
                    if fill:
                        logger.info(f"Processed fill for order_ref={order_ref}: qty={qty} @ {price}")

        except Exception as e:
            logger.error(f"Error processing fill event: {e} — data={message['data'][:200]}")

    await r.aclose()


@celery_app.task(name="app.workers.fill_handler.start_fill_listener", bind=True)
def start_fill_listener(self):
    """
    Long-running Celery task that subscribes to Redis fill events.
    Should be started once on worker startup (e.g., via Celery Beat or worker init).
    """
    logger.info("Starting fill listener")
    asyncio.run(_listen_for_fills())
