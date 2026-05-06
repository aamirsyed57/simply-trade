# Phase 5 Walkthrough: Live Execution Engine

## Overview
Phase 5 completes the runtime loop: Celery Beat dispatches strategy ticks, the `OrderManager` handles cash reservation and fills, and the `fill_handler` consumes real-time fill events from the IBKR Bridge.

---

## What was built

### 1. `OrderManager` (`services/order_service.py`)
The core financial accounting module. All portfolio cash mutations are performed inside a single `async with session.begin()` block to prevent partial state.

- **`submit_order(assignment, signal, mode)`**: Validates that the estimated notional fits within `cash_available`, creates an `Order` row with status `SUBMITTED`, and increments `portfolio.cash_reserved`.
- **`handle_fill(order_ref, ibkr_exec_id, qty, price, ...)`**: Finds the open order by `order_ref`, creates a `Fill` record, updates `VirtualPosition` using a FIFO average cost formula, and moves `cash_reserved → cash_deployed`. Realized PnL is calculated on SELL fills.
- **`handle_cancel(order_id)`**: Releases `cash_reserved` and marks the order `CANCELLED`.

### 2. `strategy_runner.py` (Celery task)
- `run_strategy_tick(assignment_id)` — the per-assignment worker task.
- Enforces a market hours guard (`is_market_hours()`) that checks US ET 9:30–16:00 weekdays.
- Loads the assignment, builds an `ExecutionContext`, and calls `strategy.generate_signal()`. If a signal is returned, it submits an order via `OrderManager` and publishes it to the bridge via `IBKRBridgeRouter`.

- `dispatch_all_assignments()` — the Beat task that fans out individual ticks for every enabled assignment every 60 seconds.

### 3. `fill_handler.py` (Celery task)
- Long-running task subscribing to the `orders:fills` Redis channel.
- Deserializes each `FillEvent` and routes it to `OrderManager.handle_fill()` inside an atomic DB transaction.

### 4. Account Summary API (`api/account.py`)
- New `GET /api/v1/account/summary` endpoint aggregating total budget, available/reserved/deployed cash, realized/unrealized PnL, and open position count across all portfolios.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Market hours in the task, not the scheduler | Beat runs every 60s unconditionally; the task itself skips outside market hours. This makes the guard explicit and testable. |
| `dispatch_all_assignments` fan-out | Avoids hardcoding assignment IDs in `beat_schedule`; dynamically queries enabled assignments each tick. |
| Cash reservation at submission | Prevents double-spending between the order being placed and the fill arriving. |
| `order_ref` lookup for fills | Deterministic format `pf:{portfolio_id}:{strategy_code}:{mode}` enables fill routing without a DB lookup on the bridge side. |

---

## Verification
- All 17 integration tests pass after changes.
- Syntax of all new worker/service/API files validated via `py_compile`.
