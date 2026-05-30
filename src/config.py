from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment and optional `.env`.

    配置层只描述「有哪些值」，不创建网络客户端。这样测试可以直接构造
    Settings/Provider，生产则通过 `.env` 注入 provider 地址和密钥。
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    default_provider: str = Field(default="mac-mlx", alias="DEFAULT_PROVIDER")
    gemma_model: str = Field(default="gemma-4-e4b-it", alias="GEMMA_MODEL")

    mac_mlx_base_url: str = Field(
        default="http://localhost:8000/v1",
        alias="MAC_MLX_BASE_URL",
    )
    mac_mlx_api_key: str = Field(default="local-dev-key", alias="MAC_MLX_API_KEY")

    win_lan_ip: str = Field(default="127.0.0.1", alias="WIN_LAN_IP")
    win_ollama_base_url: str | None = Field(
        default=None,
        alias="WIN_OLLAMA_BASE_URL",
    )
    win_ollama_api_key: str = Field(
        default="ollama-dev-key",
        alias="WIN_OLLAMA_API_KEY",
    )

    cloud_base_url: str = Field(
        default="https://api.openai.com/v1",
        alias="CLOUD_BASE_URL",
    )
    cloud_api_key: str = Field(default="", alias="CLOUD_API_KEY")
    cloud_model: str = Field(default="gpt-4o-mini", alias="CLOUD_MODEL")

    database_path: str = Field(default="data/butler.db", alias="DATABASE_PATH")

    @property
    def resolved_win_ollama_base_url(self) -> str:
        """Prefer explicit URL, otherwise derive it from the LAN IP."""
        if self.win_ollama_base_url:
            return self.win_ollama_base_url
        return f"http://{self.win_lan_ip}:11434/v1"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings for app code.

    缓存可以避免每次请求都重新解析 `.env`。测试中如需不同配置，可以直接构造
    Settings 或清理这个 cache。
    """
    return Settings()
