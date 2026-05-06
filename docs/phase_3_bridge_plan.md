# Phase 3: IBKR Bridge Implementation

This plan covers the implementation of the long-lived IBKR Bridge process using `ib_insync` and Redis pub/sub. The bridge will handle order submission, enforce invariant tagging (`orderRef`), and stream back fill events to the API/workers.

## Decisions
1. **Gateway**: We will default to the **paper gateway (7497)** only for safety during this phase, and add the live gateway configuration later.
2. **Event Schemas**: We will strictly enforce `Pydantic` schemas for all Redis Pub/Sub events for validation and safety.

## Proposed Changes

### Configuration & Infrastructure

#### `docker-compose.yml`
- Uncomment the `tws-gateway-paper` service using the official IB Gateway installer.
- Add the `ibkr-bridge` service which runs `python -m app.bridge.bridge`.

#### `backend/app/config.py`
- Add `IBKR_PAPER_HOST` and `IBKR_PAPER_PORT` config variables.
- Add `IBKR_LIVE_HOST` and `IBKR_LIVE_PORT`.

---

### Bridge Service

#### `backend/app/bridge/events.py`
Define the Redis Pub/Sub channels and `Pydantic` schemas for cross-process communication:
- `OrderRequestEvent` (API -> Bridge)
- `FillEvent` (Bridge -> Workers)
- `OrderStatusEvent` (Bridge -> API/Workers)
- `ConnectionStatusEvent` (Bridge -> API)

#### `backend/app/bridge/connection.py`
`IBKRConnection` class wrapping `ib_insync.IB`:
- Connects asynchronously with auto-backoff reconnection.
- Wraps `placeOrder`, `cancelOrder`, and exposes `accountSummary`.
- Uses `ib.fillEvent` to push executions to Redis.

#### `backend/app/bridge/bridge.py`
The main bridge loop:
- Connects to Redis and subscribes to the `orders:request` channel.
- Connects to IBKR Gateway.
- Pre-trade checks: validates account buying power.
- Enforces `orderRef` format (`pf:{portfolio_id}:{strategy_code}:{mode}`).
- Translates `OrderRequestEvent` into `ib_insync.Order` objects.

---

### API Layer

#### `backend/app/api/ops.py`
- Update `GET /ops/ibkr/status` to read the actual connection state from Redis (published by `ConnectionStatusEvent`).
- Update `POST /ops/kill-switch` to publish an emergency cancel-all event to the bridge.

## Verification Plan

### Automated Tests
- Unit tests for `IBKRConnection` mocking `ib_insync.IB`.
- Unit tests for the bridge's `orderRef` validation and Redis event parsing.

### Manual Verification
1. Start the Docker stack (`docker compose up`).
2. Verify `tws-gateway-paper` and `ibkr-bridge` boot correctly.
3. Check `GET /api/v1/ops/ibkr/status` to confirm connection.
4. Push a dummy `OrderRequestEvent` to Redis manually and verify that the bridge attempts to submit it to the Gateway.
