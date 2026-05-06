# Phase 3.5: Historical Data Layer Implementation

This plan covers the implementation of the Historical Data Layer, which is responsible for fetching, caching, and serving historical OHLCV bars from IBKR to the local PostgreSQL database. This is a critical prerequisite for the backtesting engine.

## Decisions
1. **IBKR Connection**: The `MarketDataService` will instantiate its own short-lived `ib_insync` connection (using a different `clientId` than the main bridge) specifically for fetching historical data. This prevents large historical data downloads from blocking the bridge's low-latency event loop.
2. **Celery Infrastructure**: We will bring forward the initial scaffolding of the `celery_app.py` module from Phase 5 to support the asynchronous `data_fetcher.py` task.

## Proposed Changes

### Celery Infrastructure

#### `backend/app/workers/celery_app.py`
- Initialize the Celery application using the `REDIS_URL` from the configuration.
- Configure task routing and basic settings.

#### `backend/app/workers/data_fetcher.py`
- Define the async Celery task `prefetch_historical_data(symbol_id, timeframe, start, end)`.
- Instantiates `MarketDataService` to handle the actual fetching and DB writing.

---

### Core Services

#### `backend/app/services/market_data_service.py`
- `get_bars(symbol_id, timeframe, start, end) -> list[HistoricalBar]`
- Checks the `historical_bars` table for the requested range.
- If data is missing, establishes a temporary connection to IBKR (using a different `clientId` than the bridge).
- Issues `reqHistoricalData` to IBKR.
- Persists the fetched bars into the database using bulk inserts.
- Handles IBKR pacing limits (~60 requests / 10 minutes).

---

### API Layer

#### `backend/app/api/historical.py`
- `GET /historical/coverage/{symbol_id}`: Returns the min/max timestamps of cached bars for a symbol.
- `POST /historical/prefetch`: Accepts a request to prefetch a date range and enqueues the `prefetch_historical_data` Celery task.

#### `backend/app/main.py`
- Register the new `/historical` router.

## Verification Plan

### Automated Tests
- Unit tests mocking the DB and IBKR to ensure the `MarketDataService` only requests the "missing" chunks of data (correct overlap calculation).

### Manual Verification
1. Start the Celery worker container (`docker compose --profile worker up -d worker`).
2. Trigger a `POST /api/v1/historical/prefetch` request via Swagger.
3. Observe the worker logs connecting to IBKR and fetching data.
4. Verify the `GET /api/v1/historical/coverage/{symbol_id}` endpoint reflects the downloaded ranges.
