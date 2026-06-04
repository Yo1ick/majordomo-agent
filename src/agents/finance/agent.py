from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any

from src.agents.base import BaseAgent, ChatModel
from src.agents.finance.prompt import CATEGORIES, DEFAULT_CATEGORY, SYSTEM_PROMPT
from src.agents.finance.tools import write_expense
from src.database import Database
from src.extraction import ExtractionError, parse_json_object
from src.router import Intent


class FinanceAgentError(RuntimeError):
    """Raised when a finance message cannot be turned into an expense."""


@dataclass(frozen=True)
class FinanceAgent(BaseAgent):
    model: ChatModel
    db: Database

    def handle(self, intent: Intent, text: str) -> str:
        del intent
        payload = self._extract(text)
        merchant = self._required_text(payload.get("merchant"), "merchant")
        category = self._category(payload.get("category"))
        total_amount = self._amount_cents(payload.get("amount_yuan"))

        record = write_expense(
            self.db,
            merchant=merchant,
            total_amount=total_amount,
            category=category,
        )
        amount_yuan = Decimal(record.total_amount) / Decimal(100)
        return (
            f"记好了，{record.merchant} {amount_yuan:g} 元，"
            f"分类 {record.category}。哼，这种小账我当然不会漏。"
        )

    def _extract(self, text: str) -> dict[str, Any]:
        raw = self.model.chat(
            [
                {"role": "system", "content": self._system_prompt()},
                {"role": "user", "content": text},
            ],
            temperature=0,
        )
        try:
            return parse_json_object(raw)
        except ExtractionError as exc:
            raise FinanceAgentError(
                f"failed to parse finance extraction: {exc}"
            ) from exc

    @staticmethod
    def _system_prompt() -> str:
        soul = Path(__file__).with_name("soul.md").read_text(encoding="utf-8").strip()
        return f"{SYSTEM_PROMPT}\n\nPersona:\n{soul}"

    @staticmethod
    def _required_text(value: object, name: str) -> str:
        if not isinstance(value, str) or not value.strip():
            raise FinanceAgentError(f"{name} must be a non-empty string")
        return value.strip()

    @staticmethod
    def _category(value: object) -> str:
        if not isinstance(value, str):
            return DEFAULT_CATEGORY
        return value if value in CATEGORIES else DEFAULT_CATEGORY

    @staticmethod
    def _amount_cents(value: object) -> int:
        if isinstance(value, bool) or value is None:
            raise FinanceAgentError("amount_yuan must be a positive number")
        try:
            amount = Decimal(str(value))
        except (InvalidOperation, ValueError) as exc:
            raise FinanceAgentError("amount_yuan must be a positive number") from exc
        if amount <= 0:
            raise FinanceAgentError("amount_yuan must be positive")
        return int(
            (amount * Decimal(100)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        )
