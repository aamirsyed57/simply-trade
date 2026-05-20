"""Donchian Channel Breakout strategy (Turtle Trading)."""

from datetime import timedelta
import logging

from pydantic import BaseModel, Field

from app.strategies.base import BaseStrategy, register_strategy
from app.strategies.context import ExecutionContext
from app.strategies.signals import Signal

logger = logging.getLogger(__name__)


class DonchianBreakoutParams(BaseModel):
    channel_periods: int = Field(default=20, description="Lookback periods for channel high/low")
    position_size: float = Field(default=10.0, description="Number of shares to buy")


@register_strategy
class DonchianBreakoutStrategy(BaseStrategy):
    code = "donchian_breakout"
    name = "Donchian Channel Breakout"
    description = "Buys when price breaks above the N-period high (Turtle Trading system)."
    documentation_url = "https://www.investopedia.com/terms/d/donchianchannel.asp"
    ParamsModel = DonchianBreakoutParams

    async def generate_signal(self, symbol_id: int, ctx: ExecutionContext) -> Signal | None:
        now = ctx.clock.now()
        periods = self.params.channel_periods
        start = now - timedelta(days=periods + 10)

        df = await ctx.data.get_bars(symbol_id, ctx.timeframe, start, now)
        # Need at least periods + 1 bars (channel excludes current bar)
        if len(df) < periods + 1:
            return None

        # Channel is defined by the N bars BEFORE the current bar to avoid look-ahead
        channel_bars = df.iloc[-(periods + 1):-1]
        upper = channel_bars["high"].max()
        lower = channel_bars["low"].min()
        curr_close = df.iloc[-1]["close"]

        if curr_close > upper:
            logger.info(f"Donchian BUY: {curr_close:.2f} > {periods}-bar high {upper:.2f}")
            return Signal(
                direction="BUY",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"Breakout above {periods}-bar high {upper:.2f}",
            )

        if curr_close < lower:
            logger.info(f"Donchian SELL: {curr_close:.2f} < {periods}-bar low {lower:.2f}")
            return Signal(
                direction="SELL",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"Breakdown below {periods}-bar low {lower:.2f}",
            )

        return None
