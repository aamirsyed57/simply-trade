"""Celery application configuration."""

from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "autotrader",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.data_fetcher",
        "app.workers.strategy_runner",
        "app.workers.fill_handler",
        "app.workers.backtest_runner",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)

# ---------------------------------------------------------------------------
# Celery Beat schedule
# ---------------------------------------------------------------------------
# NOTE: strategy_runner tasks are dispatched per-assignment by the
# `dispatch_all_assignments` beat task rather than hardcoding assignment IDs.

celery_app.conf.beat_schedule = {
    "dispatch-strategy-ticks": {
        "task": "app.workers.strategy_runner.dispatch_all_assignments",
        # Every minute on weekdays. Hour restriction removed because exchanges span
        # many timezones; the task checks is_market_hours(exchange) per assignment.
        "schedule": crontab(minute="*/1", day_of_week="mon-fri"),
    },
}

