# AutoTrader Platform — System Design

**IBKR-backed multi-portfolio trading platform with paper, live, and backtest modes**

> Status: Draft · Author: Aamir

---

## 1. Overview

AutoTrader is a self-hosted trading platform that connects to Interactive Brokers (IBKR) through TWS Gateway. It supports multiple isolated portfolios, each with its own budget, watchlist, and per-symbol strategy assignments. Strategies execute live, on a paper account, or against historical data via a backtest engine. A separate React frontend provides configuration and a live dashboard. Everything runs in Docker.

The platform runs against a **single IBKR account**. Portfolios are *virtual*: every order is tagged with its `portfolio_id`, and budgets, positions, and PnL are tracked in our own database. The schema reserves an `ibkr_account_code` field so switching to real IBKR sub-accounts later (Family Advisor / Friends-and-Family) is a configuration change, not a refactor.

This document is the canonical design for the system. It covers requirements, architecture, domain model, the virtual-portfolio mechanics, services, APIs, the strategy framework, execution modes, the backtest engine, historical data, the frontend, a phased build plan, and operational concerns.

---

## 2. Goals and Non-Goals

### Goals

- Multiple **virtual** portfolios on a single IBKR account, with isolated budgets and PnL tracked in our DB.
- Per-portfolio symbol lists; per-symbol strategy assignments with custom parameters.
- Pluggable strategy library: Gap and Go, Bull Flag Breakout, VWAP Reclaim, Sentiment Momentum, Mean Reversion, Opening Range Breakout.
- Three execution modes: live, paper, backtest. Same strategy code, three contexts.
- Configuration UI and live dashboard, separate from the backend.
- Fully containerised stack via Docker Compose.
- OpenAPI / Swagger-documented backend, with an auto-generated typed frontend client.
- Forward-compatible with real IBKR sub-accounts (one config field flip).

### Non-Goals

- Acting as a market-making or HFT system. Latency targets are seconds, not microseconds.
- Multi-tenant SaaS. The system is single-user, self-hosted.
- Custodial brokerage features. IBKR is the broker of record; we orchestrate, not custody.
- Tick-level backtesting. Bar-level (1m and up) is sufficient for the supported strategies.
- True account-level isolation between portfolios. With a single IBKR account, isolation is software-enforced; see §4.2 and §13.
- Multi-currency portfolios. V1 is USD-only; multi-currency is deferred.
- Corporate-action handling (splits, dividends, mergers). Deferred beyond v1.
- Advanced order types beyond MKT and LMT. Deferred beyond v1.

---

## 3. Architecture

A FastAPI backend orchestrates strategy execution against IBKR TWS Gateway via `ib_insync`. PostgreSQL stores configuration, orders, positions, virtual portfolio state, and trade history. Celery workers, with Redis as both broker and pub/sub bus, run strategies on schedules and react to market events. A long-running `ibkr-bridge` service owns the IBKR connection and exposes an internal interface so workers do not each open a TWS client. A React frontend talks to the API exclusively over REST.

### High-level diagram

```text
[ React Frontend ] ── REST/WS ──> [ FastAPI API ] ──> [ PostgreSQL ]
                                       │                    ▲
                                       ▼                    │
                                   [ Redis ] <──> [ Celery workers + Beat ]
                                                            │
                                                            ▼
                                          [ ibkr-bridge ] ──> [ TWS Gateway ]
                                                                  │
                                                                  ▼
                                                       SINGLE IBKR account
                                                       (paper or live mode)
```

The bridge holds two TWS clients (paper on 7497, live on 7496) and routes orders by portfolio mode. Backtests bypass the bridge entirely and run inside Celery workers using cached historical bars and a simulated order router.

---

## 4. Domain Model

The schema captures portfolios, symbols, strategies, and the assignments that bind them. Orders, positions, and signals are derived from execution. Backtests are a separate first-class entity. Every portfolio-related row that ultimately interacts with IBKR carries a `portfolio_id` so virtual partitioning works end-to-end.

