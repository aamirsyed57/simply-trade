"""Bull Flag breakout strategy."""

from datetime import timedelta
import logging

from pydantic import BaseModel, Field

from app.strategies.base import BaseStrategy, register_strategy
from app.strategies.context import ExecutionContext
from app.strategies.signals import Signal

logger = logging.getLogger(__name__)

class BullFlagParams(BaseModel):
    consolidation_periods: int = Field(default=5, description="Number of bars for consolidation")
    breakout_threshold_percent: float = Field(default=0.5, description="Percent above local high to trigger breakout")
    position_size: float = Field(default=10.0, description="Number of shares to buy")


@register_strategy
class BullFlagStrategy(BaseStrategy):
    code = "bull_flag"
    name = "Bull Flag Breakout"
    description = "Trades a breakout from a tight consolidation following a strong impulse."
    documentation_url = "https://www.investopedia.com/terms/f/flag.asp"
    ParamsModel = BullFlagParams

    async def generate_signal(self, symbol_id: int, ctx: ExecutionContext) -> Signal | None:
        now = ctx.clock.now()
        start = now - timedelta(days=2)
        
        df = await ctx.data.get_bars(symbol_id, ctx.timeframe, start, now)
        periods = self.params.consolidation_periods
        
        if len(df) < periods + 1:
            return None
            
        recent_bars = df.iloc[-periods:]
        local_high = recent_bars['high'].max()
        local_low = recent_bars['low'].min()
        
        # Check if consolidation is tight (high-low < 1%)
        if local_low <= 0:
            return None
        tightness = ((local_high - local_low) / local_low) * 100
        if tightness > 1.0:
            return None
            
        curr_price = df.iloc[-1]['close']
        breakout_price = local_high * (1 + (self.params.breakout_threshold_percent / 100.0))
        
        if curr_price > breakout_price:
            logger.info(f"BullFlag Triggered: Breakout above {breakout_price:.2f}")
            return Signal(
                direction="BUY",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"Breakout above {breakout_price:.2f}"
            )
            
        return None
