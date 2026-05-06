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


# ---------------------------------------------------------------------------
# Strategy definitions — code, name, description, params_schema, default_params
# ---------------------------------------------------------------------------

STRATEGIES = [
    {
        "code": "gap_and_go",
        "name": "Gap and Go",
        "description": (
            "Detects stocks with a significant pre-market or at-open gap relative to prior close, "
            "confirmed by above-average volume on the first bars. Enters long on continuation of the gap move."
        ),
        "default_params": {
            "gap_pct_min": 2.0,
            "volume_multiplier": 1.5,
            "entry_bar": 2,
            "stop_loss_pct": 1.5,
            "take_profit_pct": 3.0,
        },
        "params_schema": {
            "type": "object",
            "title": "Gap and Go Parameters",
            "properties": {
                "gap_pct_min": {
                    "type": "number",
                    "title": "Minimum Gap %",
                    "description": "Minimum gap vs prior close to qualify (percent)",
                    "default": 2.0,
                    "minimum": 0.5,
                    "maximum": 20.0,
                },
                "volume_multiplier": {
                    "type": "number",
                    "title": "Volume Multiplier",
                    "description": "Required volume as multiple of 20-day average",
                    "default": 1.5,
                    "minimum": 1.0,
                    "maximum": 5.0,
                },
                "entry_bar": {
                    "type": "integer",
                    "title": "Entry Bar",
                    "description": "Bar index after open to enter (1 = first bar, 2 = second)",
                    "default": 2,
                    "minimum": 1,
                    "maximum": 10,
                },
                "stop_loss_pct": {
                    "type": "number",
                    "title": "Stop Loss %",
                    "description": "Stop loss distance from entry (percent)",
                    "default": 1.5,
                    "minimum": 0.1,
                    "maximum": 10.0,
                },
                "take_profit_pct": {
                    "type": "number",
                    "title": "Take Profit %",
                    "description": "Take profit distance from entry (percent)",
                    "default": 3.0,
                    "minimum": 0.5,
                    "maximum": 20.0,
                },
            },
            "required": ["gap_pct_min", "volume_multiplier", "entry_bar", "stop_loss_pct", "take_profit_pct"],
        },
    },
    {
        "code": "bull_flag",
        "name": "Bull Flag Breakout",
        "description": (
            "Identifies a strong impulse move followed by a tight, low-volume consolidation (flag). "
            "Enters on breakout above the flag's upper boundary with volume confirmation."
        ),
        "default_params": {
            "impulse_min_pct": 3.0,
            "flag_bars": 5,
            "consolidation_max_pct": 1.5,
            "volume_multiplier": 1.3,
            "stop_loss_pct": 1.0,
        },
        "params_schema": {
            "type": "object",
            "title": "Bull Flag Breakout Parameters",
            "properties": {
                "impulse_min_pct": {
                    "type": "number",
                    "title": "Minimum Impulse %",
                    "description": "Minimum initial impulse move to qualify (percent)",
                    "default": 3.0,
                    "minimum": 1.0,
                    "maximum": 20.0,
                },
                "flag_bars": {
                    "type": "integer",
                    "title": "Flag Bars",
                    "description": "Number of consolidation bars forming the flag",
                    "default": 5,
                    "minimum": 2,
                    "maximum": 20,
                },
                "consolidation_max_pct": {
                    "type": "number",
                    "title": "Max Consolidation %",
                    "description": "Maximum retracement during consolidation (percent)",
                    "default": 1.5,
                    "minimum": 0.2,
                    "maximum": 5.0,
                },
                "volume_multiplier": {
                    "type": "number",
                    "title": "Breakout Volume Multiplier",
                    "description": "Required breakout volume as multiple of flag average",
                    "default": 1.3,
                    "minimum": 1.0,
                    "maximum": 5.0,
                },
                "stop_loss_pct": {
                    "type": "number",
                    "title": "Stop Loss %",
                    "description": "Stop loss below flag low (percent)",
                    "default": 1.0,
                    "minimum": 0.1,
                    "maximum": 5.0,
                },
            },
            "required": ["impulse_min_pct", "flag_bars", "consolidation_max_pct", "volume_multiplier", "stop_loss_pct"],
        },
    },
    {
        "code": "vwap_reclaim",
        "name": "VWAP Reclaim",
        "description": (
            "Waits for price to pull back below VWAP then reclaim it with momentum. "
            "Enters long on the confirmed reclaim candle. Exits on VWAP loss."
        ),
        "default_params": {
            "lookback_minutes": 30,
            "confirmation_bars": 2,
            "stop_loss_pct": 0.5,
            "max_distance_from_vwap_pct": 1.0,
        },
        "params_schema": {
            "type": "object",
            "title": "VWAP Reclaim Parameters",
            "properties": {
                "lookback_minutes": {
                    "type": "integer",
                    "title": "Lookback Minutes",
                    "description": "How far back to calculate VWAP (minutes)",
                    "default": 30,
                    "minimum": 5,
                    "maximum": 390,
                },
                "confirmation_bars": {
                    "type": "integer",
                    "title": "Confirmation Bars",
                    "description": "Number of bars closing above VWAP to confirm reclaim",
                    "default": 2,
                    "minimum": 1,
                    "maximum": 5,
                },
                "stop_loss_pct": {
                    "type": "number",
                    "title": "Stop Loss %",
                    "description": "Stop loss below reclaim entry (percent)",
                    "default": 0.5,
                    "minimum": 0.1,
                    "maximum": 3.0,
                },
                "max_distance_from_vwap_pct": {
                    "type": "number",
                    "title": "Max Distance from VWAP %",
                    "description": "Maximum allowed distance below VWAP before pullback is too deep (percent)",
                    "default": 1.0,
                    "minimum": 0.1,
                    "maximum": 5.0,
                },
            },
            "required": ["lookback_minutes", "confirmation_bars", "stop_loss_pct", "max_distance_from_vwap_pct"],
        },
    },
    {
        "code": "sentiment_momentum",
        "name": "Sentiment Momentum",
        "description": (
            "Monitors Google/Yahoo Finance news headlines for the assigned symbol. "
            "Uses a FinBERT-style sentiment score to detect positive momentum triggers, "
            "then confirms with price action before entering. "
            "⚠️ Paper/live only in v1 — requires timestamped historical news for honest backtesting."
        ),
        "default_params": {
            "sentiment_threshold": 0.6,
            "price_confirmation_bars": 2,
            "max_entry_delay_minutes": 15,
            "stop_loss_pct": 1.0,
            "take_profit_pct": 2.0,
        },
        "params_schema": {
            "type": "object",
            "title": "Sentiment Momentum Parameters",
            "properties": {
                "sentiment_threshold": {
                    "type": "number",
                    "title": "Sentiment Score Threshold",
                    "description": "Minimum positive sentiment score [0.0–1.0] to trigger entry consideration",
                    "default": 0.6,
                    "minimum": 0.3,
                    "maximum": 1.0,
                },
                "price_confirmation_bars": {
                    "type": "integer",
                    "title": "Price Confirmation Bars",
                    "description": "Bars of upward price action required to confirm sentiment signal",
                    "default": 2,
                    "minimum": 1,
                    "maximum": 10,
                },
                "max_entry_delay_minutes": {
                    "type": "integer",
                    "title": "Max Entry Delay (minutes)",
                    "description": "Discard news signal if price confirmation not received within this window",
                    "default": 15,
                    "minimum": 1,
                    "maximum": 60,
                },
                "stop_loss_pct": {
                    "type": "number",
                    "title": "Stop Loss %",
                    "description": "Stop loss below entry (percent)",
                    "default": 1.0,
                    "minimum": 0.1,
                    "maximum": 5.0,
                },
                "take_profit_pct": {
                    "type": "number",
                    "title": "Take Profit %",
                    "description": "Take profit above entry (percent)",
                    "default": 2.0,
                    "minimum": 0.5,
                    "maximum": 10.0,
                },
            },
            "required": [
                "sentiment_threshold",
                "price_confirmation_bars",
                "max_entry_delay_minutes",
                "stop_loss_pct",
                "take_profit_pct",
            ],
        },
    },
    {
        "code": "mean_reversion",
        "name": "Mean Reversion",
        "description": (
            "Computes a rolling z-score on close prices relative to a moving baseline. "
            "Fades extreme deviations (z-score breaching the threshold) expecting reversion to mean. "
            "Exits when price returns to mean or stop is hit."
        ),
        "default_params": {
            "lookback_bars": 20,
            "z_score_entry": 2.0,
            "z_score_exit": 0.5,
            "stop_loss_pct": 1.5,
            "max_holding_bars": 30,
        },
        "params_schema": {
            "type": "object",
            "title": "Mean Reversion Parameters",
            "properties": {
                "lookback_bars": {
                    "type": "integer",
                    "title": "Lookback Bars",
                    "description": "Rolling window for mean and std calculation",
                    "default": 20,
                    "minimum": 5,
                    "maximum": 200,
                },
                "z_score_entry": {
                    "type": "number",
                    "title": "Z-Score Entry Threshold",
                    "description": "Z-score level at which to enter a fade (e.g. 2.0 = 2 std devs)",
                    "default": 2.0,
                    "minimum": 1.0,
                    "maximum": 4.0,
                },
                "z_score_exit": {
                    "type": "number",
                    "title": "Z-Score Exit Threshold",
                    "description": "Z-score level at which to exit (mean reversion complete)",
                    "default": 0.5,
                    "minimum": 0.0,
                    "maximum": 2.0,
                },
                "stop_loss_pct": {
                    "type": "number",
                    "title": "Stop Loss %",
                    "description": "Stop loss from entry if reversion doesn't occur (percent)",
                    "default": 1.5,
                    "minimum": 0.1,
                    "maximum": 10.0,
                },
                "max_holding_bars": {
                    "type": "integer",
                    "title": "Max Holding Bars",
                    "description": "Force exit after this many bars if target not reached",
                    "default": 30,
                    "minimum": 1,
                    "maximum": 200,
                },
            },
            "required": ["lookback_bars", "z_score_entry", "z_score_exit", "stop_loss_pct", "max_holding_bars"],
        },
    },
    {
        "code": "opening_range_breakout",
        "name": "Opening Range Breakout",
        "description": (
            "Defines the opening range as the high/low of the first N minutes after market open. "
            "Enters long on a confirmed breakout above the range high, short on breakdown below range low. "
            "Trades are sized relative to the range width."
        ),
        "default_params": {
            "range_minutes": 15,
            "volume_multiplier": 1.2,
            "stop_loss_pct": 0.75,
            "take_profit_ratio": 2.0,
            "max_entry_delay_minutes": 30,
        },
        "params_schema": {
            "type": "object",
            "title": "Opening Range Breakout Parameters",
            "properties": {
                "range_minutes": {
                    "type": "integer",
                    "title": "Opening Range Minutes",
                    "description": "Length of the opening range window in minutes",
                    "default": 15,
                    "minimum": 5,
                    "maximum": 60,
                },
                "volume_multiplier": {
                    "type": "number",
                    "title": "Breakout Volume Multiplier",
                    "description": "Required breakout volume as multiple of range average",
                    "default": 1.2,
                    "minimum": 1.0,
                    "maximum": 5.0,
                },
                "stop_loss_pct": {
                    "type": "number",
                    "title": "Stop Loss %",
                    "description": "Stop loss from entry (percent)",
                    "default": 0.75,
                    "minimum": 0.1,
                    "maximum": 5.0,
                },
                "take_profit_ratio": {
                    "type": "number",
                    "title": "Take Profit Ratio (R:R)",
                    "description": "Risk/reward ratio for take profit target",
                    "default": 2.0,
                    "minimum": 0.5,
                    "maximum": 10.0,
                },
                "max_entry_delay_minutes": {
                    "type": "integer",
                    "title": "Max Entry Delay (minutes)",
                    "description": "Discard breakout signal if not filled within this window after open range ends",
                    "default": 30,
                    "minimum": 1,
                    "maximum": 120,
                },
            },
            "required": [
                "range_minutes",
                "volume_multiplier",
                "stop_loss_pct",
                "take_profit_ratio",
                "max_entry_delay_minutes",
            ],
        },
    },
]

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
        log.info("Seeding strategies...")
        for s in STRATEGIES:
            existing = await session.scalar(select(Strategy).where(Strategy.code == s["code"]))
            if existing:
                log.info("  Strategy %s already exists, skipping", s["code"])
                continue
            session.add(Strategy(**s))
            log.info("  Created strategy: %s", s["code"])

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
