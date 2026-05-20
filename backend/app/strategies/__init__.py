"""Strategies module."""

from app.strategies.base import BaseStrategy, STRATEGY_REGISTRY, register_strategy

from app.strategies.gap_and_go import GapAndGoStrategy
from app.strategies.bull_flag import BullFlagStrategy
from app.strategies.vwap_reclaim import VwapReclaimStrategy
from app.strategies.sentiment_momentum import SentimentMomentumStrategy
from app.strategies.mean_reversion import MeanReversionStrategy
from app.strategies.opening_range import OpeningRangeStrategy
from app.strategies.rsi_ema import RsiEmaStrategy
from app.strategies.macd_crossover import MacdCrossoverStrategy
from app.strategies.donchian_breakout import DonchianBreakoutStrategy
from app.strategies.bb_squeeze import BbSqueezeStrategy

__all__ = [
    "BaseStrategy",
    "STRATEGY_REGISTRY",
    "register_strategy",
    "GapAndGoStrategy",
    "BullFlagStrategy",
    "VwapReclaimStrategy",
    "SentimentMomentumStrategy",
    "MeanReversionStrategy",
    "OpeningRangeStrategy",
    "RsiEmaStrategy",
    "MacdCrossoverStrategy",
    "DonchianBreakoutStrategy",
    "BbSqueezeStrategy",
]
