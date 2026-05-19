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
        except Exception as e:
            logger.error(f"Failed to send Telegram notification: {e}")

notifier = TelegramNotifier()
