"""Shared Pydantic base config and helpers."""

from pydantic import BaseModel, ConfigDict


class APIModel(BaseModel):
    """Base model for all API schemas — ORM mode enabled."""

    model_config = ConfigDict(from_attributes=True)
