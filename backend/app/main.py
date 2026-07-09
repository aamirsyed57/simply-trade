"""AutoTrader FastAPI application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import assignments, ops, orders, portfolios, positions, strategies, symbols, historical, account, backtests, market_movers, news

app = FastAPI(
    title="AutoTrader",
    description=(
        "IBKR-backed multi-portfolio trading platform.\n\n"
        "Supports paper, live, and backtest execution modes with "
        "6 pluggable strategies and virtual portfolio isolation."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routers ---
app.include_router(ops.router)
app.include_router(portfolios.router, prefix="/api/v1")
app.include_router(symbols.router, prefix="/api/v1")
app.include_router(strategies.router, prefix="/api/v1")
app.include_router(assignments.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(positions.router, prefix="/api/v1")
app.include_router(historical.router, prefix="/api/v1")
app.include_router(account.router, prefix="/api/v1")
app.include_router(backtests.router, prefix="/api/v1")
from app.api import settings
app.include_router(settings.router, prefix="/api/v1")
app.include_router(market_movers.router, prefix="/api/v1")
app.include_router(news.router, prefix="/api/v1")


@app.get("/health", tags=["ops"])
async def health_check() -> dict[str, str]:
    """Root health check — also available at /ops/health."""
    return {"status": "ok"}
