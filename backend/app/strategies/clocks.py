"""Clock abstractions for live vs simulated time."""

from abc import ABC, abstractmethod
from datetime import datetime, timezone


class Clock(ABC):
    @abstractmethod
    def now(self) -> datetime:
        """Return the current time."""
        pass


class WallClock(Clock):
    """Returns the actual system time."""
    
    def now(self) -> datetime:
        return datetime.now(timezone.utc)


class SimulatedClock(Clock):
    """Returns a manually advanced time for backtesting."""
    
    def __init__(self, initial_time: datetime):
        if not initial_time.tzinfo:
            initial_time = initial_time.replace(tzinfo=timezone.utc)
        self._now = initial_time

    def now(self) -> datetime:
        return self._now

    def advance_to(self, new_time: datetime):
        if not new_time.tzinfo:
            new_time = new_time.replace(tzinfo=timezone.utc)
        if new_time < self._now:
            raise ValueError(f"Cannot advance clock backwards from {self._now} to {new_time}")
        self._now = new_time
