"""Signal dataclass returned by strategies."""

from dataclasses import dataclass
from typing import Literal


@dataclass
class Signal:
    """A trading signal emitted by a strategy."""
    direction: Literal["BUY", "SELL"]
    symbol_id: int
    qty: float
    order_type: Literal["MKT", "LMT"]
    limit_price: float | None = None
    reason: str = ""
