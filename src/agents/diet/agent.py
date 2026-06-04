from __future__ import annotations

import base64
import mimetypes
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

from src.agents.base import BaseAgent, ChatModel
from src.agents.diet.prompt import (
    DEFAULT_MEAL_TYPE,
    MEAL_TYPES,
    PHOTO_DIR,
    SOURCE_IMAGE,
    SOURCE_MANUAL,
    SYSTEM_PROMPT,
)
from src.agents.diet.tools import MealRecord, write_meal
from src.database import Database
from src.extraction import ExtractionError, parse_json_object
from src.model import ChatMessage, ContentPart
from src.router import Intent


class DietAgentError(RuntimeError):
    """Raised when a diet message cannot be turned into a meal."""


@dataclass(frozen=True)
class DietAgent(BaseAgent):
    model: ChatModel
    db: Database
    photo_dir: Path = PHOTO_DIR

    def handle(self, intent: Intent, text: str) -> str:
        del intent
        payload = self._extract_text(text)
        record = self._write_from_payload(payload, source=SOURCE_MANUAL)
        return self._reply(record)

    def handle_photo(self, image_path: str | Path, caption: str = "") -> str:
        stored_path = self._store_photo(Path(image_path))
        payload = self._extract_image(stored_path, caption)
        record = self._write_from_payload(
            payload,
            source=SOURCE_IMAGE,
            photo_path=stored_path.as_posix(),
        )
        return self._reply(record)

    def _extract_text(self, text: str) -> dict[str, Any]:
        return self._chat_and_parse(
            [
                {"role": "system", "content": self._system_prompt()},
                {"role": "user", "content": text},
            ]
        )

    def _extract_image(self, image_path: Path, caption: str) -> dict[str, Any]:
        content: list[ContentPart] = [
            {
                "type": "text",
                "text": caption or "请识别这张饮食照片中的食物并记录餐次。",
            },
            {"type": "image_url", "image_url": {"url": self._data_url(image_path)}},
        ]
        return self._chat_and_parse(
            [
                {"role": "system", "content": self._system_prompt()},
                {"role": "user", "content": content},
            ]
        )

    def _chat_and_parse(self, messages: list[ChatMessage]) -> dict[str, Any]:
        raw = self.model.chat(messages, temperature=0)
        try:
            return parse_json_object(raw)
        except ExtractionError as exc:
            raise DietAgentError(f"failed to parse diet extraction: {exc}") from exc

    def _write_from_payload(
        self,
        payload: dict[str, Any],
        *,
        source: str,
        photo_path: str | None = None,
    ) -> MealRecord:
        meal_type = self._meal_type(payload.get("meal_type"))
        foods = self._foods(payload.get("foods"))
        return write_meal(
            self.db,
            meal_type=meal_type,
            foods=foods,
            source=source,
            photo_path=photo_path,
        )

    @staticmethod
    def _system_prompt() -> str:
        soul = Path(__file__).with_name("soul.md").read_text(encoding="utf-8").strip()
        return f"{SYSTEM_PROMPT}\n\nPersona:\n{soul}"

    @staticmethod
    def _meal_type(value: object) -> str:
        if not isinstance(value, str):
            return DEFAULT_MEAL_TYPE
        return value if value in MEAL_TYPES else DEFAULT_MEAL_TYPE

    @staticmethod
    def _foods(value: object) -> tuple[str, ...]:
        if not isinstance(value, list):
            raise DietAgentError("foods must be a non-empty list")
        foods = tuple(
            item.strip() for item in value if isinstance(item, str) and item.strip()
        )
        if not foods:
            raise DietAgentError("foods must contain at least one food")
        return foods

    def _store_photo(self, image_path: Path) -> Path:
        if not image_path.is_file():
            raise DietAgentError(f"image path does not exist: {image_path}")
        self.photo_dir.mkdir(parents=True, exist_ok=True)
        suffix = image_path.suffix or ".jpg"
        target = self.photo_dir / f"{uuid4()}{suffix}"
        shutil.copy2(image_path, target)
        return target

    @staticmethod
    def _data_url(image_path: Path) -> str:
        mime_type = mimetypes.guess_type(image_path.name)[0] or "image/jpeg"
        encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
        return f"data:{mime_type};base64,{encoded}"

    @staticmethod
    def _reply(record: MealRecord) -> str:
        foods = ", ".join(_foods_from_note(record.note))
        prefix = "已经记好啦" if record.inserted else "这餐之前已经记过啦"
        return f"{prefix}：{record.meal_type}，{foods}。今天也有好好照顾自己呢。"


def _foods_from_note(note: str) -> tuple[str, ...]:
    payload = parse_json_object(note)
    value = payload.get("foods")
    if not isinstance(value, list):
        return ()
    return tuple(item for item in value if isinstance(item, str))
