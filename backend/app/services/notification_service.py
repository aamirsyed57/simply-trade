import httpx
import logging
from abc import ABC, abstractmethod
from app.config import settings

logger = logging.getLogger(__name__)

class NotificationService(ABC):
    @abstractmethod
    async def send(self, event_type: str, message: str):
        pass

class TelegramNotifier(NotificationService):
    def __init__(self):
        self.bot_token = settings.TELEGRAM_BOT_TOKEN
        self.chat_id = settings.TELEGRAM_CHAT_ID
        
        # Fallback to settings.json if not in env
        import os
        import json
        if not self.bot_token and os.path.exists("settings.json"):
            with open("settings.json", "r") as f:
                data = json.load(f)
                self.bot_token = data.get("telegram_bot_token", "")
                self.chat_id = data.get("telegram_chat_id", "")

        if self.bot_token and self.bot_token.lower().startswith("bot"):
            self.bot_token = self.bot_token[3:]

        self.base_url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"

    async def send(self, event_type: str, message: str):
        if not self.bot_token or not self.chat_id:
            logger.debug(f"Telegram not configured, skipping {event_type} notification.")
            return

        formatted_msg = f"<b>[{event_type.upper()}]</b>\n{message}"
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    self.base_url,
                    json={
                        "chat_id": self.chat_id,
                        "text": formatted_msg,
                        "parse_mode": "HTML"
                    },
                    timeout=5.0
                )
                resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            error_details = e.response.text
            logger.error(f"Telegram API error {e.response.status_code}: {error_details}")
            raise Exception(f"Telegram API returned {e.response.status_code}: {error_details}")
        except Exception as e:
            logger.error(f"Failed to send Telegram notification: {e}")
            raise

notifier = TelegramNotifier()
