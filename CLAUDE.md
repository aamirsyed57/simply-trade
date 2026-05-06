# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoTrader is a self-hosted IBKR-backed trading platform with **virtual multi-portfolio support on a single IBKR account**. It is not yet built — the canonical design lives in [docs/autotrader_platform_design.md](docs/autotrader_platform_design.md). Use that document as the source of truth for all architectural decisions.

## Planned Tech Stack

- **Backend**: FastAPI (async), SQLAlchemy 2.0 async, Alembic, Pydantic v2
- **Workers**: Celery + Celery Beat, Redis (broker + pub/sub)
- **IBKR connectivity**: `ib_insync` via a dedicated `ibkr-bridge` service (TWS Gateway paper port 7497, live port 7496)
- **Database**: PostgreSQL; TimescaleDB extension optional for high-volume bar data
- **Frontend**: Vite + React + TypeScript, TanStack Query, shadcn/ui or Mantine, TradingView Lightweight Charts
- **API client**: auto-generated from OpenAPI (`openapi-typescript-codegen`), committed to the repo
- **Tooling**: ruff (lint/format), mypy, pre-commit, Docker Compose, Prometheus + Grafana

## Architecture

```
[ React Frontend ] ── REST/WS ──> [ FastAPI API ] ──> [ PostgreSQL ]
                                       │                    ▲
                                       ▼                    │
                                   [ Redis ] <──> [ Celery workers + Beat ]
                                                            │
                                                            ▼
                                          [ ibkr-bridge ] ──> [ TWS Gateway ]
                                                                  │
                                                              SINGLE IBKR account
```

The `ibkr-bridge` is a long-lived process that holds **both** TWS connections and exposes internal RPC + Redis pub/sub. Celery workers never open their own TWS clients. Backtests bypass the bridge entirely and run inside workers using a `SimulatedRouter`.

## Key Design Decisions

### Virtual Portfolios

All portfolios share one IBKR account. Isolation is purely software-enforced:

- **Order attribution**: every IBKR order carries `orderRef = "pf:{portfolio_id}:{strategy_code}:{mode}"`. This is non-negotiable — the bridge refuses orders without it.
- **Position accounting**: `VirtualPosition` rows per `(portfolio_id, symbol_id)` sum to the real broker position. Strategies see only their own portfolio's positions.
- **Cash accounting**: three columns on `Portfolio` — `budget_total`, `cash_reserved`, `cash_deployed`. `cash_available = budget_total - cash_reserved - cash_deployed` must stay ≥ 0.
- **Account-level pre-trade check** (in the bridge): `SUM(cash_reserved + cash_deployed) + new_order_notional <= IBKR_buying_power × safety_factor`. This is the guardrail against per-portfolio accounting bugs draining the real account.

### ExecutionContext — the most important abstraction

Strategies only call `ctx.clock.now()`, `ctx.data.get_bars(...)`, `ctx.router.place_order(...)`. Three execution modes inject different implementations:

| Mode | Clock | Data | Router |
|---|---|---|---|
| live | `WallClock` | IBKR streaming | `IBKRLiveRouter` (7496) |
| paper | `WallClock` | IBKR streaming | `IBKRPaperRouter` (7497) |
| backtest | `SimulatedClock` | `ReplayDataSource` | `SimulatedRouter` |

The same strategy code runs in all three modes — never break this invariant.

### Strategy Framework

Strategies extend `BaseStrategy`, define a Pydantic `ParamsModel`, and implement `generate_signal(ctx)`. A `@register_strategy` decorator adds them to the registry. The frontend renders parameter forms automatically from each strategy's `params_schema` (JSON Schema). Adding a new strategy requires no API or UI changes.

Six planned strategies: Gap and Go, Bull Flag Breakout, VWAP Reclaim, Sentiment Momentum, Mean Reversion, Opening Range Breakout.

### Mode Safety

- New portfolios default to **paper** mode.
- Flipping to **live** requires a typed confirmation in the UI and the `LIVE_TRADING_ENABLED` env flag.
- A global kill-switch (`POST /ops/kill-switch`) cancels all open orders and halts all assignments — treat it as load-bearing.

## Build Phases

The design defines 10 phases (0–9). Each phase produces something runnable:

| Phase | Focus |
|---|---|
| 0 | Repo + Docker scaffolding, tooling (ruff, mypy, eslint, pre-commit) |
| 1 | SQLAlchemy models + Alembic migrations + seed script |
| 2 | Core CRUD API + Swagger (portfolios, symbols, strategies, assignments) |
| 3 | IBKR bridge (order placement with `orderRef`, market data, Redis pub/sub) |
| 3.5 | Historical data layer (`MarketDataService`, caching, IBKR fetcher) |
| 4 | Strategy framework + 6 strategies stubbed |
| 4.5 | `ExecutionContext` abstraction — live/paper/simulated routers |
| 5 | Live execution engine (Celery Beat, OrderManager, fill handler, VirtualPosition updates) |
| 5.5 | Backtest engine (SimulatedRouter, fill models, metrics) |
| 6–7 | Frontend (config UI, dashboard, backtest UI) |
| 8–9 | Hardening, kill switch, metrics, EOD reconciliation, live-trading enablement |

## Domain Invariants to Enforce

1. `cash_reserved >= 0`, `cash_deployed >= 0`, `cash_available >= 0` per portfolio.
2. `SUM(VirtualPosition.qty over all portfolios for symbol X) == IBKR_position(X)` — checked by EOD reconciliation job.
3. Every `Order` and `Fill` has a non-null `portfolio_id`.
4. Every live/paper order submitted to IBKR has a valid `orderRef`.

## Operational Notes

- All timestamps stored UTC; display layer renders in Europe/Berlin.
- The `Sentiment Momentum` strategy requires historical timestamped news for honest backtesting — mark it paper-only until that data source is solved.
- Backtest fill model default is `next_bar_open` to avoid look-ahead bias.
- Manual trades in TWS outside the platform will appear as orphan fills in reconciliation — by policy the live account should be platform-only.
- Symbol overlap across portfolios is allowed but logged loudly; opposing-direction orders from different portfolios on the same symbol are blocked by default.
