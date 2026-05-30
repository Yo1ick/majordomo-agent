import builtins

from src import main_cli


def test_main_cli_runs_until_quit(monkeypatch) -> None:
    inputs = iter(["午饭花了30块", "quit"])
    output: list[str] = []

    monkeypatch.setattr(builtins, "input", lambda _: next(inputs))
    monkeypatch.setattr(builtins, "print", lambda *args: output.append(" ".join(map(str, args))))

    main_cli.main()

    assert output[0].startswith("majordomo-agent CLI ready")
    assert "[finance] echo: 午饭花了30块" in output
