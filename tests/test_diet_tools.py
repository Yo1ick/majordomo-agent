from __future__ import annotations

import json
from pathlib import Path

from src.agents.diet import SOURCE_MANUAL, USER_ID, write_meal
from src.database import Database
from tests.test_finance_tools import create_schema


def test_write_meal_inserts_and_deduplicates(tmp_path: Path) -> None:
    db_path = tmp_path / "butler.db"
    create_schema(db_path)
    db = Database(path=db_path)

    first = write_meal(
        db,
        meal_type="lunch",
        foods=("麻辣烫",),
        source=SOURCE_MANUAL,
    )
    second = write_meal(
        db,
        meal_type="lunch",
        foods=("麻辣烫",),
        source=SOURCE_MANUAL,
    )

    with db.connect() as connection:
        rows = connection.execute("SELECT * FROM meals").fetchall()

    assert len(rows) == 1
    assert first.inserted is True
    assert second.inserted is False
    assert second.id == first.id
    assert rows[0]["user_id"] == USER_ID
    assert rows[0]["meal_type"] == "lunch"
    assert rows[0]["source"] == SOURCE_MANUAL
    assert json.loads(rows[0]["note"]) == {"foods": ["麻辣烫"]}