### 4.1 Core entities

- **Portfolio** — `id, name, mode (live | paper), status, ibkr_account_code (nullable, default null), budget_total, cash_reserved, cash_deployed, cash_available, realized_pnl, unrealized_pnl_cached, created_at`.
- **Symbol** — `id, ticker, exchange, asset_class, contract_meta (currency, primary_exchange, secType)`.
- **Strategy** — registry record: `code, name, description, default_params (JSONB), params_schema (JSON Schema, drives the UI form)`.
- **PortfolioSymbolStrategy** — the assignment table: `portfolio_id, symbol_id, strategy_code, params (JSONB), allocation, enabled`.
- **Order** — `client_order_id, ibkr_order_id, portfolio_id (NOT NULL), symbol_id, strategy_code, side, qty, order_type (MKT | LMT for v1), status, order_ref (mirrors orderRef sent to IBKR), reserved_cash, fills (relation), created_at`.
- **Fill** — `order_id, ibkr_exec_id, qty, price, commission, ts`. Always inherits `portfolio_id` from its order.
- **VirtualPosition** — derived per `(portfolio_id, symbol_id)`: `qty, avg_price, realized_pnl, unrealized_pnl, last_updated`. **Per-portfolio** view of holdings; the broker-side position is the sum of these across portfolios for a given symbol.
- **Signal / TradeLog** — every strategy decision recorded for audit and dashboard replay.
- **Backtest** — `id, name, strategy_code, params, symbols[], timeframe, start_date, end_date, initial_capital, fill_model, slippage_bps, commission_model, status, started_at, finished_at`.
- **BacktestResult** — `equity_curve` (time series), `trades[]`, metrics (Sharpe, Sortino, max_dd, CAGR, win_rate, profit_factor, n_trades), per-symbol breakdown.
- **HistoricalBar** — `symbol_id, timeframe, ts (UTC), open, high, low, close, volume, source`. Indexed on `(symbol_id, timeframe, ts)`.

### 4.2 Virtual portfolio architecture

Because all portfolios share a single IBKR account, isolation between them is enforced entirely in software. Three concerns drive the design: order attribution, position attribution, and cash accounting.

#### Order attribution

Every IBKR order is tagged with an `orderRef` of the form `pf:{portfolio_id}:{strategy_code}:{mode}` (e.g. `pf:3:vwap_reclaim:live`). IBKR echoes this field on every execution event and on its end-of-day reports. On every fill, the bridge looks up the originating `Order` row by `client_order_id` and applies the fill to the correct portfolio's `VirtualPosition`. The `orderRef` is the safety net: even if our DB is lost, the broker-side log is enough to reconstruct portfolio attribution.

#### Position attribution

If portfolio A is long 100 AAPL and portfolio B is long 50 AAPL, IBKR sees a single 150-share long position. Our DB sees two `VirtualPosition` rows that sum to 150. When portfolio A sends a sell order for 30 AAPL, the order is tagged `pf:A:...`, so the resulting fill reduces only A's `VirtualPosition` (FIFO within the portfolio). Portfolio B's position is untouched.

Symbol-sharing across portfolios is allowed but logged loudly — a runtime check warns when an assignment is added for a symbol already assigned in another portfolio, since two strategies trading the same symbol in opposite directions can mask each other's PnL signal at the broker level (see §13).

#### Cash accounting

Real IBKR cash is a single pool. Per-portfolio "cash" is purely a DB-side accounting construct; all values are denominated in **USD** (v1 is USD-only). Three columns on `Portfolio` track it:

- `budget_total` — the cap set by the user.
- `cash_reserved` — sum of `reserved_cash` across this portfolio's open (unfilled) orders. Reserved on order submission, released on fill or cancel.
- `cash_deployed` — sum of `qty * avg_price` for the portfolio's open `VirtualPosition` rows.
- `cash_available = budget_total - cash_reserved - cash_deployed` (computed, validated to be non-negative on every write).

