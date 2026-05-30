from src.router import Intent, Router


def test_keyword_routes_finance() -> None:
    assert Router().route("午饭花了30块") == Intent.FINANCE


def test_keyword_routes_diet() -> None:
    assert Router().route("今天吃了麻辣烫") == Intent.DIET


def test_keyword_routes_fitness() -> None:
    assert Router().route("跑了5公里") == Intent.FITNESS


def test_unknown_text_routes_echo() -> None:
    assert Router().route("只是闲聊一下") == Intent.ECHO
