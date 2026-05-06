"""Base strategy abstraction and registry."""

from abc import ABC, abstractmethod
from typing import Type

from pydantic import BaseModel

from app.strategies.context import ExecutionContext
from app.strategies.signals import Signal


class BaseStrategy(ABC):
    """Abstract base class for all trading strategies."""
    
    code: str
    name: str
    description: str
    ParamsModel: Type[BaseModel]

    def __init__(self, params: dict):
        # Validate params using the defined Pydantic model
        self.params = self.ParamsModel.model_validate(params)

    @abstractmethod
    async def generate_signal(self, symbol_id: int, ctx: ExecutionContext) -> Signal | None:
        """
        Evaluate market data and return a Signal if entry/exit criteria are met.
        Returns None if no action should be taken.
        """
        pass

    @classmethod
    def get_params_schema(cls) -> dict:
        """Return the JSON schema for this strategy's parameters."""
        return cls.ParamsModel.model_json_schema()


# Global strategy registry
STRATEGY_REGISTRY: dict[str, Type[BaseStrategy]] = {}


def register_strategy(cls: Type[BaseStrategy]) -> Type[BaseStrategy]:
    """Decorator to register a strategy class in the global registry."""
    if not hasattr(cls, "code"):
        raise ValueError(f"Strategy {cls.__name__} must define a 'code' attribute.")
    if cls.code in STRATEGY_REGISTRY:
        raise ValueError(f"Strategy code '{cls.code}' is already registered.")
    
    STRATEGY_REGISTRY[cls.code] = cls
    return cls
