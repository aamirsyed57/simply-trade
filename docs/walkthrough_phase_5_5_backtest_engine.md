# Phase 5.5 Walkthrough: Backtest Engine

## Overview
Implemented the offline backtesting engine capable of replaying any registered strategy against cached historical bars. Results are persisted in PostgreSQL and exposed via a REST API with per-symbol breakdowns, equity curves, drawdown curves, and a trade log.

---

## Architecture

### Bar Replay Loop (`backtest/engine.py`)
The `BacktestEngine` follows a two-pass approach per timestamp:

1. **Fill pending orders**: At each new bar, pending signals from the *previous* bar are matched at the current bar's open price (default `NEXT_BAR_OPEN` fill model). This prevents look-ahead bias.
2. **Generate signals**: After fills, the strategy's `generate_signal()` is called for each symbol. New signals are queued for the *next* bar.

### Fill Models
| Model | Behaviour |
|---|---|
| `next_bar_open` | Fill at open of the bar after signal (default, no look-ahead bias) |
| `bar_close` | Fill at close of signal bar |
| `midpoint` | Fill at `(high + low) / 2` of signal bar |

### Slippage & Commission
- Slippage: configurable `slippage_bps` (default 5 bps) applied as a percentage of notional.
- Commission: IBKR tiered approximation — `$0.005/share`, minimum `$1.00/trade`.

### Metrics (`backtest/metrics.py`)
Pure Python implementation (no pandas dependency for portability):
- **Risk-adjusted**: Sharpe, Sortino, Calmar
- **Return**: CAGR, total PnL, final equity
- **Risk**: Max drawdown (peak-to-trough)
- **Trades**: Win rate, profit factor, expectancy, total trade count

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/backtests` | Create + enqueue (202 Accepted) |
| `GET` | `/api/v1/backtests` | List all backtests |
| `GET` | `/api/v1/backtests/{id}` | Get status & config |
| `GET` | `/api/v1/backtests/{id}/result` | Full metrics (only if COMPLETED) |
| `GET` | `/api/v1/backtests/{id}/equity` | Equity + drawdown curve arrays |
| `GET` | `/api/v1/backtests/{id}/trades` | Trade log array |
| `DELETE` | `/api/v1/backtests/{id}` | Delete |

---

## Verification
- All 17 integration tests pass.
- Pydantic v2 `ConfigDict` updated on schema classes.

> [!NOTE]
> To run a backtest, first prefetch historical data via `POST /api/v1/historical/prefetch`, then create a backtest referencing the same symbol_ids, timeframe, and date range.
