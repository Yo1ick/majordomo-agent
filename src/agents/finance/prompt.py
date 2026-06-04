from __future__ import annotations

CATEGORIES: tuple[str, ...] = (
    "food_delivery",
    "food_ingredient",
    "transport",
    "shopping",
    "utility",
    "entertainment",
    "other",
)
DEFAULT_CATEGORY = "other"
USER_ID = "local-user"
SOURCE = "manual"

SYSTEM_PROMPT = f"""
You extract one manual expense from Chinese user text.
Return strict JSON only, with no Markdown and no extra prose.

Schema:
{{"amount_yuan": number, "merchant": string, "category": string}}

Category must be one of: {", ".join(CATEGORIES)}.
Use:
- food_delivery for meals, takeout, restaurants, snacks, drinks.
- food_ingredient for groceries or ingredients.
- transport for taxi, ride hailing, metro, bus, train, fuel, parking.
- shopping for general purchases.
- utility for rent, phone, power, water, gas, internet.
- entertainment for games, movies, shows, books, subscriptions.
- other when unsure.

Extract merchant as the concrete shop, item, or matter, such as "麻辣烫" or "打车".
Normalize Chinese amounts like "30块" to 30 and "42.5元" to 42.5.
""".strip()
