from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Protocol

from src.router import Intent


class ChatModel(Protocol):
    """最小模型协议。

    Agent 只关心「给一组 OpenAI messages，拿回字符串」，不关心背后是 MLX、
    Ollama 还是云端 API。这样以后替换模型实现时，Agent 业务逻辑不用改。
    """

    def chat(self, messages: list[dict[str, str]], **kwargs: object) -> str:
        """Return the assistant text for the given conversation messages."""


class BaseAgent(ABC):
    """所有领域 agent 的共同接口。

    Phase 1 Week 1 只定义边界：core/router 负责决定把消息交给谁，agent 负责
    处理 intent + 原始文本。后续 finance/diet/fitness 可以继承这个接口并接入
    SQLite tools，但本周不放业务逻辑。
    """

    @abstractmethod
    def handle(self, intent: Intent, text: str) -> str:
        """Handle one routed user message and return user-facing text."""


@dataclass(frozen=True)
class EchoAgent(BaseAgent):
    """脚手架用 echo agent。

    如果注入了 model，就用模型生成回复；如果没有注入，就返回确定性文本。
    这样 CLI 在没有真实 LLM server 的开发机上也能跑通，而测试可以注入 mock。
    """

    model: ChatModel | None = None

    def handle(self, intent: Intent, text: str) -> str:
        if self.model is None:
            return f"[{intent.value}] echo: {text}"

        reply = self.model.chat(
            [
                {
                    "role": "system",
                    "content": "你是 majordomo-agent 的脚手架 echo agent。",
                },
                {"role": "user", "content": text},
            ]
        )
        return f"[{intent.value}] {reply}"
