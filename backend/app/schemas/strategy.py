"""Strategy Pydantic schemas — read-only (created via seed/registry)."""

from datetime import datetime

from app.schemas.base import APIModel


class StrategyRead(APIModel):
    code: str
    name: str
    description: str
    documentation_url: str | None = None
    params_schema: dict
    default_params: dict
    created_at: datetime
    updated_at: datetime
