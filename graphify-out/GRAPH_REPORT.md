# Graph Report - /Users/aamirsyed/Projects/botcoding/simply-trade  (2026-05-06)

## Corpus Check
- Corpus is ~20,709 words - fits in a single context window. You may not need a graph.

## Summary
- 223 nodes · 447 edges · 15 communities detected
- Extraction: 52% EXTRACTED · 48% INFERRED · 0% AMBIGUOUS · INFERRED: 213 edges (avg confidence: 0.53)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Models and Base|Models and Base]]
- [[_COMMUNITY_Schemas and Pydantic|Schemas and Pydantic]]
- [[_COMMUNITY_Seed and Tests|Seed and Tests]]
- [[_COMMUNITY_Symbols API and Tests|Symbols API and Tests]]
- [[_COMMUNITY_Orders API and Models|Orders API and Models]]
- [[_COMMUNITY_Portfolio Models|Portfolio Models]]
- [[_COMMUNITY_Portfolio API and Service|Portfolio API and Service]]
- [[_COMMUNITY_Ops and Health Check|Ops and Health Check]]
- [[_COMMUNITY_Alembic Migrations|Alembic Migrations]]
- [[_COMMUNITY_Assignments API|Assignments API]]
- [[_COMMUNITY_App Configuration|App Configuration]]
- [[_COMMUNITY_Initial Schema Migration|Initial Schema Migration]]
- [[_COMMUNITY_Database Setup|Database Setup]]
- [[_COMMUNITY_App Main Entrypoint|App Main Entrypoint]]
- [[_COMMUNITY_Test Conftest|Test Conftest]]

