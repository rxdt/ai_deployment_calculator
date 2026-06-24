from __future__ import annotations

from pathlib import Path


def frontend_text(path: str) -> str:
    return Path("frontend", path).read_text(encoding="utf-8")


def test_vite_frontend_declares_dev_entry_and_backend_proxy() -> None:
    package = frontend_text("package.json")
    index = frontend_text("index.html")
    config = frontend_text("vite.config.ts")

    assert '"dev": "vite --host 127.0.0.1"' in package
    assert '"vite": "^5.4.0"' in package
    assert '<script type="module" src="/src/main.ts"></script>' in index
    assert '"/api": "http://127.0.0.1:8000"' in config


def test_vite_frontend_renders_required_controls_and_fetches_report_api() -> None:
    script = frontend_text("src/main.ts")
    styles = frontend_text("src/styles.css")

    assert "fetch(`/api/report?${search.toString()}`)" in script
    assert 'name="parameters_b"' in script
    assert 'name="context_tokens"' in script
    assert 'name="weight_bits"' in script
    assert 'name="kv_cache_bits"' in script
    assert 'name="trained" type="checkbox"' in script
    assert 'name="use_adapter" type="checkbox"' in script
    assert 'aria-label="Hardware recommendations"' in script
    assert 'aria-label="Quantization comparison"' in script
    assert "color-scheme: dark;" in styles
    assert "height: 100dvh;" in styles
