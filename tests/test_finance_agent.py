from __future__ import annotations

from pathlib import Path

from src.agents.finance import FinanceAgent
from src.database import Database
from src.router import Intent
from tests.test_finance_tools import create_schema


class FakeModel:
    def __init__(self, response: str) -> None:
        self.response = response
        self.messages: list[dict[str, str]] = []

    def chat(self, messages: list[dict[str, str]], **kwargs: object) -> str:
        self.messages = messages
        assert kwargs["temperature"] == 0
        return self.response


def row_count(db: Database) -> int:
    with db.connect() as connection:
        row = connection.execute("SELECT COUNT(*) AS count FROM expenses").fetchone()
    return int(row["count"])


def latest_expense(db: Database) -> dict[str, object]:
    with db.connect() as connection:
        row = connection.execute(
            "SELECT * FROM expenses ORDER BY created_at DESC, id DESC LIMIT 1"
        ).fetchone()
    return dict(row)


def make_agent(
    tmp_path: Path, response: str
) -> tuple[FinanceAgent, Database, FakeModel]:
    db_path = tmp_path / "butler.db"
    create_schema(db_path)
    db = Database(path=db_path)
    model = FakeModel(response)
    return FinanceAgent(model=model, db=db), db, model


def test_finance_agent_writes_lunch_expense(tmp_path: Path) -> None:
    agent, db, model = make_agent(
        tmp_path,
        '{"amount_yuan": 30, "merchant": "麻辣烫", "category": "food_delivery"}',
    )

    reply = agent.handle(Intent.FINANCE, "午饭30块吃了麻辣烫")
    expense = latest_expense(db)

    assert row_count(db) == 1
    assert expense["total_amount"] == 3000
    assert expense["category"] == "food_delivery"
    assert expense["merchant"] == "麻辣烫"
    assert "麻辣烫" in reply
    assert "food_delivery" in reply
    assert "Persona:" in model.messages[0]["content"]


def test_finance_agent_falls_back_for_illegal_category(tmp_path: Path) -> None:
    agent, db, _model = make_agent(
        tmp_path,
        '{"amount_yuan": 18, "merchant": "奶茶", "category": "drink"}',
    )

    agent.handle(Intent.FINANCE, "奶茶18块")
    expense = latest_expense(db)

    assert expense["category"] == "other"


def test_finance_agent_converts_decimal_yuan_to_cents(tmp_path: Path) -> None:
    agent, db, _model = make_agent(
        tmp_path,
        '{"amount_yuan": 42.5, "merchant": "打车", "category": "transport"}',
    )

    agent.handle(Intent.FINANCE, "打车42.5元")
    expense = latest_expense(db)

    assert expense["total_amount"] == 4250
    assert expense["merchant"] == "打车"
    assert expense["category"] == "transport"