A pre-trade check rejects any order whose notional would push `cash_available` below zero. A second pre-trade check, at the bridge level, ensures that the **sum** across all portfolios of (`cash_reserved + cash_deployed`) does not exceed IBKR buying power. This second check is the guardrail against a bug in portfolio accounting silently overdrawing the real account.

#### Database invariants (enforced)

1. `cash_reserved >= 0`, `cash_deployed >= 0`, `cash_available >= 0` for every portfolio.
2. `SUM(cash_reserved + cash_deployed) over all live portfolios <= IBKR_buying_power_snapshot`. Checked pre-trade in the bridge.
3. `SUM(VirtualPosition.qty) over all portfolios for symbol X == IBKR_position(X)`. Checked at end-of-day reconciliation.
4. Every `Order` and `Fill` has a non-null `portfolio_id`.

### 4.3 Future-proofing for real sub-accounts

The `ibkr_account_code` column on `Portfolio` is null today. When real sub-accounts become available, populating that column per portfolio is sufficient for the bridge to route each order to the correct sub-account (`order.account = portfolio.ibkr_account_code`). The rest of the schema — virtual positions, cash accounting, order tagging — continues to work unchanged. The virtual-position checks become trivially satisfied (each portfolio's position equals its sub-account's broker-side position), and the cross-portfolio buying-power check becomes redundant but harmless.

---

## 5. Service Topology (Docker Compose)

| Service | Purpose |
|---|---|
| `api` | FastAPI backend. Exposes REST + Swagger at `/docs`. |
| `worker` | Celery worker. Runs strategy ticks, backtests, order management. |
| `beat` | Celery beat. Schedules strategy runs during market hours. |
| `ibkr-bridge` | Long-lived process holding `ib_insync` connections. Tags every order with `orderRef`, enforces account-level pre-trade checks, exposes internal RPC + Redis pub/sub for events. |
| `tws-gateway-paper` | Headless IB Gateway logged into paper account (port 7497). |
| `tws-gateway-live` | Headless IB Gateway with live credentials (7496). Only started when `LIVE_TRADING_ENABLED=true`. |
| `postgres` | Primary data store. Optional TimescaleDB extension for bar data at scale. |
| `redis` | Celery broker + result backend + market-data fan-out. |
| `frontend` | React app served by nginx in production. |
| `prometheus + grafana` | Optional. Metrics + dashboards (Phase 8+). |

---

## 6. API Surface

All endpoints are Pydantic-modelled and surface in OpenAPI. Swagger UI is mounted at `/docs`, ReDoc at `/redoc`. The frontend generates its TypeScript client from the schema, keeping the contract honest.

### Resources

```text
# Portfolios
GET    /portfolios
POST   /portfolios
GET    /portfolios/{id}
PATCH  /portfolios/{id}
DELETE /portfolios/{id}
GET    /portfolios/{id}/summary           # budget, reserved, deployed, available, day PnL
PATCH  /portfolios/{id}/mode              # live <-> paper, guarded
POST   /portfolios/{id}/clone-as-paper

# Symbols within a portfolio
GET    /portfolios/{id}/symbols
POST   /portfolios/{id}/symbols
DELETE /portfolios/{id}/symbols/{symbol_id}

# Strategy assignments
GET    /portfolios/{id}/assignments
POST   /portfolios/{id}/assignments
PATCH  /portfolios/{id}/assignments/{assignment_id}
DELETE /portfolios/{id}/assignments/{assignment_id}

# Strategy registry
GET    /strategies                        # list with params_schema
GET    /strategies/{code}

# Orders & positions
GET    /orders                            # filterable by portfolio_id, status, symbol
POST   /orders/{id}/cancel
GET    /positions                         # virtual positions, grouped by portfolio
GET    /positions/by-portfolio/{id}
GET    /positions/broker-view             # IBKR-side netted positions, for reconciliation

# Account
GET    /account/buying-power              # live IBKR account state
GET    /account/reconciliation            # diff: sum(VirtualPosition) vs IBKR

# Dashboard
GET    /dashboard/overview
GET    /dashboard/equity-curve
GET    /dashboard/trade-log

# Backtests
POST   /backtests
GET    /backtests
GET    /backtests/{id}
GET    /backtests/{id}/equity
GET    /backtests/{id}/trades
DELETE /backtests/{id}

# Historical data
GET    /historical/coverage
POST   /historical/prefetch

# Ops
GET    /health
GET    /ibkr/status
POST   /ops/kill-switch                   # cancel all open orders, halt strategies
```

