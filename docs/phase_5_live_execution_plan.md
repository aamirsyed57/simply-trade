# Phase 5: Live Execution Engine

## Overview
Celery Beat schedules strategy runs every minute during market hours. The `OrderManager` handles fills and updates `VirtualPosition` + cash atomically. `fill_handler.py` consumes Redis fill events from the bridge. End goal: a full paper trade cycle without manual intervention.

## Decisions
1. **Market hours guard**: The Beat schedule will check if the current time is within 9:30–16:00 ET on weekdays before firing a strategy run task. This prevents spurious signals outside trading hours.
2. **Cash reservation**: When an order is submitted, `cash_reserved` increases immediately. On fill, it moves to `cash_deployed`. On cancel/reject, it is released back to available.
3. **Fill handler**: A long-running Celery task subscribes to the Redis `bridge:fills` channel and routes each event to `OrderManager.handle_fill()`.

## Proposed Changes

### Worker Tasks

#### [NEW] `backend/app/workers/strategy_runner.py`
- `run_strategy_tick(assignment_id)` — loads the assignment, builds `ExecutionContext` (paper or live), calls `strategy.generate_signal()`, places order via `IBKRBridgeRouter` if a signal is returned.
- Market hours check at the top of the task.

#### [MODIFY] `backend/app/workers/celery_app.py`
- Add Beat schedule: run `run_strategy_tick` for all enabled assignments every 60 seconds.

#### [NEW] `backend/app/workers/fill_handler.py`
- Long-running Celery task that subscribes to `bridge:fills` via Redis.
- Routes fill events to `OrderManager.handle_fill()`.

---

### Order Management

#### [NEW] `backend/app/services/order_service.py`
- `OrderManager` class:
  - `submit_order(assignment, signal)` — validates cash, reserves notional, creates `Order` row, publishes to bridge.
  - `handle_fill(fill_event)` — updates `VirtualPosition`, moves `cash_reserved → cash_deployed`, creates `Fill` row.
  - `handle_cancel(order_id)` — releases `cash_reserved`, marks order as cancelled.
  - All DB mutations within a single `async with session.begin()` block.

---

### API

#### [NEW] `backend/app/api/account.py`
- `GET /api/v1/account/summary` — aggregate equity, day PnL, open positions count across all portfolios.

#### [MODIFY] `backend/app/main.py`
- Register `/account` router.

---

## Verification Plan

### Automated Tests
- Unit test `OrderManager.submit_order()` with insufficient cash → raises.
- Unit test `OrderManager.handle_fill()` → `VirtualPosition` updated correctly, `cash_deployed` incremented.

### Manual Verification
1. Start the full stack: `docker compose up -d api postgres redis`.
2. Assign a strategy to a portfolio with a funded allocation.
3. Trigger `run_strategy_tick` manually via Celery.
4. Observe order created in DB, cash reserved.
5. Simulate a fill event via Redis publish → VirtualPosition updated, cash moved.
