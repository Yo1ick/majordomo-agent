from __future__ import annotations

import builtins

from src import main_cli


class FakeCore:
    def handle_message(self, text: str) -> str:
        return f"fake-core: {text}"


def test_main_cli_runs_until_quit(monkeypatch) -> None:
    inputs = iter(["hello", "quit"])
    output: list[str] = []

    monkeypatch.setattr(main_cli, "build_default_core", lambda: FakeCore())
    monkeypatch.setattr(builtins, "input", lambda _: next(inputs))
    monkeypatch.setattr(
        builtins, "print", lambda *args: output.append(" ".join(map(str, args)))
    )

    main_cli.main()

    assert output[0].startswith("majordomo-agent CLI ready")
    assert "fake-core: hello" in output