---

## 7. Strategy Framework

Strategies are pluggable: the registry exposes them to the frontend, which renders parameter forms automatically from each strategy's JSON schema. New strategies are added without touching the API or UI.

### Base contract

```python
from abc import ABC, abstractmethod
from pydantic import BaseModel

class BaseStrategy(ABC):
    code: str
    name: str
    ParamsModel: type[BaseModel]

    def __init__(self, params: BaseModel):
        self.params = params

    def on_bar(self, bar, ctx): ...
    def on_tick(self, tick, ctx): ...
    def on_news(self, item, ctx): ...

    @abstractmethod
    def generate_signal(self, ctx) -> "Signal | None": ...

# Registry
@register_strategy
class VWAPReclaim(BaseStrategy):
    code = "vwap_reclaim"
    name = "VWAP Reclaim"

    class ParamsModel(BaseModel):
        lookback_minutes: int = 30
        confirmation_bars: int = 2
        stop_loss_pct: float = 0.5
```

A `StrategyRunner` Celery task accepts `(assignment_id, mode, ctx_overrides)` and executes one tick. The same task code serves live, paper, and backtest runs by swapping the `ExecutionContext` (see next section).

Strategies see only their own portfolio's `VirtualPosition`, not the broker-side netted view. This is critical — a Mean Reversion strategy in portfolio A should make decisions based on what *A* holds, not on what the whole account holds.

### Initial strategies

- **Gap and Go** — gap detection at open with volume confirmation.
- **Bull Flag Breakout** — consolidation breakout after a strong impulse.
- **VWAP Reclaim** — pullback to VWAP with reclaim confirmation.
- **Sentiment Momentum** — news-driven entry (sourced from Google / Yahoo Finance via scraping or RSS); price-action confirms. See §14 note on backtest limitations.
- **Mean Reversion** — z-score on a moving baseline; fade extremes.
- **Opening Range Breakout** — first N-minute range, breakout with volume.

---

## 8. Execution Modes

Three modes share strategy code through three small abstractions injected at runtime.

| Mode | Clock | Data Source | Order Router |
|---|---|---|---|
| **live** | `WallClock` | `LiveDataSource` (IBKR streaming) | `IBKRLiveRouter` (port 7496) |
| **paper** | `WallClock` | `LiveDataSource` (IBKR streaming) | `IBKRPaperRouter` (port 7497) |
| **backtest** | `SimulatedClock` | `ReplayDataSource` (cached bars) | `SimulatedRouter` (in-process) |

### ExecutionContext

```python
@dataclass
class ExecutionContext:
    clock: Clock
    data: MarketDataSource
    router: OrderRouter
    portfolio_id: int | None       # None for ad-hoc backtests
    mode: Literal["live", "paper", "backtest"]
```

Strategies only ever call `ctx.clock.now()`, `ctx.data.get_bars(...)`, `ctx.router.place_order(...)`. Nothing in the strategy knows or cares which mode it is in. This is the single most important design choice in the system: it lets the same code that you backtested last night go live tomorrow without modification.

### Order tagging — non-negotiable

