from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from src.config import get_settings


@dataclass(frozen=True)
class Database:
    """Small SQLite access wrapper.

    这里不迁移、不改 schema，只封装连接方式并给一个只读查询示例。后续 agent
    tools 可以依赖这个边界，而不是到处直接 `sqlite3.connect(...)`。
    """

    path: Path

    @classmethod
    def from_settings(cls) -> "Database":
        return cls(path=Path(get_settings().database_path))

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        try:
            connection.execute("PRAGMA foreign_keys = ON")
            yield connection
        finally:
            connection.close()

    def list_tables(self) -> list[str]:
        """Example read query for smoke checks and future diagnostics."""
        query = "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        with self.connect() as connection:
            rows = connection.execute(query).fetchall()
        return [str(row["name"]) for row in rows]
