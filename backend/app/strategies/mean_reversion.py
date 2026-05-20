"""Mean Reversion strategy."""

from datetime import timedelta
import logging

from pydantic import BaseModel, Field

from app.strategies.base import BaseStrategy, register_strategy
from app.strategies.context import ExecutionContext
from app.strategies.signals import Signal

logger = logging.getLogger(__name__)

class MeanReversionParams(BaseModel):
    lookback_periods: int = Field(default=20, description="Moving average lookback periods")
    z_score_threshold: float = Field(default=2.0, description="Z-Score threshold to trigger mean reversion")
    position_size: float = Field(default=10.0, description="Number of shares to buy")


@register_strategy
class MeanReversionStrategy(BaseStrategy):
    code = "mean_reversion"
    name = "Mean Reversion"
    description = "Fades extremes using Z-score on a moving baseline."
    documentation_url = "https://www.investopedia.com/terms/m/meanreversion.asp"
    ParamsModel = MeanReversionParams

    async def generate_signal(self, symbol_id: int, ctx: ExecutionContext) -> Signal | None:
        now = ctx.clock.now()
        start = now - timedelta(days=5)
        
        df = await ctx.data.get_bars(symbol_id, ctx.timeframe, start, now)
        periods = self.params.lookback_periods
        
        if len(df) < periods:
            return None
            
        recent_bars = df.iloc[-periods:]
        mean = recent_bars['close'].mean()
        std = recent_bars['close'].std()
        
        if std == 0:
            return None
            
        curr_price = df.iloc[-1]['close']
        z_score = (curr_price - mean) / std
        
        # If price is heavily below the mean, we expect it to revert up (BUY)
        if z_score <= -self.params.z_score_threshold:
            logger.info(f"MeanReversion Triggered: Z-Score={z_score:.2f}")
            return Signal(
                direction="BUY",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"Z-Score {z_score:.2f} <= {-self.params.z_score_threshold}"
            )
            
        # If price is heavily above the mean, we expect it to revert down (SELL)
        elif z_score >= self.params.z_score_threshold:
            logger.info(f"MeanReversion Triggered: Z-Score={z_score:.2f}")
            return Signal(
                direction="SELL",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"Z-Score {z_score:.2f} >= {self.params.z_score_threshold}"
            )
            
        return None
