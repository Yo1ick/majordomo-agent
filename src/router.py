from __future__ import annotations

from enum import Enum


class Intent(str, Enum):
    """当前支持的粗粒度意图。

    先用 enum 固定 agent 边界，避免各处散落 magic string。后续 LLM router
    也应该返回这些稳定值，而不是让下游猜模型输出。
    """

    FINANCE = "finance"
    DIET = "diet"
    FITNESS = "fitness"
    ECHO = "echo"


class Router:
    """Intent router with a keyword stub and an LLM-ready interface.

    Week 1 的目标是把 orchestrator 边界搭出来，所以用可预测的关键词规则做
    stub。等真实模型联调时，可以在 `route_with_llm` 中复用 ModelClient，
    但对 core/agents 暴露的接口保持不变。
    """

    _finance_keywords = ("块", "元", "花了", "消费", "买了", "支出")
    _diet_keywords = ("吃了", "喝了", "早餐", "午饭", "晚饭", "加餐")
    _fitness_keywords = ("跑了", "公里", "健身", "训练", "游泳", "骑行")

    def route(self, text: str) -> Intent:
        """Route text by simple keyword matching."""
        normalized = text.strip()
        if self._contains_any(normalized, self._finance_keywords):
            return Intent.FINANCE
        if self._contains_any(normalized, self._diet_keywords):
            return Intent.DIET
        if self._contains_any(normalized, self._fitness_keywords):
            return Intent.FITNESS
        return Intent.ECHO

    def route_with_llm(self, text: str) -> Intent:
        """Future LLM router entry point.

        TODO: 用 ModelClient 让 OpenAI-compatible provider 输出结构化 intent，
        并在这里做白名单校验。现在先委托给关键词版，保证行为稳定可测试。
        """
        return self.route(text)

    @staticmethod
    def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
        return any(keyword in text for keyword in keywords)
