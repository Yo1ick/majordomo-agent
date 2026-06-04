from __future__ import annotations

import json
import re
from typing import Any


class ExtractionError(ValueError):
    """Raised when structured data cannot be extracted from model text."""


def parse_json_object(raw: str) -> dict[str, Any]:
    """Parse one JSON object from LLM text.

    Model output is useful but not trustworthy as a transport format: even when
    prompted for strict JSON, it can include Markdown fences or short prose. We
    first try ``json.loads`` because valid JSON should stay on the precise,
    standards-compliant path. Only if that fails do we fall back to extracting
    the first ``{...}`` block with a regex and parsing that candidate.
    """
    stripped = raw.strip()
    direct = _loads_object(stripped)
    if direct is not None:
        return direct

    match = re.search(r"\{.*?\}", stripped, flags=re.DOTALL)
    if match is None:
        raise ExtractionError("model response did not contain a JSON object")

    extracted = _loads_object(match.group(0))
    if extracted is None:
        raise ExtractionError("model response contained invalid JSON object")
    return extracted


def _loads_object(candidate: str) -> dict[str, Any] | None:
    try:
        value = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    if not isinstance(value, dict):
        raise ExtractionError("model response JSON must be an object")
    return value