Every order placed via `IBKRLiveRouter` or `IBKRPaperRouter` **must** set `orderRef = "pf:{portfolio_id}:{strategy_code}:{mode}"`. The bridge enforces this; routers refuse to submit an order without a `portfolio_id` and `strategy_code`. This tag is the single source of truth for portfolio attribution at the broker level — without it, the virtual-portfolio model breaks down.

### Mode safety

- Default mode for any new portfolio is **paper**.
- Flipping a portfolio to **live** requires a typed-confirmation step in the UI and the `LIVE_TRADING_ENABLED` environment flag.
- A global kill-switch endpoint cancels all open orders and disables all assignments. Reachable via API and a big red button in the UI. With a single shared account, the kill-switch is more important here than in a sub-account architecture — one runaway strategy can drain all portfolios.

---

## 9. Backtest Engine

A backtest is a one-off Celery job that replays historical bars through a strategy with a simulated router. Results persist to the DB and surface in the frontend. Backtests do not touch the virtual-portfolio cash accounting; they operate on their own `initial_capital` inside the `SimulatedRouter`.

### Pseudocode

```python
def run_backtest(backtest_id):
    bt = load(backtest_id)
    bars = ensure_historical_data(bt.symbols, bt.timeframe, bt.start, bt.end)

    ctx = ExecutionContext(
        clock=SimulatedClock(start=bt.start),
        data=ReplayDataSource(bars),
        router=SimulatedRouter(
            initial_cash=bt.initial_capital,
            commission=bt.commission_model,    # IBKR tiered approximation
            slippage_bps=bt.slippage_bps,
            fill_model=bt.fill_model,          # next_bar_open | bar_close | midpoint
        ),
        portfolio_id=None,
        mode="backtest",
    )

    strategy = registry.get(bt.strategy_code)(params=bt.params)

    for bar_event in ctx.data.iterate():
        ctx.clock.advance_to(bar_event.ts)
        strategy.on_bar(bar_event, ctx)
        ctx.router.match_pending_orders(bar_event)
        record_equity_snapshot(ctx)

    persist_results(bt, ctx.router.trade_log, compute_metrics(ctx))
```

### Fill models

- **`next_bar_open`** — most realistic. Avoids look-ahead bias. Default.
- **`bar_close`** — simpler. Slightly optimistic for trend strategies.
- **`midpoint`** — for limit orders that touched the bar range.

### Metrics computed

- Equity curve, drawdown curve, exposure over time.
- Sharpe, Sortino, Calmar.
- CAGR, total return, max drawdown.
- Win rate, profit factor, average winning trade, average losing trade, expectancy.
- Trade count, average holding period, exposure %.
- Per-symbol breakdown of all of the above.

---

## 10. Historical Data Management

A `MarketDataService` exposes a single `get_bars(symbol, timeframe, start, end) -> DataFrame`. Internally it checks the `historical_bars` cache for the requested range, fetches missing slices from IBKR, persists them, and returns a concatenated frame.

### Sources (v1: IBKR-only)

V1 uses **IBKR `reqHistoricalData`** exclusively — free with the account, but pacing-limited (~60 requests / 10 min on many endpoints). To mitigate pacing:

- **Aggressive caching** — once fetched, bars are stored in `historical_bars` and never re-fetched for the same range.
- **Prefetch endpoint** — `/historical/prefetch` lets the user seed common symbols and timeframes in bulk during off-hours.
- **Local Parquet warm-up** — seed common symbols on first run so initial backtests are instant.

Paid providers (Polygon, Alpaca, Tiingo) can be added later as alternative sources if IBKR pacing becomes a bottleneck.

### News Data (Sentiment Momentum)

V1 sources live news from **Google Finance and Yahoo Finance** (scraping / RSS). Historical news for backtest replay is not available from these free sources — the Sentiment Momentum strategy is therefore **paper/live-only until a timestamped historical news dataset is sourced**. See §13.5.

