"""RSI + EMA Filter strategy."""

from datetime import timedelta
import logging

from pydantic import BaseModel, Field

from app.strategies.base import BaseStrategy, register_strategy
from app.strategies.context import ExecutionContext
from app.strategies.signals import Signal

logger = logging.getLogger(__name__)


class RsiEmaParams(BaseModel):
    rsi_periods: int = Field(default=14, description="RSI lookback periods")
    ema_periods: int = Field(default=5, description="Short-term EMA confirming price recovery (5 = last 5 bars)")
    rsi_oversold: float = Field(default=40.0, description="RSI threshold to trigger buy")
    rsi_overbought: float = Field(default=60.0, description="RSI threshold to trigger sell")
    position_size: float = Field(default=10.0, description="Number of shares to buy")


@register_strategy
class RsiEmaStrategy(BaseStrategy):
    code = "rsi_ema"
    name = "RSI + EMA Filter"
    description = "Buys oversold dips in an uptrend and sells overbought peaks in a downtrend."
    documentation_url = "https://www.investopedia.com/terms/r/rsi.asp"
    ParamsModel = RsiEmaParams

    async def generate_signal(self, symbol_id: int, ctx: ExecutionContext) -> Signal | None:
        now = ctx.clock.now()
        lookback = max(self.params.rsi_periods, self.params.ema_periods)
        # Multiply by 2 so calendar-day count always covers enough trading bars
        start = now - timedelta(days=lookback * 2 + 10)

        df = await ctx.data.get_bars(symbol_id, ctx.timeframe, start, now)
        if len(df) < lookback:
            return None

        close = df["close"]

        # EMA trend filter
        ema = close.ewm(span=self.params.ema_periods, adjust=False).mean()

        # RSI via Wilder smoothing (ewm com = period - 1)
        delta = close.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        avg_gain = gain.ewm(com=self.params.rsi_periods - 1, min_periods=self.params.rsi_periods).mean()
        avg_loss = loss.ewm(com=self.params.rsi_periods - 1, min_periods=self.params.rsi_periods).mean()
        rs = avg_gain / avg_loss.replace(0, float("nan"))
        rsi = 100 - (100 / (1 + rs))

        curr_rsi = rsi.iloc[-1]
        curr_close = close.iloc[-1]
        curr_ema = ema.iloc[-1]

        if curr_rsi != curr_rsi:  # NaN guard
            return None

        if curr_rsi <= self.params.rsi_oversold and curr_close > curr_ema:
            logger.info(f"RSI+EMA BUY: RSI={curr_rsi:.1f}, price={curr_close:.2f} > EMA={curr_ema:.2f}")
            return Signal(
                direction="BUY",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"RSI {curr_rsi:.1f} oversold, above EMA {curr_ema:.2f}",
            )

        if curr_rsi >= self.params.rsi_overbought and curr_close < curr_ema:
            logger.info(f"RSI+EMA SELL: RSI={curr_rsi:.1f}, price={curr_close:.2f} < EMA={curr_ema:.2f}")
            return Signal(
                direction="SELL",
                symbol_id=symbol_id,
                qty=self.params.position_size,
                order_type="MKT",
                reason=f"RSI {curr_rsi:.1f} overbought, below EMA {curr_ema:.2f}",
            )

        return None
