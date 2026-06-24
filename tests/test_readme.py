"""Tests for the project README handoff."""

from __future__ import annotations

from pathlib import Path


def test_readme_describes_deployment_calculator() -> None:
    readme = Path("README.md").read_text(encoding="utf-8")
    assert readme.startswith("# AI Deployment Calculator")
    assert "total_vram_gb(spec) == 20.1" in readme
    assert "from deployment_plan import deployment_plan" in readme
    assert 'plan.primary.option.gpu.name == "A100 80GB"' in readme
    assert "from quantization_comparison import quantization_comparison" in readme
    assert "(32, 37.7, -17.6, False)" in readme
    assert "(8, 11.3, 8.8, False)" in readme
    assert "Primary: A100 80GB (single GPU)" in readme
    assert "3x 24 GB" in readme
    assert "tensor parallel" in readme
    assert "uv run uvicorn --app-dir src web.server:app --host 127.0.0.1 --port 8000" in readme
    assert "cd frontend && npm ci && npm run dev -- --port 5173" in readme
    assert "http://127.0.0.1:5173" in readme
    assert "A Python Ralph Harness" not in readme
