"""Gap and Go strategy."""

from datetime import timedelta
import logging

from pydantic import BaseModel, Field

from app.strategies.base import BaseStrategy, register_strategy
from app.strategies.context import ExecutionContext
from app.strategies.signals import Signal

logger = logging.getLogger(__name__)

class GapAndGoParams(BaseModel):
    min_gap_percent: float = Field(default=2.0, description="Minimum gap percentage to trigger")
    volume_multiplier: float = Field(default=1.5, description="Required volume multiplier over average")
    position_size: float = Field(default=10.0, description="Number of shares to buy")


@register_strategy
class GapAndGoStrategy(BaseStrategy):
    code = "gap_and_go"
    name = "Gap and Go"
    description = "Trades momentum on morning gaps with volume confirmation."
    ParamsModel = GapAndGoParams

    async def generate_signal(self, symbol_id: int, ctx: ExecutionContext) -> Signal | None:
        now = ctx.clock.now()
        start = now - timedelta(days=5)
        
        # Fetch daily bars to check the gap
        df = await ctx.data.get_bars(symbol_id, "1d", start, now)
        if len(df) < 2:
            return None
            
        prev_bar = df.iloc[-2]
        curr_bar = df.iloc[-1]
        
        # Calculate gap
        prev_close = prev_bar['close']
        curr_open = curr_bar['open']
        
        if prev_close <= 0:
            return None
            
        gap_percent = ((curr_open - prev_close) / prev_close) * 100
        
        # Check volume
        avg_vol = df['volume'].mean()
        if avg_vol <= 0:
            return None
            
        vol_ratio = curr_bar['volume'] / avg_vol
        
        if gap_percent >= self.params.min_gap_percent and vol_ratio >= self.params.volume_multiplier:
            logger.info(f"GapAndGo Triggered: Gap={gap_percent:.2f}%, Vol={vol_ratio:.2f}x")
            return Signal(
                direction="BUY",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"Gap {gap_percent:.2f}% with {vol_ratio:.2f}x volume"
            )
            
        return None
