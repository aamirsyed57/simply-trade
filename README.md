# AutoTrader

**Self-hosted IBKR-backed trading platform — multiple virtual portfolios, paper/live/backtest modes.**

> ⚠️ **Status: Under active development.** Phases 0 and 1 (scaffolding + database schema) are complete. The API, execution engine, and frontend are still being built. See [Build Progress](#build-progress) below.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Running the Stack](#running-the-stack)
- [Database](#database)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)
- [Build Progress](#build-progress)
- [Design Documentation](#design-documentation)

---

## Overview

AutoTrader lets you run **multiple virtual portfolios** on a single IBKR account. Each portfolio has its own:

- Budget and cash accounting (`budget_total`, `cash_reserved`, `cash_deployed`)
- Watchlist of symbols
- Per-symbol strategy assignments with custom parameters

Supported execution modes (once fully built):

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
| Docker Desktop | ≥ 4.x | Required for all services |
| Docker Compose | ≥ 2.x | Bundled with Docker Desktop |
| Node.js | ≥ 22.x | Only needed for local frontend dev outside Docker |
| Python | ≥ 3.12 | Only needed for local backend dev outside Docker |

> Everything runs inside Docker — you don't need Python or Node installed locally to get started.

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/youruser/simply-trade.git
cd simply-trade

# 2. Copy environment template
cp .env.example .env
# Edit .env if you need to change any defaults (see Environment Variables below)

# 3. Start core services (API + Postgres + Redis)
docker compose up -d postgres redis api

# 4. Run database migrations
docker compose exec api alembic upgrade head

# 5. Seed demo data (6 strategies, 5 symbols, 1 paper portfolio)
docker compose exec api python -m app.seed

# 6. Verify the API is running
curl http://localhost:8000/health
# → {"status": "ok"}

# 7. Open Swagger UI
open http://localhost:8000/docs
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values you need:

```env
# Database (internal Docker networking — no changes needed for local dev)
DATABASE_URL=postgresql+asyncpg://autotrader:autotrader@postgres:5432/autotrader
POSTGRES_USER=autotrader
POSTGRES_PASSWORD=autotrader
POSTGRES_DB=autotrader

# Redis
REDIS_URL=redis://redis:6379/0

# IBKR connectivity (Phase 3 — not needed yet)
LIVE_TRADING_ENABLED=false        # Keep false until Phase 9
TWS_PAPER_HOST=tws-gateway-paper
TWS_PAPER_PORT=7497
TWS_LIVE_HOST=tws-gateway-live
TWS_LIVE_PORT=7496

# Telegram notifications (Phase 7.5 — leave blank for now)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

> **`LIVE_TRADING_ENABLED`** — This must remain `false` until you have intentionally configured a live IBKR account, completed paper trading validation, and are ready for Phase 9. Setting it to `true` allows real money orders.

---

## Running the Stack

### Core services only (current — Phases 0–1)

```bash
docker compose up -d postgres redis api
```

| Service | URL | Notes |
|---|---|---|
| API + Swagger | http://localhost:8000/docs | FastAPI auto-generated docs |
| ReDoc | http://localhost:8000/redoc | Alternative API docs |
| Health check | http://localhost:8000/health | Returns `{"status": "ok"}` |
| PostgreSQL | localhost:5433 | Exposed on 5433 (5432 may be used by local Postgres) |
| Redis | localhost:6379 | |

### With Celery workers (Phase 5+)

```bash
docker compose --profile worker up -d
```

### With IBKR bridge (Phase 3+)

```bash
docker compose --profile bridge up -d
```

### With frontend (Phase 6+)

```bash
docker compose --profile frontend up -d
# Frontend: http://localhost:5173
```

### View logs

```bash
# All services
docker compose logs -f

# Single service
docker compose logs -f api
docker compose logs -f postgres
```

### Stop everything

```bash
docker compose down

# Stop and wipe volumes (⚠️ destroys database data)
docker compose down -v
```

---

## Database

### Migrations

Migrations are managed with **Alembic**. All commands run inside the `api` container:

```bash
# Apply all pending migrations
docker compose exec api alembic upgrade head

# Check current migration status
docker compose exec api alembic current

# Generate a new migration after changing models
docker compose exec api alembic revision --autogenerate -m "describe your change"

# Rollback one migration
docker compose exec api alembic downgrade -1
```

### Seed data

The seed script is idempotent — safe to run multiple times:

```bash
docker compose exec api python -m app.seed
```

It creates:
- **6 strategies** registered with full JSON parameter schemas
- **5 demo symbols**: AAPL, MSFT, TSLA, GOOGL, AMZN
- **1 demo portfolio**: "Demo Paper Portfolio" ($100,000 budget, paper mode)

### Connect directly with psql

```bash
docker compose exec postgres psql -U autotrader -d autotrader
```

Or from your host (port 5433):

```bash
psql -h localhost -p 5433 -U autotrader -d autotrader
```

---

## Running Tests

```bash
# Run all tests
docker compose exec api python -m pytest -v

# Run a specific test file
docker compose exec api python -m pytest tests/test_models.py -v

# With coverage
docker compose exec api python -m pytest --cov=app tests/
```

---

## Project Structure

```
simply-trade/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + router registration
│   │   ├── config.py            # Pydantic Settings (env vars)
│   │   ├── database.py          # Async SQLAlchemy engine + session
│   │   ├── seed.py              # Demo data seeder
│   │   ├── models/              # SQLAlchemy 2.0 async models
│   │   │   ├── portfolio.py     # Portfolio + cash accounting
│   │   │   ├── symbol.py        # Tradeable instruments
│   │   │   ├── strategy.py      # Strategy registry
│   │   │   ├── assignment.py    # PortfolioSymbolStrategy linking table
│   │   │   ├── order.py         # Orders (MKT/LMT only in v1)
│   │   │   ├── fill.py          # Execution reports from IBKR
│   │   │   ├── position.py      # VirtualPosition per (portfolio, symbol)
│   │   │   ├── signal.py        # Strategy signal audit log
│   │   │   ├── backtest.py      # Backtest jobs + results
│   │   │   └── historical_bar.py # Cached OHLCV bars
│   │   ├── api/                 # FastAPI routers (Phase 2+)
│   │   ├── schemas/             # Pydantic request/response models (Phase 2+)
│   │   ├── services/            # Business logic (Phase 2+)
│   │   ├── strategies/          # Strategy framework + 6 strategies (Phase 4+)
│   │   ├── bridge/              # IBKR bridge service (Phase 3+)
│   │   ├── workers/             # Celery tasks (Phase 5+)
│   │   └── backtest/            # Backtest engine (Phase 5.5+)
│   ├── migrations/              # Alembic migrations
│   ├── tests/                   # pytest test suite
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── requirements.txt
├── frontend/                    # Vite + React + TypeScript (Phase 6+)
├── docs/
│   ├── autotrader_platform_design.md   # Full system design doc
│   └── implementation_plan.md          # Phased build plan
├── docker-compose.yml
├── .env.example
└── CLAUDE.md                    # AI assistant context
```

---

## Build Progress

| Phase | Description | Status |
|---|---|---|
| 0 | Repo scaffolding, Docker Compose, tooling | ✅ Complete |
| 1 | SQLAlchemy models, Alembic migrations, seed data | ✅ Complete |
| 2 | Core CRUD REST API + Swagger | 🔲 Next |
| 3 | IBKR bridge (`ib_insync`, `orderRef` tagging, Redis pub/sub) | 🔲 Planned |
| 3.5 | Historical data layer (`MarketDataService`, IBKR caching) | 🔲 Planned |
| 4 | Strategy framework + 6 fully-implemented strategies | 🔲 Planned |
| 4.5 | `ExecutionContext` abstraction (live/paper/backtest routers) | 🔲 Planned |
| 5 | Live execution engine (Celery Beat, OrderManager, fill handler) | 🔲 Planned |
| 5.5 | Backtest engine (SimulatedRouter, fill models, metrics) | 🔲 Planned |
| 6 | Frontend config UI (portfolios, symbols, assignments) | 🔲 Planned |
| 7 | Dashboard + backtest UI | 🔲 Planned |
| 7.5 | Telegram notifications | 🔲 Planned |
| 8 | Hardening (kill switch, Prometheus, EOD reconciliation) | 🔲 Planned |
| 9 | Live trading enablement | 🔲 Planned |

---

## Design Documentation

- **[System Design](docs/autotrader_platform_design.md)** — Full architecture, domain model, API surface, strategy framework, execution modes, risk controls, and operational notes.
- **[Implementation Plan](docs/implementation_plan.md)** — Phased build plan with file-level deliverables, dependencies, and verification steps for each phase.

### Key design decisions

- **Virtual portfolios on a single IBKR account** — Every order is tagged `orderRef = "pf:{portfolio_id}:{strategy_code}:{mode}"`. This is non-negotiable; the bridge refuses orders without it.
- **Cash accounting** — `cash_available = budget_total - cash_reserved - cash_deployed`. Enforced at both the application layer and the database (check constraints).
- **`ExecutionContext`** — The core abstraction allowing the same strategy code to run in live, paper, and backtest modes without modification.
- **v1 scope** — USD-only, MKT/LMT orders only, IBKR-only historical data, Telegram for notifications. Other options are deferred.
