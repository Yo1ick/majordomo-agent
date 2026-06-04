from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from src.agents.diet.prompt import SOURCE_IMAGE, SOURCE_MANUAL, USER_ID
from src.database import Database


@dataclass(frozen=True)
class MealRecord:
    id: str
    user_id: str
    date: str
    meal_type: str
    source: str
    dedup_key: str
    photo_path: str | None
    note: str
    inserted: bool


def write_meal(
    db: Database,
    *,
    meal_type: str,
    foods: tuple[str, ...],
    source: str,
    photo_path: str | None = None,
) -> MealRecord:
    if source not in {SOURCE_MANUAL, SOURCE_IMAGE}:
        raise ValueError("source must be manual or image")
    if not foods:
        raise ValueError("foods must not be empty")

    today = datetime.now(UTC).date().isoformat()
    normalized_foods = tuple(food.strip() for food in foods if food.strip())
    if not normalized_foods:
        raise ValueError("foods must not be blank")

    note = json.dumps({"foods": normalized_foods}, ensure_ascii=False)
    dedup_key = _dedup_key(today, meal_type, source, normalized_foods)
    record = MealRecord(
        id=str(uuid4()),
        user_id=USER_ID,
        date=today,
        meal_type=meal_type,
        source=source,
        dedup_key=dedup_key,
        photo_path=photo_path,
        note=note,
        inserted=True,
    )
    return _insert_or_get(db, record)


def _dedup_key(
    date: str,
    meal_type: str,
    source: str,
    foods: tuple[str, ...],
) -> str:
    raw = "|".join((USER_ID, date, meal_type, source, ",".join(foods)))
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"meal:{digest}"


def _insert_or_get(db: Database, record: MealRecord) -> MealRecord:
    query = """
        INSERT INTO meals (
            id, user_id, date, meal_type, source, dedup_key, photo_path, note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    values = (
        record.id,
        record.user_id,
        record.date,
        record.meal_type,
        record.source,
        record.dedup_key,
        record.photo_path,
        record.note,
    )
    with db.connect() as connection:
        try:
            connection.execute(query, values)
            connection.commit()
            return record
        except sqlite3.IntegrityError:
            existing = connection.execute(
                "SELECT * FROM meals WHERE dedup_key = ?",
                (record.dedup_key,),
            ).fetchone()
    if existing is None:
        raise RuntimeError("meal insert failed and no duplicate row was found")
    return MealRecord(
        id=str(existing["id"]),
        user_id=str(existing["user_id"]),
        date=str(existing["date"]),
        meal_type=str(existing["meal_type"]),
        source=str(existing["source"]),
        dedup_key=str(existing["dedup_key"]),
        photo_path=existing["photo_path"],
        note=str(existing["note"]),
        inserted=False,
    )
