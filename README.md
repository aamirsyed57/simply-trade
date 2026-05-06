# AutoTrader

**Self-hosted IBKR-backed trading platform — multiple virtual portfolios, paper/live/backtest modes.**

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [First-Time Setup](#first-time-setup)
- [Running the Full Stack](#running-the-full-stack)
- [Frontend Development](#frontend-development)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Running Tests](#running-tests)
- [Common Commands](#common-commands)
- [Project Structure](#project-structure)
- [Build Progress](#build-progress)
- [Design Documentation](#design-documentation)

---

## Overview

AutoTrader lets you run **multiple virtual portfolios** on a single IBKR account. Each portfolio has its own:

- Budget and cash accounting (`budget_total`, `cash_reserved`, `cash_deployed`)
- Watchlist of symbols
- Per-symbol strategy assignments with custom parameters

Supported execution modes:

| Mode | Description |
|---|---|
| **Paper** | Real-time IBKR data, simulated fills on paper account |
| **Live** | Real orders on your live IBKR account (guarded, off by default) |
| **Backtest** | Historical bar replay with simulated fills and full metrics |

Six built-in strategies: Gap and Go, Bull Flag Breakout, VWAP Reclaim, Sentiment Momentum, Mean Reversion, Opening Range Breakout.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Docker Desktop | ≥ 4.x | Required — all services run inside Docker |
| Docker Compose | ≥ 2.x | Bundled with Docker Desktop |
| Node.js | ≥ 22.x | Only for local frontend dev (`npm run dev`) outside Docker |
| Git | any | For cloning |

> You do **not** need Python installed locally — everything runs inside Docker.

---

## First-Time Setup

Run these commands **once** after cloning the repo:

```bash
# 1. Clone
git clone https://github.com/aamirsyed57/simply-trade.git
cd simply-trade

# 2. Create your .env file (defaults work for local dev)
cp .env.example .env

# 3. Build & start core services
docker compose up -d --build postgres redis api

# 4. Wait for the API to be healthy (~15 s), then run migrations
docker compose exec api alembic upgrade head

# 5. Seed demo data (strategies, symbols, demo portfolio)
docker compose exec api python -m app.seed

# 6. Verify everything is up
curl http://localhost:8000/health
# → {"status":"ok"}
```

Open **[http://localhost:8000/docs](http://localhost:8000/docs)** to explore the Swagger UI.

---

## Running the Full Stack

### Minimum — API only (no workers, no frontend)

```bash
docker compose up -d postgres redis api
```

| URL | Service |
|---|---|
| http://localhost:8000/docs | Swagger / API explorer |
| http://localhost:8000/health | Health check |
| http://localhost:8000/redoc | ReDoc API docs |
| localhost:5433 | PostgreSQL (user: autotrader, db: autotrader) |
| localhost:6379 | Redis |

---

### With Celery workers (strategy execution + backtests)

Celery Worker handles `run_strategy_tick` and `run_backtest` tasks.
Celery Beat dispatches strategy ticks every 60 s during market hours.

```bash
docker compose --profile worker up -d
```

This starts the `worker` and `beat` containers in addition to the core services.

Check worker logs:
```bash
docker compose logs -f worker
docker compose logs -f beat
```

---

### With IBKR Bridge (live/paper order routing)

The bridge holds the long-lived `ib_insync` connection to TWS/IB Gateway and routes orders via Redis.

```bash
docker compose --profile bridge up -d
```

> **Note:** You need IB Gateway or TWS running on your host (or in a separate container) and configured in `.env`.

---

### Full stack — API + Workers + Frontend

```bash
# Start backend services and workers
docker compose --profile worker up -d

# Start the frontend dev server (in Docker)
docker compose --profile frontend up -d
```

| URL | Service |
|---|---|
| http://localhost:5173 | React frontend (Vite dev server) |
| http://localhost:8000/docs | Backend API docs |

---

### Recommended dev workflow (frontend outside Docker)

Running the frontend locally is faster (instant HMR, no Docker rebuild):

```bash
# Terminal 1 — backend
docker compose --profile worker up -d

# Terminal 2 — frontend (local, proxies /api → localhost:8000)
cd frontend
npm install        # first time only
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)**.

---

## Frontend Development

The frontend is a **Vite + React + TypeScript** app with Tailwind CSS v4.

```bash
cd frontend

# Install dependencies (first time)
npm install

# Start dev server (proxies /api to localhost:8000)
npm run dev

# Type-check + production build
npm run build

# Lint
npm run lint
```

The Vite proxy is configured in `vite.config.ts` — all `/api` requests go to `http://localhost:8000`.

---

## Environment Variables

Copy `.env.example` to `.env`. Defaults work for local development:

```env
# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://autotrader:autotrader@postgres:5432/autotrader
POSTGRES_USER=autotrader
POSTGRES_PASSWORD=autotrader
POSTGRES_DB=autotrader

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ── IBKR Bridge ───────────────────────────────────────────────────────────────
LIVE_TRADING_ENABLED=false      # ⚠️  Keep false — real orders only when Phase 9 is ready
TWS_PAPER_HOST=tws-gateway-paper
TWS_PAPER_PORT=7497
TWS_LIVE_HOST=tws-gateway-live
TWS_LIVE_PORT=7496

# ── Notifications (Phase 7.5) ──────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

> ⚠️ **`LIVE_TRADING_ENABLED=false`** is enforced. Setting it to `true` enables real money orders. Do not change this until Phase 9.

---

## Database

### Migrations

All Alembic commands run inside the `api` container:

```bash
# Apply all pending migrations
docker compose exec api alembic upgrade head

# Check current state
docker compose exec api alembic current

# Generate a new migration after changing models
docker compose exec api alembic revision --autogenerate -m "add my column"

# Rollback one step
docker compose exec api alembic downgrade -1
```

### Seed data

The seed script is **idempotent** — safe to run multiple times. It upserts from the Python strategy registry, so it always stays in sync with the code:

```bash
docker compose exec api python -m app.seed
```

Creates:
- **6 strategies** from the Python registry with full JSON parameter schemas
- **5 demo symbols**: AAPL, MSFT, TSLA, GOOGL, AMZN
- **1 demo portfolio**: "Demo Paper Portfolio" ($100,000 budget, paper mode)

### Direct psql access

```bash
# Inside Docker
docker compose exec postgres psql -U autotrader -d autotrader

# From your host (port 5433)
psql -h localhost -p 5433 -U autotrader -d autotrader
```

---

## Running Tests

```bash
# Run full test suite
docker compose exec api pytest -v

# Run a specific file
docker compose exec api pytest tests/test_api.py -v

# With coverage
docker compose exec api pytest --cov=app tests/

# Filter by name
docker compose exec api pytest -k "strategies" -v
```

---

## Common Commands

```bash
# ── Docker ────────────────────────────────────────────────────────────────────

# Restart just the API (picks up code changes without full rebuild)
docker compose restart api

# View logs (follow)
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f beat

# Stop all containers (keeps volumes)
docker compose down

# Stop + wipe database ⚠️ destructive
docker compose down -v

# Rebuild a single service image
docker compose build api


# ── Strategy registry ────────────────────────────────────────────────────────
# Strategies are auto-discovered from backend/app/strategies/
# To add a new strategy:
#   1. Create backend/app/strategies/my_strategy.py
#   2. Import it in backend/app/strategies/__init__.py
#   3. Re-seed: docker compose exec api python -m app.seed
# The API will immediately reflect it — no DB changes needed.


# ── Backtests ─────────────────────────────────────────────────────────────────
# First prefetch historical data:
curl -X POST http://localhost:8000/api/v1/historical/prefetch \
  -H "Content-Type: application/json" \
  -d '{"symbol_id": 1, "timeframe": "1m", "start": "2024-01-01T00:00:00Z", "end": "2024-03-31T00:00:00Z"}'

# Then create a backtest:
curl -X POST http://localhost:8000/api/v1/backtests \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AAPL Gap and Go Q1 2024",
    "strategy_code": "gap_and_go",
    "symbol_ids": [1],
    "timeframe": "1m",
    "start_date": "2024-01-01",
    "end_date": "2024-03-31",
    "initial_capital": 100000
  }'
```

---

## Project Structure

```
simply-trade/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI app factory + router registration
│   │   ├── config.py              # Pydantic Settings (reads from .env)
│   │   ├── database.py            # Async SQLAlchemy engine + session
│   │   ├── seed.py                # Demo data seeder (registry-driven)
│   │   ├── models/                # SQLAlchemy 2.0 async models
│   │   │   ├── portfolio.py       # Portfolio + cash accounting
│   │   │   ├── symbol.py          # Tradeable instruments
│   │   │   ├── strategy.py        # Strategy metadata (synced from registry)
│   │   │   ├── assignment.py      # PortfolioSymbolStrategy
│   │   │   ├── order.py           # Orders (MKT/LMT only in v1)
│   │   │   ├── fill.py            # Execution reports from IBKR
│   │   │   ├── position.py        # VirtualPosition per (portfolio, symbol)
│   │   │   ├── backtest.py        # Backtest jobs + results
│   │   │   └── historical_bar.py  # Cached OHLCV bars
│   │   ├── api/                   # FastAPI routers
│   │   │   ├── portfolios.py      # CRUD + cash validation
│   │   │   ├── symbols.py
│   │   │   ├── strategies.py      # Registry-driven (no DB queries)
│   │   │   ├── assignments.py
│   │   │   ├── orders.py
│   │   │   ├── positions.py
│   │   │   ├── account.py         # Aggregate stats across all portfolios
│   │   │   ├── historical.py      # Coverage + prefetch
│   │   │   ├── backtests.py       # Create, query, results
│   │   │   └── ops.py             # Health, IBKR status, kill-switch
│   │   ├── schemas/               # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── order_service.py   # OrderManager — pre-trade checks + fill handling
│   │   │   └── market_data_service.py  # IBKR historical data with caching
│   │   ├── strategies/            # Strategy framework
│   │   │   ├── base.py            # BaseStrategy + STRATEGY_REGISTRY decorator
│   │   │   ├── context.py         # ExecutionContext (clock + data + router)
│   │   │   ├── clocks.py          # WallClock / SimulatedClock
│   │   │   ├── data_sources.py    # LiveDataSource / ReplayDataSource
│   │   │   ├── routers.py         # IBKRBridgeRouter / SimulatedRouter
│   │   │   ├── signals.py         # Signal dataclass
│   │   │   ├── gap_and_go.py
│   │   │   ├── bull_flag.py
│   │   │   ├── vwap_reclaim.py
│   │   │   ├── sentiment_momentum.py
│   │   │   ├── mean_reversion.py
│   │   │   └── opening_range.py
│   │   ├── bridge/                # IBKR bridge (Phase 3)
│   │   │   ├── bridge.py          # Main bridge process
│   │   │   ├── connection.py      # ib_insync wrapper
│   │   │   └── events.py          # Redis pub/sub event schemas
│   │   ├── workers/               # Celery tasks
│   │   │   ├── celery_app.py      # App config + Beat schedule
│   │   │   ├── strategy_runner.py # run_strategy_tick + dispatch_all_assignments
│   │   │   ├── fill_handler.py    # Redis fill event consumer
│   │   │   ├── backtest_runner.py # run_backtest task
│   │   │   └── data_fetcher.py    # Historical data prefetch task
│   │   └── backtest/              # Backtest engine
│   │       ├── engine.py          # BacktestEngine — bar replay loop
│   │       └── metrics.py         # Sharpe, Sortino, Calmar, drawdown, etc.
│   ├── migrations/                # Alembic migrations
│   ├── tests/                     # pytest integration tests
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── requirements.txt
├── frontend/                      # Vite + React + TypeScript + Tailwind CSS v4
│   └── src/
│       ├── api/                   # Typed fetch helpers
│       ├── components/            # AppShell, ModeBadge, CashPanel, modals
│       └── pages/                 # PortfoliosPage, PortfolioDetailPage, StrategiesPage
├── docs/                          # Design docs, phase plans, walkthroughs
├── docker-compose.yml
├── .env.example
└── CLAUDE.md                      # AI assistant context
```

---

## Build Progress

| Phase | Description | Status |
|---|---|---|
| 0 | Repo scaffolding, Docker Compose, tooling | ✅ Complete |
| 1 | SQLAlchemy models, Alembic migrations, seed data | ✅ Complete |
| 2 | Core CRUD REST API + Swagger | ✅ Complete |
| 3 | IBKR bridge (`ib_insync`, `orderRef` tagging, Redis pub/sub) | ✅ Complete |
| 3.5 | Historical data layer (`MarketDataService`, IBKR caching) | ✅ Complete |
| 4 | Strategy framework + 6 fully-implemented strategies | ✅ Complete |
| 4.5 | `ExecutionContext` abstraction (live/paper/backtest routers) | ✅ Complete |
| 5 | Live execution engine (Celery Beat, OrderManager, fill handler) | ✅ Complete |
| 5.5 | Backtest engine (SimulatedRouter, fill models, metrics) | ✅ Complete |
| 6 | Frontend config UI (portfolios, symbols, assignments) | ✅ Complete |
| 7 | Dashboard + backtest UI | 🔲 Next |
| 7.5 | Telegram notifications | 🔲 Planned |
| 8 | Hardening (kill switch, Prometheus, EOD reconciliation) | 🔲 Planned |
| 9 | Live trading enablement | 🔲 Planned |

---

## Design Documentation

All docs live in the [`docs/`](docs/) folder:

| File | Contents |
|---|---|
| [`implementation_plan.md`](docs/implementation_plan.md) | Full phased build plan with file-level deliverables |
| [`phase_5_live_execution_plan.md`](docs/phase_5_live_execution_plan.md) | OrderManager, Beat, fill handler design |
| [`phase_5_5_backtest_engine_plan.md`](docs/phase_5_5_backtest_engine_plan.md) | Backtest engine design |
| [`phase_6_frontend_config_plan.md`](docs/phase_6_frontend_config_plan.md) | Frontend architecture |
| [`walkthrough_phase_5_live_execution.md`](docs/walkthrough_phase_5_live_execution.md) | Phase 5 implementation summary |
| [`walkthrough_phase_5_5_backtest_engine.md`](docs/walkthrough_phase_5_5_backtest_engine.md) | Phase 5.5 implementation summary |
| [`walkthrough_phase_6_frontend_config.md`](docs/walkthrough_phase_6_frontend_config.md) | Phase 6 implementation summary |
| [`antigravity_rules.md`](docs/antigravity_rules.md) | AI assistant documentation rules |

### Key design decisions

- **Virtual portfolios on a single IBKR account** — Every order is tagged `orderRef = "pf:{portfolio_id}:{strategy_code}:{mode}"`. The bridge refuses orders without it.
- **Cash accounting** — `cash_available = budget_total - cash_reserved - cash_deployed`. Enforced at both application and database layers (check constraints).
- **Registry-driven strategies** — Adding a new strategy requires only a new file in `backend/app/strategies/`; the API and seed script auto-discover it.
- **`ExecutionContext`** — The core abstraction allowing identical strategy code to run in live, paper, and backtest modes.
- **v1 scope** — USD only, MKT/LMT orders only, IBKR-only historical data. Other options are deferred.
