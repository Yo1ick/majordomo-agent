from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from src.agents.base import BaseAgent, EchoAgent
from src.agents.diet import DietAgent
from src.agents.finance import FinanceAgent
from src.database import Database
from src.model import ModelClient
from src.router import Intent, Router


@dataclass(frozen=True)
class ButlerCore:
    """I/O-free orchestration entry point.

    CLI、未来的飞书 webhook、测试都只需要把文本交给这里。core 不读 stdin、
    不写 stdout，也不碰 HTTP，这样入口层可以替换而不影响业务编排。
    """

    router: Router
    agents: Mapping[str, BaseAgent]

    def handle_message(self, text: str) -> str:
        intent = self.router.route(text)
        agent = self.agents.get(intent.value) or self.agents[Intent.ECHO.value]
        return agent.handle(intent, text)


def build_default_core() -> ButlerCore:
    """Build the default local core without making network calls."""
    model = ModelClient()
    db = Database.from_settings()
    echo_agent = EchoAgent()
    return ButlerCore(
        router=Router(),
        agents={
            Intent.FINANCE.value: FinanceAgent(model=model, db=db),
            Intent.DIET.value: DietAgent(model=model, db=db),
            Intent.FITNESS.value: echo_agent,
            Intent.ECHO.value: echo_agent,
        },
    )


def handle_message(text: str) -> str:
    """Module-level convenience wrapper used by simple entry points."""
    return build_default_core().handle_message(text)
