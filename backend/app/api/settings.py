import os
import json
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/settings", tags=["settings"])

class NotificationSettings(BaseModel):
    telegram_bot_token: str
    telegram_chat_id: str
    notify_fill: bool = True
    notify_signal: bool = True
    notify_daily_pnl: bool = True
    notify_risk_breach: bool = True
    notify_kill_switch: bool = True
    notify_recon_drift: bool = True
    notify_bridge_disconnect: bool = True

SETTINGS_FILE = "settings.json"

def _load_settings():
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "r") as f:
            return json.load(f)
    return {}

def _save_settings(data):
    with open(SETTINGS_FILE, "w") as f:
        json.dump(data, f)

@router.get("", response_model=NotificationSettings)
async def get_settings():
    data = _load_settings()
    return NotificationSettings(**data) if data else NotificationSettings(telegram_bot_token="", telegram_chat_id="")

@router.post("", response_model=NotificationSettings)
async def update_settings(settings: NotificationSettings):
    _save_settings(settings.model_dump())
    
    # Also update config and notifier instance
    from app.config import settings as app_settings
    from app.services.notification_service import notifier
    app_settings.TELEGRAM_BOT_TOKEN = settings.telegram_bot_token
    app_settings.TELEGRAM_CHAT_ID = settings.telegram_chat_id
    notifier.bot_token = settings.telegram_bot_token
    notifier.chat_id = settings.telegram_chat_id
    notifier.base_url = f"https://api.telegram.org/bot{notifier.bot_token}/sendMessage"
    
    return settings

@router.post("/test-notification")
async def test_notification():
    from app.services.notification_service import notifier
    try:
        await notifier.send("test", "🔔 This is a test notification from AutoTrader!")
        return {"status": "success", "message": "Test notification sent successfully."}
    except Exception as e:
        return {"status": "error", "message": str(e)}
