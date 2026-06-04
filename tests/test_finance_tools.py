from __future__ import annotations

import sqlite3
from pathlib import Path

from src.agents.finance import SOURCE, USER_ID, write_expense
from src.database import Database


def create_schema(db_path: Path) -> None:
    schema = Path("data/schema.sql").read_text(encoding="utf-8")
    with sqlite3.connect(db_path) as connection:
        connection.executescript(schema)


def test_write_expense_inserts_complete_record(tmp_path: Path) -> None:
    db_path = tmp_path / "butler.db"
    create_schema(db_path)
    db = Database(path=db_path)

    record = write_expense(
        db,
        merchant="麻辣烫",
        total_amount=3000,
        category="food_delivery",
    )

    with db.connect() as connection:
        row = connection.execute(
            "SELECT * FROM expenses WHERE id = ?",
            (record.id,),
        ).fetchone()

    assert row["id"] == record.id
    assert row["user_id"] == USER_ID
    assert row["merchant"] == "麻辣烫"
    assert row["total_amount"] == 3000
    assert row["category"] == "food_delivery"
    assert row["source"] == SOURCE
    assert row["occurred_at"] == record.occurred_at
    assert row["created_at"]
    assert row["pay_channel"] is None
    assert row["pay_method"] is None
