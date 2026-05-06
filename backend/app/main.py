"""AutoTrader FastAPI application."""

from fastapi import FastAPI

app = FastAPI(
    title="AutoTrader",
    description="IBKR-backed multi-portfolio trading platform with paper, live, and backtest modes",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


@app.get("/health", tags=["ops"])
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}
