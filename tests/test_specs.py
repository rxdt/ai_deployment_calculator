from __future__ import annotations

from pathlib import Path


def test_specs_do_not_include_template_placeholder() -> None:
    spec_text = "\n".join(path.read_text(encoding="utf-8") for path in Path("specs").glob("*.md"))
    assert "Example Spec" not in spec_text
    assert "DELETE OR REPLACE" not in spec_text
