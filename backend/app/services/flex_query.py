"""IBKR Flex Query HTTP client — fetches historical execution reports."""

import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal
from xml.etree import ElementTree as ET

import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ibkr_fill import IBKRFill

logger = logging.getLogger(__name__)

_SEND_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest"
_MAX_POLLS = 20
_POLL_DELAY = 2.0  # seconds between polls


class FlexQueryError(Exception):
    pass


def _parse_datetime(dt_str: str) -> datetime:
    """Parse IBKR flex datetime strings: 'YYYYMMDD;HHmmss' or 'YYYYMMDD HH:mm:ss'."""
    dt_str = dt_str.strip()
    if ";" in dt_str:
        date_part, time_part = dt_str.split(";", 1)
        dt = datetime.strptime(date_part + time_part, "%Y%m%d%H%M%S")
    elif " " in dt_str:
        dt = datetime.strptime(dt_str, "%Y%m%d %H:%M:%S")
    else:
        dt = datetime.strptime(dt_str, "%Y%m%d")
    return dt.replace(tzinfo=timezone.utc)


def _parse_executions(root: ET.Element) -> list[dict]:
    """Extract execution records from a parsed Flex Query XML tree."""
    fills: list[dict] = []
    # <Execution> tags can appear under <Executions> or <Trades>
    for elem in root.iter("Execution"):
        fills.append(_elem_to_fill(elem))
    for elem in root.iter("Trade"):
        # Some query types return <Trade> instead of <Execution>
        if elem.get("ibExecID"):
            fills.append(_elem_to_fill(elem))
    return fills


def _elem_to_fill(elem: ET.Element) -> dict:
    exec_id = elem.get("ibExecID", "")
    order_id_raw = elem.get("ibOrderID", "0") or "0"
    try:
        order_id = int(order_id_raw)
    except ValueError:
        order_id = 0

    order_ref = elem.get("orderReference", "")
    buy_sell = (elem.get("buySell") or "").upper()
    action = "BUY" if buy_sell in ("BUY", "BOT") else "SELL"

    # commission is negative in IBKR ("costs" you money) — store as positive
    commission_raw = elem.get("ibCommission", "0") or "0"
    try:
        commission = abs(float(commission_raw))
    except ValueError:
        commission = 0.0

    date_time_str = elem.get("dateTime", "") or elem.get("reportDate", "")
    ts = _parse_datetime(date_time_str) if date_time_str else datetime.now(timezone.utc)

    return {
        "ibkr_exec_id": exec_id,
        "ibkr_order_id": order_id if order_id else None,
        "order_ref": order_ref,
        "ticker": elem.get("symbol", ""),
        "exchange": elem.get("exchange") or elem.get("listingExchange", ""),
        "action": action,
        "qty": abs(float(elem.get("quantity", "0") or "0")),
        "price": float(elem.get("tradePrice", "0") or "0"),
        "commission": commission,
        "timestamp": ts,
    }


async def _send_request(client: httpx.AsyncClient, token: str, query_id: str) -> tuple[str, str]:
    """Initiate a Flex Query and return (reference_code, get_url)."""
    resp = await client.get(
        _SEND_URL,
        params={"t": token, "q": query_id, "v": "3"},
        timeout=30,
    )
    resp.raise_for_status()
    root = ET.fromstring(resp.text)
    status = root.findtext("Status", "")
    if status != "Success":
        code = root.findtext("ErrorCode", "")
        msg = root.findtext("ErrorMessage", resp.text[:200])
        raise FlexQueryError(f"SendRequest failed [{code}]: {msg}")
    ref = root.findtext("ReferenceCode", "")
    url = root.findtext("Url", "")
    if not ref or not url:
        raise FlexQueryError(f"SendRequest missing ReferenceCode or Url: {resp.text[:200]}")
    return ref, url


async def _fetch_statement(client: httpx.AsyncClient, token: str, ref_code: str, get_url: str) -> ET.Element:
    """Poll until the statement is ready, then return the parsed XML root."""
    for attempt in range(_MAX_POLLS):
        await asyncio.sleep(_POLL_DELAY)
        resp = await client.get(
            get_url,
            params={"t": token, "q": ref_code, "v": "3"},
            timeout=60,
        )
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        if root.tag == "FlexStatementOperationMessage":
            status = root.findtext("Status", "")
            code = root.findtext("ErrorCode", "")
            if code == "1019":
                logger.debug(f"Flex statement not ready, attempt {attempt + 1}/{_MAX_POLLS}")
                continue
            if status != "Success":
                msg = root.findtext("ErrorMessage", resp.text[:200])
                raise FlexQueryError(f"GetStatement failed [{code}]: {msg}")
        # Got the actual statement
        return root
    raise FlexQueryError(f"Flex statement not ready after {_MAX_POLLS} attempts ({_MAX_POLLS * _POLL_DELAY:.0f}s)")


async def sync_flex_fills(session: AsyncSession, token: str, query_id: str) -> int:
    """Run a full Flex Query cycle and upsert new fills into ibkr_fills. Returns count inserted."""
    async with httpx.AsyncClient() as client:
        ref_code, get_url = await _send_request(client, token, query_id)
        logger.info(f"Flex Query submitted, ref={ref_code}")
        root = await _fetch_statement(client, token, ref_code, get_url)

    fills = _parse_executions(root)
    logger.info(f"Flex Query returned {len(fills)} execution(s)")

    inserted = 0
    for fill in fills:
        if not fill["ibkr_exec_id"]:
            continue
        order_ref = fill["order_ref"]
        parts = order_ref.split(":")
        execution_mode = parts[-1] if len(parts) >= 4 and parts[0] == "pf" else ""
        stmt = (
            pg_insert(IBKRFill)
            .values(
                ibkr_exec_id=fill["ibkr_exec_id"],
                ibkr_order_id=fill["ibkr_order_id"],
                order_ref=order_ref,
                ticker=fill["ticker"],
                exchange=fill["exchange"],
                action=fill["action"],
                qty=Decimal(str(fill["qty"])),
                price=Decimal(str(fill["price"])),
                commission=Decimal(str(fill["commission"])),
                is_platform_order=order_ref.startswith("pf:"),
                execution_mode=execution_mode,
                timestamp=fill["timestamp"],
            )
            .on_conflict_do_nothing(index_elements=["ibkr_exec_id"])
        )
        result = await session.execute(stmt)
        inserted += result.rowcount

    return inserted
