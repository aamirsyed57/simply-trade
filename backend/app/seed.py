"""Seed script — populates the DB with one demo portfolio, 5 symbols, and 6 strategies.

Usage (inside the api container):
    python -m app.seed
"""

import asyncio
import logging

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.portfolio import Portfolio, PortfolioMode
from app.models.strategy import Strategy
from app.models.symbol import Symbol

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


from app.strategies import STRATEGY_REGISTRY

# ---------------------------------------------------------------------------
# Demo symbols
# ---------------------------------------------------------------------------

SYMBOLS = [
    {
        "ticker": "AAPL",
        "exchange": "NASDAQ",
        "asset_class": "STK",
        "contract_meta": {"currency": "USD", "primary_exchange": "NASDAQ", "secType": "STK"},
    },
    {
        "ticker": "MSFT",
        "exchange": "NASDAQ",
        "asset_class": "STK",
        "contract_meta": {"currency": "USD", "primary_exchange": "NASDAQ", "secType": "STK"},
    },
    {
        "ticker": "TSLA",
        "exchange": "NASDAQ",
        "asset_class": "STK",
        "contract_meta": {"currency": "USD", "primary_exchange": "NASDAQ", "secType": "STK"},
    },
    {
        "ticker": "GOOGL",
        "exchange": "NASDAQ",
        "asset_class": "STK",
        "contract_meta": {"currency": "USD", "primary_exchange": "NASDAQ", "secType": "STK"},
    },
    {
        "ticker": "AMZN",
        "exchange": "NASDAQ",
        "asset_class": "STK",
        "contract_meta": {"currency": "USD", "primary_exchange": "NASDAQ", "secType": "STK"},
    },
]


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        # --- Strategies ---
        log.info("Seeding strategies from Python registry...")
        for code, cls in STRATEGY_REGISTRY.items():
            existing = await session.scalar(select(Strategy).where(Strategy.code == code))
            if existing:
                log.info("  Strategy %s already exists, updating schemas", code)
                existing.name = cls.name
                existing.description = cls.description
                existing.default_params = cls.ParamsModel().model_dump()
                existing.params_schema = cls.get_params_schema()
            else:
                session.add(Strategy(
                    code=code,
                    name=cls.name,
                    description=cls.description,
                    default_params=cls.ParamsModel().model_dump(),
                    params_schema=cls.get_params_schema()
                ))
                log.info("  Created strategy: %s", code)

        # --- Symbols ---
        log.info("Seeding symbols...")
        symbol_ids = {}
        for sym in SYMBOLS:
            existing = await session.scalar(
                select(Symbol).where(Symbol.ticker == sym["ticker"], Symbol.exchange == sym["exchange"])
            )
            if existing:
                log.info("  Symbol %s already exists, skipping", sym["ticker"])
                symbol_ids[sym["ticker"]] = existing.id
                continue
            obj = Symbol(**sym)
            session.add(obj)
            await session.flush()
            symbol_ids[sym["ticker"]] = obj.id
            log.info("  Created symbol: %s", sym["ticker"])

        # --- Demo Portfolio ---
        log.info("Seeding demo portfolio...")
        existing_pf = await session.scalar(select(Portfolio).where(Portfolio.name == "Demo Paper Portfolio"))
        if not existing_pf:
            pf = Portfolio(
                name="Demo Paper Portfolio",
                mode=PortfolioMode.PAPER,
                budget_total=100_000,
                description="Auto-generated demo portfolio for development and testing.",
            )
            session.add(pf)
            log.info("  Created demo portfolio: Demo Paper Portfolio ($100,000 paper)")
        else:
            log.info("  Demo portfolio already exists, skipping")

        await session.commit()
        log.info("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