### Storage

PostgreSQL is sufficient for moderate volumes. For multi-year intraday across many symbols, enable the TimescaleDB extension and convert `historical_bars` to a hypertable. The schema is the same; only the storage mechanics change.

### Currency

All prices and cash values are in **USD**. Non-USD instruments are out of scope for v1.

---

## 11. Frontend

Vite + React + TypeScript. TanStack Query for data, shadcn/ui or Mantine for components, TradingView Lightweight Charts for price and equity charts. The API client is generated from OpenAPI (`openapi-typescript-codegen`) and committed to the repo, so refactors that break the contract fail at build time.

### Notifications (v1: Telegram)

A Telegram bot sends real-time notifications for: order fills, strategy signals, daily PnL summaries, risk-limit breaches, kill-switch activation, and EOD reconciliation drift alerts. Configuration requires a bot token and chat ID, stored as environment variables (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). A `NotificationService` abstracts the channel so Slack / email can be added later without changing callers.

### Screens

- **Portfolios** — list with `budget_total`, `cash_available`, mode badge (LIVE / PAPER), day PnL. Create and edit modals. Mode flip with typed confirmation.
- **Portfolio detail** — symbols table, per-row strategy dropdown, params form rendered from the strategy's JSON schema. Cash-accounting panel showing reserved / deployed / available.
- **Strategies catalog** — read-only descriptions of each strategy with default parameters and notes.
- **Backtest** — form for strategy / symbols / params / dates / capital / fill model / slippage. Job progress, then equity curve, drawdown chart, trade overlay on price, metrics card.
- **Compare backtests** — overlay equity curves of N runs. Useful for parameter sweeps.
- **Forward-test view** — for paper portfolios, equity curve since paper-mode start. Compare predicted (backtest) vs actual (paper) before going live.
- **Dashboard** — overview cards (equity, day PnL, open positions), live equity curve, open orders, recent fills, IBKR connection status, **shared-account banner** showing total IBKR buying power vs sum-of-portfolio commitments.
- **Reconciliation view** — side-by-side: virtual positions per portfolio vs IBKR-netted positions. Highlights any drift.
- **Orders / Trade log** — filterable history, exportable.
- **Notification settings** — Telegram bot configuration (token, chat ID), notification preferences per event type.

---

## 12. Phased Build Plan

Each phase ends with something runnable and testable. Estimates assume one engineer working part-time.

| Phase | Deliverable | Notes |
|---|---|---|
| 0 | Repo and Docker scaffolding | Monorepo (backend, frontend, infra). Compose with all services. Pre-commit, ruff, mypy, eslint. |
| 1 | Schema and migrations | SQLAlchemy 2.0 async models incl. VirtualPosition + cash columns, Alembic baseline, seed script with 1 demo portfolio + 5 symbols + 6 strategies registered. |
| 2 | Core CRUD + Swagger | Portfolios, symbols, strategies, assignments. Pydantic schemas. Validate cash invariants on every write. |
| 3 | IBKR bridge | `place` / `cancel` order with mandatory `orderRef` tagging, market-data subscribe, `get_positions`, `account_summary`. Reconnect logic. Redis pub/sub. Account-level buying-power pre-trade check. |
| 3.5 | Historical data layer | `MarketDataService`, cache schema, IBKR fetcher, prefetch endpoint. |
| 4 | Strategy framework | `BaseStrategy`, registry, params schemas. Six strategies stubbed initially. |
| 4.5 | ExecutionContext abstraction | Live / paper / simulated routers. Refactor strategies to use `ctx.*`. **Critical: do not skip.** |
| 5 | Live execution engine | Celery beat schedules. OrderManager with both per-portfolio and account-level risk checks. Fill handler updates VirtualPosition + cash columns atomically. End-to-end paper trade. |
| 5.5 | Backtest engine | `SimulatedRouter`, fill models, metrics, results persistence. |
| 6 | Frontend config UI | Portfolios, symbols, assignments, dynamic params forms, cash-accounting panel. |
| 7 | Dashboard + backtest UI | Live positions, equity curve, IBKR status, backtest screen, reconciliation view. |
| 7.5 | Telegram notifications | `NotificationService`, Telegram bot integration, notification preferences UI. |
| 8 | Hardening | Kill switch, structured logging, Prometheus metrics, EOD reconciliation job (per §13), paper-default enforcement. |
| 9 | Live-trading enablement | Live gateway service, mode flip flow, alerting, runbook. |

