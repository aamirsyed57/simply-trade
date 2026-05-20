"""MACD Crossover strategy."""

from datetime import timedelta
import logging

from pydantic import BaseModel, Field

from app.strategies.base import BaseStrategy, register_strategy
from app.strategies.context import ExecutionContext
from app.strategies.signals import Signal

logger = logging.getLogger(__name__)


class MacdCrossoverParams(BaseModel):
    fast_period: int = Field(default=12, description="Fast EMA period")
    slow_period: int = Field(default=26, description="Slow EMA period")
    signal_period: int = Field(default=9, description="Signal line EMA period")
    position_size: float = Field(default=10.0, description="Number of shares to buy")


@register_strategy
class MacdCrossoverStrategy(BaseStrategy):
    code = "macd_crossover"
    name = "MACD Crossover"
    description = "Trades MACD histogram sign changes — histogram crosses zero from below (BUY) or above (SELL)."
    documentation_url = "https://www.investopedia.com/terms/m/macd.asp"
    ParamsModel = MacdCrossoverParams

    async def generate_signal(self, symbol_id: int, ctx: ExecutionContext) -> Signal | None:
        now = ctx.clock.now()
        # Extra bar count needed; multiply by 2 to convert trading-day count to calendar days
        lookback = self.params.slow_period + self.params.signal_period + 10
        start = now - timedelta(days=lookback * 2 + 10)

        df = await ctx.data.get_bars(symbol_id, ctx.timeframe, start, now)
        if len(df) < lookback:
            return None

        close = df["close"]

        fast_ema = close.ewm(span=self.params.fast_period, adjust=False).mean()
        slow_ema = close.ewm(span=self.params.slow_period, adjust=False).mean()
        macd = fast_ema - slow_ema
        signal_line = macd.ewm(span=self.params.signal_period, adjust=False).mean()
        histogram = macd - signal_line

        prev_hist = histogram.iloc[-2]
        curr_hist = histogram.iloc[-1]

        # Bullish crossover: histogram flips from negative to positive
        if prev_hist < 0 and curr_hist > 0:
            curr_close = close.iloc[-1]
            logger.info(f"MACD BUY crossover at {curr_close:.2f}, hist {prev_hist:.4f} → {curr_hist:.4f}")
            return Signal(
                direction="BUY",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"MACD histogram crossover {prev_hist:.4f} → {curr_hist:.4f}",
            )

        # Bearish crossover: histogram flips from positive to negative
        if prev_hist > 0 and curr_hist < 0:
            curr_close = close.iloc[-1]
            logger.info(f"MACD SELL crossover at {curr_close:.2f}, hist {prev_hist:.4f} → {curr_hist:.4f}")
            return Signal(
                direction="SELL",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"MACD histogram crossunder {prev_hist:.4f} → {curr_hist:.4f}",
            )

        return None
