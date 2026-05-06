"""Sentiment Momentum strategy."""

import logging

from pydantic import BaseModel, Field

from app.strategies.base import BaseStrategy, register_strategy
from app.strategies.context import ExecutionContext
from app.strategies.signals import Signal

logger = logging.getLogger(__name__)

class SentimentMomentumParams(BaseModel):
    sentiment_score_threshold: float = Field(default=0.7, description="Minimum sentiment score (0 to 1) to trigger")
    momentum_lookback_bars: int = Field(default=3, description="Bars to check for price momentum alignment")
    position_size: float = Field(default=10.0, description="Number of shares to buy")


@register_strategy
class SentimentMomentumStrategy(BaseStrategy):
    code = "sentiment_momentum"
    name = "Sentiment Momentum"
    description = "News-driven entry combining NLP sentiment scores with price momentum."
    ParamsModel = SentimentMomentumParams

    async def generate_signal(self, symbol_id: int, ctx: ExecutionContext) -> Signal | None:
        # Phase 4 stub: real sentiment integration deferred to later phase
        # For now, we just return None to pass syntactical checks
        
        # Example logic structure:
        # sentiment = await ctx.data.get_latest_news_sentiment(symbol_id)
        # if sentiment >= self.params.sentiment_score_threshold:
        #     return Signal(...)
        
        return None
