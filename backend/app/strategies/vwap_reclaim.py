"""VWAP Reclaim strategy."""

from datetime import timedelta
import logging

from pydantic import BaseModel, Field

from app.strategies.base import BaseStrategy, register_strategy
from app.strategies.context import ExecutionContext
from app.strategies.signals import Signal

logger = logging.getLogger(__name__)

class VwapReclaimParams(BaseModel):
    pullback_depth_percent: float = Field(default=1.0, description="Minimum pullback depth below VWAP")
    reclaim_offset_percent: float = Field(default=0.1, description="Buffer above VWAP to confirm reclaim")
    position_size: float = Field(default=10.0, description="Number of shares to buy")


@register_strategy
class VwapReclaimStrategy(BaseStrategy):
    code = "vwap_reclaim"
    name = "VWAP Reclaim"
    description = "Trades a momentum reclaim of the VWAP after a significant pullback."
    ParamsModel = VwapReclaimParams

    async def generate_signal(self, symbol_id: int, ctx: ExecutionContext) -> Signal | None:
        now = ctx.clock.now()
        # Just need the day's data for VWAP
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        df = await ctx.data.get_bars(symbol_id, "5m", start, now)
        if len(df) < 3:
            return None
            
        # Calculate VWAP
        q = df['volume']
        p = (df['high'] + df['low'] + df['close']) / 3
        df['vwap'] = (p * q).cumsum() / q.cumsum()
        
        curr_bar = df.iloc[-1]
        prev_bar = df.iloc[-2]
        
        vwap = curr_bar['vwap']
        if vwap <= 0:
            return None
            
        # Check if previous bar was below VWAP by pullback depth
        prev_close = prev_bar['close']
        pullback = ((vwap - prev_close) / vwap) * 100
        
        if pullback >= self.params.pullback_depth_percent:
            # Check if current bar reclaimed VWAP
            curr_close = curr_bar['close']
            reclaim_target = vwap * (1 + (self.params.reclaim_offset_percent / 100.0))
            
            if curr_close >= reclaim_target:
                logger.info(f"VWAP Reclaim Triggered: Reclaimed {vwap:.2f} at {curr_close:.2f}")
                return Signal(
                    direction="BUY",
                    symbol_id=symbol_id,
                    qty=self.params.position_size,
                    order_type="MKT",
                    reason=f"VWAP Reclaim at {curr_close:.2f}"
                )
                
        return None
