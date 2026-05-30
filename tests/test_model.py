from dataclasses import dataclass

import pytest

from src.config import Settings
from src.model import ModelClient, Provider, UnknownProviderError, load_providers


@dataclass(frozen=True)
class FakeMessage:
    content: str


@dataclass(frozen=True)
class FakeChoice:
    message: FakeMessage


@dataclass(frozen=True)
class FakeCompletion:
    choices: list[FakeChoice]


class FakeCompletions:
    def __init__(self, owner: "FakeOpenAI") -> None:
        self._owner = owner

    def create(self, **kwargs: object) -> FakeCompletion:
        self._owner.calls.append(kwargs)
        return FakeCompletion(choices=[FakeChoice(message=FakeMessage("pong"))])


class FakeChat:
    def __init__(self, owner: "FakeOpenAI") -> None:
        self.completions = FakeCompletions(owner)


class FakeOpenAI:
    instances: list["FakeOpenAI"] = []

    def __init__(self, *, base_url: str, api_key: str) -> None:
        self.base_url = base_url
        self.api_key = api_key
        self.calls: list[dict[str, object]] = []
        self.chat = FakeChat(self)
        FakeOpenAI.instances.append(self)


def providers() -> dict[str, Provider]:
    return {
        "mac-mlx": Provider(
            name="mac-mlx",
            base_url="http://localhost:8080/v1",
            api_key="local-key",
            model="gemma-4-e4b-it",
            kind="local_mlx",
        ),
        "cloud": Provider(
            name="cloud",
            base_url="https://example.test/v1",
            api_key="secret",
            model="cloud-model",
            kind="cloud",
        ),
    }


def test_chat_uses_default_provider_and_returns_string() -> None:
    FakeOpenAI.instances.clear()
    client = ModelClient(
        providers=providers(),
        default_provider="mac-mlx",
        client_factory=FakeOpenAI,
    )

    result = client.chat([{"role": "user", "content": "ping"}])

    assert result == "pong"
    assert FakeOpenAI.instances[0].base_url == "http://localhost:8080/v1"
    assert FakeOpenAI.instances[0].api_key == "local-key"
    assert FakeOpenAI.instances[0].calls[0]["model"] == "gemma-4-e4b-it"


def test_chat_can_select_named_provider() -> None:
    FakeOpenAI.instances.clear()
    client = ModelClient(
        providers=providers(),
        default_provider="mac-mlx",
        client_factory=FakeOpenAI,
    )

    result = client.chat(
        [{"role": "user", "content": "ping"}],
        provider_name="cloud",
        temperature=0,
    )

    assert result == "pong"
    assert FakeOpenAI.instances[0].base_url == "https://example.test/v1"
    assert FakeOpenAI.instances[0].api_key == "secret"
    assert FakeOpenAI.instances[0].calls[0]["model"] == "cloud-model"
    assert FakeOpenAI.instances[0].calls[0]["temperature"] == 0


def test_missing_provider_raises_clear_error() -> None:
    client = ModelClient(
        providers=providers(),
        default_provider="mac-mlx",
        client_factory=FakeOpenAI,
    )

    with pytest.raises(UnknownProviderError, match="missing"):
        client.chat([{"role": "user", "content": "ping"}], provider_name="missing")


def test_load_providers_builds_openai_compatible_provider_map() -> None:
    settings = Settings(
        _env_file=None,
        DEFAULT_PROVIDER="win-ollama",
        GEMMA_MODEL="gemma-test",
        MAC_MLX_BASE_URL="http://host.docker.internal:8080/v1",
        WIN_LAN_IP="192.168.1.8",
        WIN_OLLAMA_BASE_URL=None,
        CLOUD_BASE_URL="https://cloud.test/v1",
        CLOUD_API_KEY="cloud-key",
        CLOUD_MODEL="cloud-test",
    )

    loaded = load_providers(settings)

    assert set(loaded) == {"mac-mlx", "win-ollama", "cloud"}
    assert loaded["mac-mlx"].base_url == "http://host.docker.internal:8080/v1"
    assert loaded["win-ollama"].base_url == "http://192.168.1.8:11434/v1"
    assert loaded["cloud"].api_key == "cloud-key"
