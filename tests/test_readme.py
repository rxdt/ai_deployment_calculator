"""Tests for the project README handoff."""

from __future__ import annotations

from pathlib import Path


def test_readme_describes_deployment_calculator() -> None:
    readme = Path("README.md").read_text(encoding="utf-8")
    assert readme.startswith("# AI Deployment Calculator")
    assert "total_vram_gb(spec) == 20.1" in readme
    assert "A Python Ralph Harness" not in readme
