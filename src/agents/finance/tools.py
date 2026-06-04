from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from src.agents.finance.prompt import SOURCE, USER_ID
from src.database import Database


@dataclass(frozen=True)
class ExpenseRecord:
    id: str
    user_id: str
    merchant: str
    total_amount: int
    category: str
    source: str
    occurred_at: str


def write_expense(
    db: Database,
    *,
    merchant: str,
    total_amount: int,
    category: str,
) -> ExpenseRecord:
    if total_amount <= 0:
        raise ValueError("total_amount must be positive cents")
    if not merchant.strip():
        raise ValueError("merchant must not be empty")

    record = ExpenseRecord(
        id=str(uuid4()),
        user_id=USER_ID,
        merchant=merchant.strip(),
        total_amount=total_amount,
        category=category,
        source=SOURCE,
        occurred_at=datetime.now(UTC).isoformat(),
    )
    query = """
        INSERT INTO expenses (
            id, user_id, merchant, total_amount, category, source, occurred_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    values = (
        record.id,
        record.user_id,
        record.merchant,
        record.total_amount,
        record.category,
        record.source,
        record.occurred_at,
    )
    with db.connect() as connection:
        connection.execute(query, values)
        connection.commit()
    return record
