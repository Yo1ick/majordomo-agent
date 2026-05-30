from __future__ import annotations

from src.core import build_default_core


def main() -> None:
    """Run a minimal stdin/stdout chat loop for Phase 1 scaffolding."""
    core = build_default_core()
    print("majordomo-agent CLI ready. Type 'exit' or 'quit' to leave.")

    while True:
        try:
            text = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if text.lower() in {"exit", "quit"}:
            break
        if not text:
            continue

        print(core.handle_message(text))


if __name__ == "__main__":
    main()
