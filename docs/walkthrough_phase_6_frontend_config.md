# Phase 6 Walkthrough: Frontend Config UI

## Overview
Built the complete React/Vite configuration frontend using Tailwind CSS v4, `@tanstack/react-query`, and `react-router-dom`. The UI is fully wired to the FastAPI backend via a Vite proxy (`/api` → `http://localhost:8000`).

---

## Technology Stack
- **Vite 8 + React 19 + TypeScript 6**
- **Tailwind CSS v4** — via `@tailwindcss/vite` plugin (CSS-first config, no `tailwind.config.js` needed)
- **`@tanstack/react-query`** — server state with 10s auto-refresh on live data
- **`react-router-dom` v7** — client-side routing
- **`lucide-react`** — icon set

---

## Pages

### `/` — Portfolios List
- Cards for each portfolio with name, `ModeBadge`, budget bar, deployed/reserved/available breakdown, PnL with trend icon.
- **Create** and **Edit** portfolio via modal.
- **Delete** with confirmation.

### `/portfolios/:id` — Portfolio Detail
- `CashPanel` — 3-segment colour bar (deployed=blue, reserved=amber, available=green) + legend grid.
- Assignment table with columns: Symbol, Strategy, Allocation, Parameters (truncated monospace), Status toggle.
- **Assign Strategy** modal opens `AssignStrategyModal` with dynamic `StrategyParamsForm`.
- Enable/Disable toggle updates assignment in real time.

### `/strategies` — Strategy Catalog
- Read-only cards per strategy with description and formatted default params table.
- Strategy `code` shown as a pill badge.

---

## Key Components

| Component | Purpose |
|---|---|
| `AppShell` | Sidebar nav + main layout |
| `ModeBadge` | LIVE (red pulsing dot) / PAPER (green) pill |
| `CashPanel` | Budget breakdown bar + legend |
| `StrategyParamsForm` | Renders inputs dynamically from `params_schema` JSON Schema |
| `CreatePortfolioModal` | Create/edit portfolio form |
| `AssignStrategyModal` | Assign strategy with dynamic params, includes symbol + strategy dropdowns |

---

## API Layer (`src/api/`)
- `portfolios.ts` — typed CRUD helpers for Portfolio
- `index.ts` — combined: Symbol, Strategy, Assignment, AccountSummary typed clients

---

## Verification
- `npm run build` — clean TypeScript compile, no errors, 294 kB JS bundle.
- Dev server proxies `/api` to `http://localhost:8000`.