## God Nodes (most connected - your core abstractions)
1. `Base` - 36 edges
2. `APIModel` - 25 edges
3. `TimestampMixin` - 23 edges
4. `Symbol` - 18 edges
5. `Portfolio` - 18 edges
6. `Strategy` - 15 edges
7. `PortfolioMode` - 13 edges
8. `SymbolRead` - 13 edges
9. `SQLAlchemy models — import all so Alembic autogenerate sees them.` - 12 edges
10. `PortfolioStatus` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Alembic environment — configured for SQLAlchemy async + autogenerate.` --uses--> `Base`  [INFERRED]
  /Users/aamirsyed/Projects/botcoding/simply-trade/backend/migrations/env.py → /Users/aamirsyed/Projects/botcoding/simply-trade/backend/app/database.py
- `Run migrations in offline mode (no DB connection required).` --uses--> `Base`  [INFERRED]
  /Users/aamirsyed/Projects/botcoding/simply-trade/backend/migrations/env.py → /Users/aamirsyed/Projects/botcoding/simply-trade/backend/app/database.py
- `Run migrations in online (async) mode.` --uses--> `Base`  [INFERRED]
  /Users/aamirsyed/Projects/botcoding/simply-trade/backend/migrations/env.py → /Users/aamirsyed/Projects/botcoding/simply-trade/backend/app/database.py
- `create_symbol()` --calls--> `Symbol`  [INFERRED]
  /Users/aamirsyed/Projects/botcoding/simply-trade/backend/app/api/symbols.py → /Users/aamirsyed/Projects/botcoding/simply-trade/backend/app/models/symbol.py
- `delete_portfolio()` --calls--> `delete()`  [INFERRED]
  /Users/aamirsyed/Projects/botcoding/simply-trade/backend/app/api/portfolios.py → /Users/aamirsyed/Projects/botcoding/simply-trade/backend/app/services/portfolio_service.py

## Communities

### Community 0 - "Models and Base"
Cohesion: 0.09
Nodes (23): PortfolioSymbolStrategy, Backtest, BacktestResult, BacktestStatus, FillModel, Backtest and BacktestResult models., Base, Base (+15 more)

### Community 1 - "Schemas and Pydantic"
Cohesion: 0.15
Nodes (22): APIModel, AssignmentCreate, AssignmentRead, AssignmentReadDetailed, AssignmentUpdate, Assignment (PortfolioSymbolStrategy) Pydantic schemas., Assignment with nested portfolio, symbol, strategy objects., Assignments router — link symbols + strategies to portfolios. (+14 more)

### Community 2 - "Seed and Tests"
Cohesion: 0.11
Nodes (15): Seed script — populates the DB with one demo portfolio, 5 symbols, and 6 strateg, seed(), Strategies router — read-only (populated via seed/registry)., Strategy, Symbol, portfolio(), db(), Tests for SQLAlchemy models — constraints, relationships, seed data.  Uses a per (+7 more)

### Community 3 - "Symbols API and Tests"
Cohesion: 0.09
Nodes (9): delete(), create_symbol(), delete_symbol(), _get_or_404(), get_symbol(), Integration tests for the Phase 2 REST API., test_create_and_delete_symbol(), test_create_assignment() (+1 more)

### Community 4 - "Orders API and Models"
Cohesion: 0.24
Nodes (11): FillRead, OrderCreate, OrderRead, OrderSide, OrderStatus, OrderType, Order and Fill Pydantic schemas., V1: MKT and LMT only. STP/BRACKET deferred. (+3 more)

### Community 5 - "Portfolio Models"
Cohesion: 0.32
Nodes (11): Portfolio, PortfolioCreate, PortfolioMode, PortfolioStatus, PortfolioUpdate, Portfolio Pydantic schemas., PortfolioService, PortfolioService — enforces cash invariants before writing to the DB.  All cash (+3 more)

### Community 6 - "Portfolio API and Service"
Cohesion: 0.22
Nodes (12): create(), get_or_404(), list_all(), record_realized_pnl(), release_cash(), reserve_cash(), update(), create_portfolio() (+4 more)

### Community 7 - "Ops and Health Check"
Cohesion: 0.28
Nodes (5): BaseModel, HealthResponse, IBKRStatusResponse, KillSwitchResponse, Ops router — health, IBKR status stub, kill-switch stub.

### Community 8 - "Alembic Migrations"
Cohesion: 0.29
Nodes (6): Alembic environment — configured for SQLAlchemy async + autogenerate., Run migrations in offline mode (no DB connection required)., Run migrations in online (async) mode., run_async_migrations(), run_migrations_offline(), run_migrations_online()

### Community 9 - "Assignments API"
Cohesion: 0.48
Nodes (5): create_assignment(), delete_assignment(), get_assignment(), _get_or_404(), update_assignment()

### Community 10 - "App Configuration"
Cohesion: 0.4
Nodes (4): BaseSettings, AutoTrader platform configuration., Application settings loaded from environment variables., Settings

### Community 11 - "Initial Schema Migration"
Cohesion: 0.5
Nodes (1): initial schema  Revision ID: d3fd5db3b8ef Revises:  Create Date: 2026-05-06 07:2

### Community 12 - "Database Setup"
Cohesion: 0.5
Nodes (3): get_db(), Async SQLAlchemy engine and session setup., FastAPI dependency: yields an async DB session.

### Community 13 - "App Main Entrypoint"
Cohesion: 0.5
Nodes (3): health_check(), AutoTrader FastAPI application., Root health check — also available at /ops/health.

### Community 15 - "Test Conftest"
Cohesion: 1.0
Nodes (1): Pytest configuration.

## Knowledge Gaps
- **14 isolated node(s):** `initial schema  Revision ID: d3fd5db3b8ef Revises:  Create Date: 2026-05-06 07:2`, `AutoTrader platform configuration.`, `Application settings loaded from environment variables.`, `Async SQLAlchemy engine and session setup.`, `Shared declarative base for all models.` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Initial Schema Migration`** (4 nodes): `d3fd5db3b8ef_initial_schema.py`, `downgrade()`, `initial schema  Revision ID: d3fd5db3b8ef Revises:  Create Date: 2026-05-06 07:2`, `upgrade()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Test Conftest`** (2 nodes): `conftest.py`, `Pytest configuration.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Base` connect `Models and Base` to `Schemas and Pydantic`, `Seed and Tests`, `Orders API and Models`, `Portfolio Models`, `Alembic Migrations`, `Database Setup`?**
  _High betweenness centrality (0.259) - this node is a cross-community bridge._
- **Why does `APIModel` connect `Schemas and Pydantic` to `Orders API and Models`, `Portfolio Models`, `Ops and Health Check`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **Why does `Symbol` connect `Seed and Tests` to `Models and Base`, `Schemas and Pydantic`, `Symbols API and Tests`, `Orders API and Models`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `Base` (e.g. with `Alembic environment — configured for SQLAlchemy async + autogenerate.` and `Run migrations in offline mode (no DB connection required).`) actually correct?**
  _`Base` has 33 INFERRED edges - model-reasoned connections that need verification._
- **Are the 22 inferred relationships involving `APIModel` (e.g. with `OrderCreate` and `FillRead`) actually correct?**
  _`APIModel` has 22 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `TimestampMixin` (e.g. with `OrderSide` and `OrderType`) actually correct?**
  _`TimestampMixin` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 14 inferred relationships involving `Symbol` (e.g. with `Seed script — populates the DB with one demo portfolio, 5 symbols, and 6 strateg` and `SQLAlchemy models — import all so Alembic autogenerate sees them.`) actually correct?**
  _`Symbol` has 14 INFERRED edges - model-reasoned connections that need verification._