---

## 13. Risk and Operations

### 13.1 Risk controls (per-portfolio)

- `budget_total` cap. Sum of allocations cannot exceed budget.
- Max open positions per portfolio.
- Max orders per symbol per day.
- Max daily loss per portfolio. Auto-disable assignments on breach.
- Pre-trade checks before any `router.place_order`: portfolio cash availability, position limits, contract validity, market hours.
- **Order type restriction** — v1 permits only `MKT` and `LMT` order types. The router rejects any other order type. STP, STP_LMT, and BRACKET orders are deferred to a later phase.

### 13.2 Risk controls (account-level — specific to virtual portfolios)

Because all portfolios share one IBKR account, the bridge enforces a second layer of guards that no individual portfolio can bypass:

- **Account buying-power check** — before submitting any order, the bridge verifies that `SUM(cash_reserved + cash_deployed) + new_order_notional <= IBKR_buying_power * safety_factor` (e.g., `safety_factor = 0.95`). If the sum-of-portfolios accounting drifts, this catches it.
- **Account daily-loss circuit breaker** — if the *account-level* day PnL crosses a threshold (e.g., `-3% of equity`), the kill-switch fires automatically.
- **Concurrent-symbol guard** — opposing-direction orders from different portfolios on the same symbol are blocked by default. Configurable to "warn only" if intentionally hedging across portfolios.
- **Margin headroom alert** — Prometheus metric on `(buying_power - committed) / buying_power`. Alert below 20%.

### 13.3 Reconciliation

End-of-day Celery job (runs after market close):

1. **Position reconciliation** — for each symbol, compare `SUM(VirtualPosition.qty over all portfolios)` against IBKR-reported position. Any drift is logged loudly and surfaces in the Reconciliation view.
2. **Cash reconciliation** — compare `SUM(realized_pnl over all portfolios) + initial_capital_total` against IBKR-reported account NAV change for the day. Tolerance for fees / FX.
3. **Order reconciliation** — every IBKR execution from the day must match a `Fill` row with the correct `portfolio_id` derived from `orderRef`. Orphan fills (no matching DB row) trigger an alert.

Drift causes:
- Manual trades placed in TWS outside the platform — by policy, the live account should be platform-only. Document this.
- Corporate actions (splits, dividends, mergers) — **ignored in v1**. The platform does not detect or adjust for corporate actions. If a position undergoes a split or dividend, the reconciliation job will flag the drift and the user must manually correct virtual positions. Automated handling is deferred to a future phase.
- Bugs in fill-handling — the alert + recon view exposes them quickly.

### 13.4 Operational practices

- All timestamps stored UTC. Display layer renders in Europe/Berlin.
- Structured JSON logs to stdout. Aggregate later (Loki / OpenSearch).
- Prometheus metrics for: orders placed, fills, errors, bridge connection state, strategy run latency, account margin headroom, per-portfolio cash-available.
- Alerts delivered via **Telegram bot** (v1): bridge disconnect, EOD reconciliation drift, daily loss breach (per-portfolio AND account-level), margin headroom below 20%, kill-switch activation.
- Versioned strategy code. Every signal logs the strategy version that produced it.

### 13.5 Pitfalls to anticipate

