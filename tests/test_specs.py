from __future__ import annotations

from pathlib import Path


def test_specs_do_not_include_template_placeholder() -> None:
    spec_text = "\n".join(path.read_text(encoding="utf-8") for path in Path("specs").glob("*.md"))
    assert "Example Spec" not in spec_text
    assert "DELETE OR REPLACE" not in spec_text


def test_specs_include_priority_and_acceptance_signals() -> None:
    for path in Path("specs").glob("*.md"):
        spec_text = path.read_text(encoding="utf-8")
        assert "PRIORITY" in spec_text, path
        assert "## Acceptance" in spec_text, path


def test_core_keeps_the_only_pydantic_model() -> None:
    pydantic_users = {
        path.as_posix()
        for path in Path("src").rglob("*.py")
        if "pydantic" in path.read_text(encoding="utf-8")
    }
    assert pydantic_users == {"src/vram_calculator.py"}
