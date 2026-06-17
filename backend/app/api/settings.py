import os
import json
import httpx
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
    existing = _load_settings()
    merged = {**existing, **settings.model_dump()}
    _save_settings(merged)
    
    # Also update config and notifier instance
    from app.config import settings as app_settings
    from app.services.notification_service import notifier
    app_settings.TELEGRAM_BOT_TOKEN = settings.telegram_bot_token
    app_settings.TELEGRAM_CHAT_ID = settings.telegram_chat_id
    
    clean_token = settings.telegram_bot_token
    if clean_token and clean_token.lower().startswith("bot"):
        clean_token = clean_token[3:]
        
    notifier.bot_token = clean_token
    notifier.chat_id = settings.telegram_chat_id
    notifier.base_url = f"https://api.telegram.org/bot{notifier.bot_token}/sendMessage"
    
    return settings

@router.post("/test-notification")
async def test_notification():
    from app.services.notification_service import notifier
    if not notifier.bot_token or not notifier.chat_id:
        return {"status": "error", "message": "Telegram Bot Token or Chat ID is not configured."}
    try:
        await notifier.send("test", "🔔 This is a test notification from AutoTrader!")
        return {"status": "success", "message": "Test notification sent successfully."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/chat-updates")
async def get_chat_updates():
    """Proxy getUpdates to help user find the correct chat ID."""
    data = _load_settings()
    bot_token = data.get("telegram_bot_token", "")
    if not bot_token:
        return {"status": "error", "message": "Bot token not configured.", "chats": []}

    clean_token = bot_token
    if clean_token.lower().startswith("bot"):
        clean_token = clean_token[3:]

    url = f"https://api.telegram.org/bot{clean_token}/getUpdates"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params={"limit": 50, "offset": -50})
            resp.raise_for_status()
            result = resp.json()
    except httpx.HTTPStatusError as e:
        return {"status": "error", "message": f"Telegram API error {e.response.status_code}: {e.response.text}", "chats": []}
    except Exception as e:
        return {"status": "error", "message": str(e), "chats": []}

    updates = result.get("result", [])
    seen: dict[str, dict] = {}
    for update in updates:
        for key in ("message", "channel_post", "my_chat_member"):
            msg = update.get(key)
            if not msg:
                continue
            chat = msg.get("chat", {})
            cid = str(chat.get("id", ""))
            if cid and cid not in seen:
                name = chat.get("title") or f"{chat.get('first_name', '')} {chat.get('last_name', '')}".strip()
                seen[cid] = {"id": cid, "name": name, "type": chat.get("type", "")}

    return {"status": "ok", "chats": list(seen.values())}
