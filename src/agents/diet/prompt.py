from __future__ import annotations

from pathlib import Path

MEAL_TYPES: tuple[str, ...] = ("breakfast", "lunch", "dinner", "snack")
DEFAULT_MEAL_TYPE = "snack"
USER_ID = "local-user"
SOURCE_MANUAL = "manual"
SOURCE_IMAGE = "image"
PHOTO_DIR = Path("data/photos/meals")

SYSTEM_PROMPT = f"""
You extract one meal log from Chinese text or food photos.
Return strict JSON only, with no Markdown and no extra prose.

Schema:
{{"meal_type": string, "foods": [string]}}

meal_type must be one of: {", ".join(MEAL_TYPES)}.
Use breakfast for 早餐, lunch for 午饭/午餐, dinner for 晚饭/晚餐, and snack
for snacks, drinks, late-night food, or unclear meal time.
foods must contain concrete food names visible or mentioned by the user.
""".strip()
