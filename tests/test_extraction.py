from __future__ import annotations

import pytest

from src.extraction import ExtractionError, parse_json_object


def test_parse_json_object_accepts_pure_json() -> None:
    result = parse_json_object('{"amount_yuan": 30, "merchant": "麻辣烫"}')

    assert result["amount_yuan"] == 30
    assert result["merchant"] == "麻辣烫"


def test_parse_json_object_accepts_json_fence() -> None:
    raw = '```json\n{"amount_yuan": 30, "merchant": "麻辣烫"}\n```'

    result = parse_json_object(raw)

    assert result["merchant"] == "麻辣烫"


def test_parse_json_object_accepts_extra_text() -> None:
    raw = '提取结果如下：{"amount_yuan": 42.5, "merchant": "打车"} 好了。'

    result = parse_json_object(raw)

    assert result["amount_yuan"] == 42.5


def test_parse_json_object_raises_for_non_json() -> None:
    with pytest.raises(ExtractionError, match="JSON object"):
        parse_json_object("完全没有结构化数据")
