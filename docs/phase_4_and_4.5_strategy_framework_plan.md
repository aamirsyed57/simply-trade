# Phase 4 & 4.5: Strategy Framework & Execution Context

This plan covers the implementation of the core Strategy Framework (Phase 4) alongside the `ExecutionContext` abstraction (Phase 4.5). These phases are highly interdependent, as the `BaseStrategy` relies on the `ExecutionContext` and `Signal` models to operate.

## Decisions
1. **Combined Implementation**: We will build the abstractions (Phase 4.5) and the 6 strategies (Phase 4) concurrently because `BaseStrategy` requires `ExecutionContext` and `Signal` as type hints, and the strategy logic depends on querying the `ExecutionContext` for data.

## Proposed Changes

### Execution Abstractions (Phase 4.5)

#### `backend/app/strategies/clocks.py`
- `WallClock` (returns real UTC time) and `SimulatedClock` (returns a settable simulated time for backtesting).

#### `backend/app/strategies/data_sources.py`
- `MarketDataSource` ABC with implementations for `LiveDataSource` (queries bridge/Redis) and `ReplayDataSource` (queries Postgres `historical_bars`).

#### `backend/app/strategies/routers.py`
- `OrderRouter` ABC with `place_order()` and `cancel_order()`.
- `IBKRLiveRouter` and `IBKRPaperRouter` (publish to Redis bridge queues).
- `SimulatedRouter` (in-memory queues for backtesting).

#### `backend/app/strategies/signals.py`
- `Signal` dataclass encapsulating `direction` (BUY/SELL), `symbol_id`, `qty`, `order_type`, and `limit_price`.

#### `backend/app/strategies/context.py`
- `ExecutionContext` dataclass holding instances of the clock, data source, and router, alongside the `portfolio_id` and `mode`.

---

### Strategy Framework (Phase 4)

#### `backend/app/strategies/base.py`
- `BaseStrategy` ABC with abstract `generate_signal(self, ctx: ExecutionContext) -> Signal | None`.
- Provides a `@register_strategy` decorator and central registry dictionary.

#### Six Strategy Implementations
Each strategy will define a strict `Pydantic` params schema and a `generate_signal` method.
- `gap_and_go.py`: Gap detection at market open.
- `bull_flag.py`: Consolidation breakout logic.
- `vwap_reclaim.py`: Pullback to VWAP with momentum reclaim.
- `sentiment_momentum.py`: Placeholder for news-driven entry (logs signal based on dummy sentiment).
- `mean_reversion.py`: Z-score mean reversion on moving average.
- `opening_range.py`: First 15-minute range breakout.

---

### Integration

#### `backend/app/api/strategies.py`
- Update the `GET /api/v1/strategies` endpoint to pull from the live Python registry instead of the database, ensuring the JSON schemas are always perfectly synchronized with the codebase.

#### `backend/app/seed.py`
- Update the seed script to read from the strategy registry and populate the database `strategies` table with the latest schemas.

## Verification Plan

### Automated Tests
- Unit tests for the `ExecutionContext` ensuring it correctly abstracts the clock and router.
- Unit tests for the `BaseStrategy` registry.
- Syntactical validation of all 6 strategy algorithms.

### Manual Verification
1. Run the database seed script `python -m app.seed` to populate the DB with the new strategy schemas.
2. Call `GET /api/v1/strategies` via Swagger and verify all 6 strategies are returned with rich JSON Schema representations of their parameters.
