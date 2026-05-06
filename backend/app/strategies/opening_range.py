"""Opening Range Breakout strategy."""

from datetime import timedelta
import logging

from pydantic import BaseModel, Field

from app.strategies.base import BaseStrategy, register_strategy
from app.strategies.context import ExecutionContext
from app.strategies.signals import Signal

logger = logging.getLogger(__name__)

class OpeningRangeParams(BaseModel):
    range_minutes: int = Field(default=15, description="Minutes to define the opening range")
    breakout_buffer_percent: float = Field(default=0.1, description="Buffer above ORH to confirm breakout")
    position_size: float = Field(default=10.0, description="Number of shares to buy")


@register_strategy
class OpeningRangeStrategy(BaseStrategy):
    code = "opening_range"
    name = "Opening Range Breakout"
    description = "Trades the breakout of the first N-minute range with volume."
    documentation_url = "https://www.investopedia.com/articles/trading/05/030205.asp"
    ParamsModel = OpeningRangeParams

    async def generate_signal(self, symbol_id: int, ctx: ExecutionContext) -> Signal | None:
        now = ctx.clock.now()
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        df = await ctx.data.get_bars(symbol_id, "1m", start, now)
        if df.empty:
            return None
            
        # Get market open time (typically 09:30 local, but using UTC requires TZ logic)
        # For simplicity, we assume the first bar of the day in df is the open
        open_time = df.index[0]
        range_end = open_time + timedelta(minutes=self.params.range_minutes)
        
        # If we are still within the opening range, no breakout yet
        if now <= range_end:
            return None
            
        or_bars = df[df.index < range_end]
        if or_bars.empty:
            return None
            
        orh = or_bars['high'].max()
        orl = or_bars['low'].min()
        
        curr_price = df.iloc[-1]['close']
        
        # Long breakout
        buy_target = orh * (1 + (self.params.breakout_buffer_percent / 100.0))
        if curr_price >= buy_target:
            logger.info(f"OpeningRange Triggered: ORH Breakout at {curr_price:.2f}")
            return Signal(
                direction="BUY",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"ORH Breakout at {curr_price:.2f}"
            )
            
        # Short breakout
        sell_target = orl * (1 - (self.params.breakout_buffer_percent / 100.0))
        if curr_price <= sell_target:
            logger.info(f"OpeningRange Triggered: ORL Breakdown at {curr_price:.2f}")
            return Signal(
                direction="SELL",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"ORL Breakdown at {curr_price:.2f}"
            )
            
        return None
