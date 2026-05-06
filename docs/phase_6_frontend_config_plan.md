# Phase 6: Frontend Config UI

## Overview
Build the React/Vite frontend with portfolio management, symbol configuration, strategy assignment with dynamic param forms, and a cash panel. The UI talks directly to the FastAPI backend via `@tanstack/react-query`.

## Decisions
1. **Styling**: Tailwind CSS v3 + shadcn/ui (Radix-based). No Tailwind v4 (too new).
2. **State**: `@tanstack/react-query` for server state; no Redux.
3. **Routing**: `react-router-dom` v6.
4. **API client**: Thin hand-written fetch helpers per entity (no OpenAPI codegen to avoid complexity).
5. **No shadcn CLI**: We'll install shadcn/ui components manually as plain React components to avoid CLI setup overhead.

## Pages & Components

### Pages
- **`/`** → Portfolios list (cards)
- **`/portfolios/:id`** → Portfolio detail (assignments table + cash panel)
- **`/strategies`** → Strategy catalog

### Shared Components
- `AppShell` — sidebar + header layout
- `ModeBadge` — LIVE (red) / PAPER (green) pill
- `CashPanel` — budget breakdown bar
- `StrategyParamsForm` — dynamic form from JSON schema
- `CreatePortfolioModal` — create/edit portfolio
- `AssignStrategyModal` — assign/edit strategy on a symbol

## Proposed Changes

### Install Dependencies
- `@tanstack/react-query`, `react-router-dom`, `axios`
- `tailwindcss`, `@tailwindcss/vite` plugin (Tailwind v3 via PostCSS)
- `lucide-react` for icons

### Files
- `frontend/src/api/` — typed API helpers (portfolios, symbols, strategies, assignments, account)
- `frontend/src/components/` — AppShell, ModeBadge, CashPanel, StrategyParamsForm, modals
- `frontend/src/pages/` — PortfoliosPage, PortfolioDetailPage, StrategiesPage
- `frontend/src/main.tsx` — QueryClient + RouterProvider setup
- `frontend/src/App.tsx` — route definitions

## Verification Plan
- `npm run dev` starts without errors.
- Can create a portfolio, add a symbol, assign a strategy, and view the cash panel.
