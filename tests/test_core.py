from src.agents.base import EchoAgent
from src.core import ButlerCore, build_default_core, handle_message
from src.router import Router


class DummyModel:
    def chat(self, messages: list[dict[str, str]], **kwargs: object) -> str:
        assert messages[-1]["content"]
        return "model-ok"


def test_core_handle_message_routes_to_echo_agent() -> None:
    core = ButlerCore(router=Router(), agents={"diet": EchoAgent(model=DummyModel())})

    result = core.handle_message("今天吃了鸡胸肉")

    assert result == "[diet] model-ok"


def test_module_handle_message_is_callable(monkeypatch) -> None:
    core = ButlerCore(router=Router(), agents={"echo": EchoAgent(model=DummyModel())})
    monkeypatch.setattr("src.core.build_default_core", lambda: core)

    result = handle_message("只是闲聊一下")

    assert result.startswith("[echo]")


def test_default_core_uses_deterministic_echo() -> None:
    result = build_default_core().handle_message("跑了5公里")

    assert result == "[fitness] echo: 跑了5公里"
