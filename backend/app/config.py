"""AutoTrader platform configuration."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://autotrader:autotrader@postgres:5432/autotrader"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # IBKR
    LIVE_TRADING_ENABLED: bool = False
    TWS_PAPER_HOST: str = "tws-gateway-paper"
    TWS_PAPER_PORT: int = 7497
    TWS_LIVE_HOST: str = "tws-gateway-live"
    TWS_LIVE_PORT: int = 7496

    # Telegram notifications
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""

    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