- **Shared margin** — one strategy's drawdown can squeeze others. The account-level circuit breaker mitigates but does not eliminate this. Size portfolio budgets so the *sum* of worst-case drawdowns stays within tolerable account-level loss.
- **No real isolation** — a software bug can blow past per-portfolio budgets and drain the whole account. The account-level pre-trade check and kill-switch are the safety net; treat them as load-bearing, not optional.
- **Symbol overlap across portfolios** — netting at the broker can mask strategy-level signals. Default behaviour is to warn; opt in explicitly when intentional.
- **Look-ahead bias in backtests** — default to `next_bar_open` fills.
- **Survivorship bias** — current ticker lists distort historical results. Document the limitation; mitigate later with point-in-time symbol sets.
- **Fees and borrow costs** — model commissions and short-borrow even crudely.
- **Paper vs live divergence** — paper fills are optimistic. Treat paper as a logic-validation tool, not a PnL forecast.
- **Sentiment Momentum in backtest** — needs timestamped historical news to be honest. V1 sources live news from Google / Yahoo Finance (free, no historical archive). This strategy is **paper/live-only in v1**; backtesting it requires a future investment in a timestamped news dataset.
- **TWS connection limits** — multiple Celery workers cannot each open a TWS client. Centralise via the bridge.
- **Manual TWS trades** — by policy, the live IBKR account is platform-only. A manual trade outside the platform shows up as orphan fills in reconciliation. Document this rule clearly.

---

## 14. V1 Scope Decisions

The following questions were resolved during design review. Answers are integrated into the relevant sections above.

| # | Question | Decision | Where integrated |
|---|---|---|---|
| 1 | Historical data source | **IBKR-only** (free, pacing-limited). Paid providers deferred. | §10 |
| 2 | Live news source for Sentiment Momentum | **Google / Yahoo Finance** (scraping / RSS). No historical archive — strategy is paper/live-only for backtests. | §7, §10, §13.5 |
| 3 | Order types | **MKT and LMT only**. STP, STP_LMT, BRACKET deferred. | §4.1, §13.1 |
| 4 | Multi-currency portfolios | **USD-only**. Multi-currency deferred. | §2 (Non-Goals), §4.2, §10 |
| 5 | Notification channel | **Telegram bot**. Slack / email deferred. | §11, §12, §13.4 |
| 6 | Corporate-action handling | **Ignored in v1**. Reconciliation flags drift; manual correction required. | §2 (Non-Goals), §13.3 |

---

## Appendix A. Original Requirements Mapping

Mapping the original nine requirements to the design above.

| # | Requirement | Where addressed |
|---|---|---|
| 1 | Portfolios / sub-accounts for different strategies | §4.1, §4.2 (virtual portfolios on a single IBKR account) |
| 2 | Budget per portfolio | §4.1 (`budget_total / cash_reserved / cash_deployed / cash_available`); §4.2 (cash accounting); §13.1, §13.2 (risk controls) |
| 3 | Symbol list per portfolio | §4.1 (PortfolioSymbol relation); §6 (`/portfolios/{id}/symbols`) |
| 4 | Strategy / algo library to choose from | §7 (BaseStrategy + registry + initial 6 strategies) |
| 5 | Separate frontend for configuration | §11 (React + Vite, generated client) |
| 6 | Everything on Docker | §5 (compose topology) |
| 7 | Swagger for backend APIs | §6 (FastAPI auto-OpenAPI at `/docs` and `/redoc`) |
| 8 | Assign strategy per symbol within a portfolio | §4.1 (PortfolioSymbolStrategy); §6 (assignments endpoints) |
| 9 | Dashboard for trades / portfolios / positions | §11 (Dashboard, Reconciliation view, Trade Log screens) |
| + | Paper trading on real-time data | §8 (paper mode, ExecutionContext) |
| + | Backtest on historical data | §9, §10 (engine, fill models, historical cache) |
| + | Single-account virtual portfolios with future sub-account compatibility | §4.2, §4.3 |
