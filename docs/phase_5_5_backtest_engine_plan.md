# Phase 5.5: Backtest Engine

## Overview
Build the offline backtesting engine that replays `HistoricalBar` rows through any registered strategy using `SimulatedClock`, `ReplayDataSource`, and `SimulatedRouter`. Results are persisted as `BacktestResult` and exposed via a REST API.

## Decisions
1. **Fill model**: Default is `next_bar_open` (fills on the next bar's open price) to prevent look-ahead bias. `bar_close` and `midpoint` are also supported.
2. **Commission model**: IBKR tiered approximation — $0.005/share, minimum $1.00.
3. **No separate `backtest/simulated_router.py`**: The `SimulatedRouter` already lives in `strategies/routers.py` (Phase 4.5). The backtest engine will import it from there.
4. **Celery task**: `run_backtest(backtest_id)` is a Celery task but can also be awaited directly for testing.

## Proposed Changes

### Backtest Package

#### [NEW] `backend/app/backtest/__init__.py`
- Empty package init.

#### [NEW] `backend/app/backtest/metrics.py`
- Compute Sharpe, Sortino, Calmar, CAGR, max drawdown, win rate, profit factor, expectancy, avg holding period, exposure %.
- Input: equity curve and trade log as lists of dicts.

#### [NEW] `backend/app/backtest/engine.py`
- `BacktestEngine.run(backtest_id)` async method.
- Loads `Backtest` config from DB.
- Ensures historical data coverage (raises if bars missing).
- Iterates bars using `SimulatedClock.advance_to()` + `ReplayDataSource`.
- Calls `strategy.generate_signal()` per bar.
- Routes signals to `SimulatedRouter.match_pending_orders()`.
- Records equity snapshots after each bar.
- Persists `BacktestResult` on completion.

### Celery Task

#### [MODIFY] `backend/app/workers/celery_app.py`
- Include `app.workers.backtest_runner`.

#### [NEW] `backend/app/workers/backtest_runner.py`
- `run_backtest(backtest_id)` Celery task wrapping `BacktestEngine.run()`.
- Updates `Backtest.status` to `RUNNING → COMPLETED / FAILED`.

### API

#### [NEW] `backend/app/api/backtests.py`
- `POST /backtests` — create + enqueue.
- `GET /backtests`, `GET /backtests/{id}`.
- `GET /backtests/{id}/equity`, `GET /backtests/{id}/trades`.
- `DELETE /backtests/{id}`.

#### [MODIFY] `backend/app/main.py`
- Register `/backtests` router.

## Verification Plan
- Syntax check all new files.
- Run full test suite (no regressions).
- Manual: `POST /backtests` → check status transitions in DB.
