from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from src.agents.diet import DietAgent
from src.database import Database
from src.model import ChatMessage
from src.router import Intent
from tests.test_finance_tools import create_schema


class FakeDietModel:
    def __init__(self, response: str) -> None:
        self.response = response
        self.messages: Sequence[ChatMessage] = []

    def chat(self, messages: Sequence[ChatMessage], **kwargs: object) -> str:
        self.messages = messages
        assert kwargs["temperature"] == 0
        return self.response


def latest_meal(db: Database) -> dict[str, object]:
    with db.connect() as connection:
        row = connection.execute(
            "SELECT * FROM meals ORDER BY created_at DESC, id DESC LIMIT 1"
        ).fetchone()
    return dict(row)


def row_count(db: Database) -> int:
    with db.connect() as connection:
        row = connection.execute("SELECT COUNT(*) AS count FROM meals").fetchone()
    return int(row["count"])


def make_agent(
    tmp_path: Path,
    response: str,
) -> tuple[DietAgent, Database, FakeDietModel]:
    db_path = tmp_path / "butler.db"
    create_schema(db_path)
    db = Database(path=db_path)
    model = FakeDietModel(response)
    agent = DietAgent(model=model, db=db, photo_dir=tmp_path / "photos" / "meals")
    return agent, db, model


def test_diet_agent_writes_text_meal(tmp_path: Path) -> None:
    agent, db, model = make_agent(
        tmp_path,
        '{"meal_type": "lunch", "foods": ["麻辣烫"]}',
    )

    reply = agent.handle(Intent.DIET, "午饭吃了麻辣烫")
    meal = latest_meal(db)

    assert row_count(db) == 1
    assert meal["meal_type"] == "lunch"
    assert meal["source"] == "manual"
    assert meal["photo_path"] is None
    assert "麻辣烫" in str(meal["note"])
    assert "麻辣烫" in reply
    assert "Persona:" in str(model.messages[0]["content"])


def test_diet_agent_writes_photo_meal_with_image_part(tmp_path: Path) -> None:
    image_path = tmp_path / "meal.jpg"
    image_path.write_bytes(b"fake-jpeg-bytes")
    agent, db, model = make_agent(
        tmp_path,
        '{"meal_type": "dinner", "foods": ["米饭", "鸡胸肉"]}',
    )

    reply = agent.handle_photo(image_path, caption="晚饭")
    meal = latest_meal(db)
    user_content = model.messages[1]["content"]

    assert meal["meal_type"] == "dinner"
    assert meal["source"] == "image"
    assert isinstance(meal["photo_path"], str)
    assert Path(str(meal["photo_path"])).is_file()
    assert "鸡胸肉" in str(meal["note"])
    assert "鸡胸肉" in reply
    assert isinstance(user_content, list)
    assert user_content[1]["type"] == "image_url"
    assert user_content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_diet_agent_deduplicates_text_meals(tmp_path: Path) -> None:
    agent, db, _model = make_agent(
        tmp_path,
        '{"meal_type": "lunch", "foods": ["麻辣烫"]}',
    )

    first = agent.handle(Intent.DIET, "午饭吃了麻辣烫")
    second = agent.handle(Intent.DIET, "午饭吃了麻辣烫")

    assert row_count(db) == 1
    assert "已经记好" in first
    assert "之前已经记过" in second


def test_diet_agent_deduplicates_photo_meals(tmp_path: Path) -> None:
    image_path = tmp_path / "meal.jpg"
    image_path.write_bytes(b"fake-jpeg-bytes")
    agent, db, _model = make_agent(
        tmp_path,
        '{"meal_type": "dinner", "foods": ["米饭"]}',
    )

    agent.handle_photo(image_path)
    reply = agent.handle_photo(image_path)

    assert row_count(db) == 1
    assert "之前已经记过" in reply
