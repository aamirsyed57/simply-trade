"""ExecutionContext encapsulates all state needed by a strategy to run."""

from dataclasses import dataclass
from typing import Literal

from app.strategies.clocks import Clock
from app.strategies.data_sources import MarketDataSource
from app.strategies.routers import OrderRouter


@dataclass
class ExecutionContext:
    """Provides a unified API for a strategy to run in live, paper, or backtest mode."""
    clock: Clock
    data: MarketDataSource
    router: OrderRouter
    portfolio_id: int
    mode: Literal["live", "paper", "backtest"]
