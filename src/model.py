from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal, Protocol, TypeAlias

from openai import APIConnectionError, APIError, OpenAI

from src.config import Settings, get_settings

ProviderKind = Literal["local_mlx", "lan_ollama", "cloud"]
TextPart = dict[str, str]
ImagePart = dict[str, Any]
AudioPart = dict[str, Any]
ContentPart: TypeAlias = TextPart | ImagePart | AudioPart
MessageContent: TypeAlias = str | list[ContentPart]
ChatMessage: TypeAlias = dict[str, MessageContent]


@dataclass(frozen=True)
class Provider:
    """OpenAI-compatible provider description.

    MLX server、Ollama 和云端网关都可以讲 OpenAI-compatible 协议，所以这里
    不把 SDK 写死到 provider 类型里；只保存 base_url/api_key/model。调用层
    统一使用 `openai.OpenAI`，未来新增 provider 也只是新增配置。
    """

    name: str
    base_url: str
    api_key: str
    model: str
    kind: ProviderKind

    def __post_init__(self) -> None:
        if not self.name:
            raise ValueError("provider name must not be empty")
        if not self.base_url:
            raise ValueError(f"provider {self.name} base_url must not be empty")
        if not self.model:
            raise ValueError(f"provider {self.name} model must not be empty")


class OpenAIClientLike(Protocol):
    """Protocol for the small part of the OpenAI client used here."""

    chat: Any


class ModelError(RuntimeError):
    """Base class for model-layer failures."""


class UnknownProviderError(ModelError):
    """Raised when caller asks for a provider that is not configured."""


class ProviderConnectionError(ModelError):
    """Raised when a configured provider cannot be reached or called."""


class ModelResponseError(ModelError):
    """Raised when a provider returns a response without usable text."""


ClientFactory = Callable[..., OpenAIClientLike]


def load_providers(settings: Settings | None = None) -> dict[str, Provider]:
    """Build immutable provider objects from Settings.

    返回新的 dict，避免调用者意外修改全局配置。Provider 本身是 frozen dataclass，
    所以一旦创建就不能原地改；需要换模型或地址时，请从新的 Settings 重新构造。
    """
    current = settings or get_settings()
    providers = (
        Provider(
            name="mac-mlx",
            base_url=current.mac_mlx_base_url,
            api_key=current.mac_mlx_api_key,
            model=current.gemma_model,
            kind="local_mlx",
        ),
        Provider(
            name="win-ollama",
            base_url=current.resolved_win_ollama_base_url,
            api_key=current.win_ollama_api_key,
            model=current.gemma_model,
            kind="lan_ollama",
        ),
        Provider(
            name="cloud",
            base_url=current.cloud_base_url,
            api_key=current.cloud_api_key,
            model=current.cloud_model,
            kind="cloud",
        ),
    )
    return {provider.name: provider for provider in providers}


class ModelClient:
    """OpenAI-compatible model client facade.

    Agent 只调用 `chat(messages, provider_name=None)`。这里集中处理 provider
    选择、OpenAI client 创建和错误翻译，让上层不用知道 MLX/Ollama/cloud 的
    网络细节。provider_name 为空时使用 DEFAULT_PROVIDER。
    """

    def __init__(
        self,
        *,
        providers: Mapping[str, Provider] | None = None,
        default_provider: str | None = None,
        settings: Settings | None = None,
        client_factory: ClientFactory = OpenAI,
    ) -> None:
        current = settings or get_settings()
        self._providers = (
            dict(providers) if providers is not None else load_providers(current)
        )
        self._default_provider = default_provider or current.default_provider
        self._client_factory = client_factory

    def chat(
        self,
        messages: Sequence[ChatMessage],
        provider_name: str | None = None,
        **kw: object,
    ) -> str:
        """Return assistant text from the selected provider.

        `messages[*]["content"]` accepts plain text today and is typed to also
        allow OpenAI-style multimodal parts later. Gemma 4 E4B is served by
        mlx-vlm, so future diet photo/audio flows can reuse this same
        `/v1/chat/completions` path without changing the public method shape.

        TODO: 预留自动 fallback 顺序，例如 mac-mlx -> win-ollama -> cloud。
        TODO: 为图像/音频输入补充更精确的 content part TypedDict，并增加测试。
        Week 1 先显式报错，避免本地服务没起时静默切云端造成成本和隐私意外。
        """
        provider = self._select_provider(provider_name)
        client = self._client_factory(
            base_url=provider.base_url,
            api_key=provider.api_key or "not-needed",
        )

        try:
            completion = client.chat.completions.create(
                model=provider.model,
                messages=list(messages),
                **kw,
            )
        except (APIConnectionError, APIError) as exc:
            raise ProviderConnectionError(
                f"provider {provider.name!r} at {provider.base_url!r} is not reachable: {exc}"
            ) from exc

        content = completion.choices[0].message.content
        if not isinstance(content, str) or not content:
            raise ModelResponseError(
                f"provider {provider.name!r} returned an empty chat completion"
            )
        return content

    def _select_provider(self, provider_name: str | None) -> Provider:
        name = provider_name or self._default_provider
        provider = self._providers.get(name)
        if provider is None:
            available = ", ".join(sorted(self._providers))
            raise UnknownProviderError(
                f"provider {name!r} is not configured; available providers: {available}"
            )
        return provider
