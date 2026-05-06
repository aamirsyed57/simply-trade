"""Integration tests for the Phase 2 REST API."""

import pytest
from decimal import Decimal
from httpx import AsyncClient, ASGITransport

from app.main import app

BASE = "/api/v1"


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health(client: AsyncClient) -> None:
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_ops_health(client: AsyncClient) -> None:
    r = await client.get("/ops/health")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_ibkr_status_stub(client: AsyncClient) -> None:
    r = await client.get("/ops/ibkr/status")
    assert r.status_code == 200
    assert r.json()["connected"] is False


# ---------------------------------------------------------------------------
# Strategies (read-only — seeded)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_strategies(client: AsyncClient) -> None:
    r = await client.get(f"{BASE}/strategies")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 6
    codes = {s["code"] for s in data}
    assert "vwap_reclaim" in codes
    assert "gap_and_go" in codes


@pytest.mark.asyncio
async def test_get_strategy_by_code(client: AsyncClient) -> None:
    r = await client.get(f"{BASE}/strategies/vwap_reclaim")
    assert r.status_code == 200
    d = r.json()
    assert d["code"] == "vwap_reclaim"
    assert "properties" in d["params_schema"]


@pytest.mark.asyncio
async def test_get_strategy_not_found(client: AsyncClient) -> None:
    r = await client.get(f"{BASE}/strategies/nonexistent")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Symbols
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_symbols(client: AsyncClient) -> None:
    r = await client.get(f"{BASE}/symbols")
    assert r.status_code == 200
    assert len(r.json()) == 5


@pytest.mark.asyncio
async def test_create_and_delete_symbol(client: AsyncClient) -> None:
    # Create
    r = await client.post(f"{BASE}/symbols", json={
        "ticker": "NVDA",
        "exchange": "NASDAQ",
        "contract_meta": {"currency": "USD", "primary_exchange": "NASDAQ", "secType": "STK"},
    })
    assert r.status_code == 201
    sym_id = r.json()["id"]

    # Duplicate rejected with 409
    r2 = await client.post(f"{BASE}/symbols", json={
        "ticker": "NVDA",
        "exchange": "NASDAQ",
        "contract_meta": {},
    })
    assert r2.status_code == 409

    # Delete
    r3 = await client.delete(f"{BASE}/symbols/{sym_id}")
    assert r3.status_code == 204


# ---------------------------------------------------------------------------
# Portfolios
# ---------------------------------------------------------------------------

@pytest.fixture
async def portfolio(client: AsyncClient):
    r = await client.post(f"{BASE}/portfolios", json={
        "name": "Test Portfolio",
        "mode": "paper",
        "budget_total": 50000,
    })
    assert r.status_code == 201
    pf = r.json()
    yield pf
    await client.delete(f"{BASE}/portfolios/{pf['id']}")


@pytest.mark.asyncio
async def test_create_portfolio(client: AsyncClient, portfolio: dict) -> None:
    assert portfolio["mode"] == "paper"
    assert Decimal(portfolio["budget_total"]) == Decimal("50000")
    assert Decimal(portfolio["cash_available"]) == Decimal("50000")
    assert Decimal(portfolio["cash_reserved"]) == Decimal("0")


@pytest.mark.asyncio
async def test_patch_portfolio(client: AsyncClient, portfolio: dict) -> None:
    r = await client.patch(f"{BASE}/portfolios/{portfolio['id']}", json={
        "name": "Renamed",
        "status": "paused",
    })
    assert r.status_code == 200
    assert r.json()["name"] == "Renamed"
    assert r.json()["status"] == "paused"


@pytest.mark.asyncio
async def test_portfolio_not_found(client: AsyncClient) -> None:
    r = await client.get(f"{BASE}/portfolios/99999")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_assignment(client: AsyncClient, portfolio: dict) -> None:
    r = await client.post(f"{BASE}/assignments", json={
        "portfolio_id": portfolio["id"],
        "symbol_id": 1,
        "strategy_code": "vwap_reclaim",
        "allocation": 10000,
    })
    assert r.status_code == 201
    d = r.json()
    assert d["strategy_code"] == "vwap_reclaim"
    assert d["enabled"] is True
    # Nested objects present
    assert "symbol" in d
    assert "strategy" in d
    assert d["symbol"]["ticker"] == "AAPL"

    # Delete assignment
    r2 = await client.delete(f"{BASE}/assignments/{d['id']}")
    assert r2.status_code == 204


@pytest.mark.asyncio
async def test_duplicate_assignment_rejected(client: AsyncClient, portfolio: dict) -> None:
    r1 = await client.post(f"{BASE}/assignments", json={
        "portfolio_id": portfolio["id"],
        "symbol_id": 2,
        "strategy_code": "gap_and_go",
        "allocation": 5000,
    })
    assert r1.status_code == 201

    r2 = await client.post(f"{BASE}/assignments", json={
        "portfolio_id": portfolio["id"],
        "symbol_id": 2,
        "strategy_code": "bull_flag",
        "allocation": 5000,
    })
    assert r2.status_code == 409

    # Cleanup
    await client.delete(f"{BASE}/assignments/{r1.json()['id']}")


@pytest.mark.asyncio
async def test_allocation_exceeds_cash_rejected(client: AsyncClient, portfolio: dict) -> None:
    r = await client.post(f"{BASE}/assignments", json={
        "portfolio_id": portfolio["id"],
        "symbol_id": 3,
        "strategy_code": "mean_reversion",
        "allocation": 999999,  # Way over budget
    })
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_and_cancel_order(client: AsyncClient, portfolio: dict) -> None:
    # Submit
    r = await client.post(f"{BASE}/orders", json={
        "portfolio_id": portfolio["id"],
        "symbol_id": 1,
        "strategy_code": "vwap_reclaim",
        "side": "BUY",
        "qty": 5,
        "order_type": "MKT",
    })
    assert r.status_code == 201
    order = r.json()
    assert order["status"] == "pending"
    assert order["order_ref"] == f"pf:{portfolio['id']}:vwap_reclaim:paper"
    assert order["fills"] == []

    # Cancel
    r2 = await client.patch(f"{BASE}/orders/{order['id']}/cancel")
    assert r2.status_code == 200
    assert r2.json()["status"] == "cancelled"

    # Cannot cancel again
    r3 = await client.patch(f"{BASE}/orders/{order['id']}/cancel")
    assert r3.status_code == 422


@pytest.mark.asyncio
async def test_lmt_order_requires_limit_price(client: AsyncClient, portfolio: dict) -> None:
    r = await client.post(f"{BASE}/orders", json={
        "portfolio_id": portfolio["id"],
        "symbol_id": 1,
        "strategy_code": "gap_and_go",
        "side": "BUY",
        "qty": 5,
        "order_type": "LMT",
        # limit_price intentionally omitted
    })
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Positions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_positions_empty(client: AsyncClient, portfolio: dict) -> None:
    r = await client.get(f"{BASE}/portfolios/{portfolio['id']}/positions")
    assert r.status_code == 200
    assert r.json() == []
