"""Bollinger Band Squeeze strategy."""

from datetime import timedelta
import logging

from pydantic import BaseModel, Field

from app.strategies.base import BaseStrategy, register_strategy
from app.strategies.context import ExecutionContext
from app.strategies.signals import Signal

logger = logging.getLogger(__name__)


class BbSqueezeParams(BaseModel):
    bb_periods: int = Field(default=20, description="Bollinger Band rolling window")
    bb_std_dev: float = Field(default=2.0, description="Bollinger Band standard deviation multiplier")
    squeeze_lookback: int = Field(default=30, description="Bars to measure bandwidth compression against")
    position_size: float = Field(default=10.0, description="Number of shares to buy")


@register_strategy
class BbSqueezeStrategy(BaseStrategy):
    code = "bb_squeeze"
    name = "Bollinger Band Squeeze"
    description = "Trades breakouts from low-volatility compression: waits for bandwidth to reach a recent low, then enters when price closes outside the band."
    documentation_url = "https://www.investopedia.com/terms/b/bollingerbands.asp"
    ParamsModel = BbSqueezeParams

    async def generate_signal(self, symbol_id: int, ctx: ExecutionContext) -> Signal | None:
        now = ctx.clock.now()
        total_needed = self.params.bb_periods + self.params.squeeze_lookback + 5
        # Multiply by 2 so calendar-day count always covers enough trading bars
        start = now - timedelta(days=total_needed * 2 + 10)

        df = await ctx.data.get_bars(symbol_id, ctx.timeframe, start, now)
        if len(df) < total_needed:
            return None

        close = df["close"]
        mid = close.rolling(self.params.bb_periods).mean()
        std = close.rolling(self.params.bb_periods).std()
        upper = mid + self.params.bb_std_dev * std
        lower = mid - self.params.bb_std_dev * std
        bw = (upper - lower) / mid  # normalised bandwidth

        # Drop NaN rows produced by the rolling window
        bw = bw.dropna()
        upper = upper.dropna()
        lower = lower.dropna()
        if len(bw) < self.params.squeeze_lookback + 2:
            return None

        # Previous bar's bandwidth vs. the squeeze reference window before it
        prev_bw = bw.iloc[-2]
        ref_bw = bw.iloc[-(self.params.squeeze_lookback + 2):-2]

        if ref_bw.empty:
            return None

        # Squeeze: previous bar is at the narrowest bandwidth of the reference period
        was_squeezing = prev_bw <= ref_bw.min()
        if not was_squeezing:
            return None

        curr_close = close.iloc[-1]
        curr_upper = upper.iloc[-1]
        curr_lower = lower.iloc[-1]

        if curr_close > curr_upper:
            logger.info(f"BB Squeeze BUY: {curr_close:.2f} > upper {curr_upper:.2f} after squeeze bw={prev_bw:.4f}")
            return Signal(
                direction="BUY",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"Breakout above BB upper {curr_upper:.2f} after squeeze",
            )

        if curr_close < curr_lower:
            logger.info(f"BB Squeeze SELL: {curr_close:.2f} < lower {curr_lower:.2f} after squeeze bw={prev_bw:.4f}")
            return Signal(
                direction="SELL",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"Breakdown below BB lower {curr_lower:.2f} after squeeze",
            )

        return None
