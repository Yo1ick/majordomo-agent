import sqlite3

from src.database import Database


def test_database_lists_tables(tmp_path) -> None:
    db_path = tmp_path / "butler.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute("CREATE TABLE meals (id TEXT PRIMARY KEY)")

    assert Database(path=db_path).list_tables() == ["meals"]
