from __future__ import annotations

from pathlib import Path


def frontend_text(path: str) -> str:
    return Path("frontend", path).read_text(encoding="utf-8")


def test_vite_frontend_declares_dev_entry_and_backend_proxy() -> None:
    package = frontend_text("package.json")
    index = frontend_text("index.html")
    config = frontend_text("vite.config.ts")

    assert '"dev": "vite --host 127.0.0.1"' in package
    assert '"test:e2e": "playwright test"' in package
    assert '"@playwright/test": "^1.45.0"' in package
    assert '"vite": "^5.4.0"' in package
    assert '<script type="module" src="/src/main.ts"></script>' in index
    assert '"/api": "http://127.0.0.1:8000"' in config


def test_vite_frontend_renders_required_controls_and_fetches_report_api() -> None:
    script = frontend_text("src/main.ts")
    styles = frontend_text("src/styles.css")

    assert "fetch(`/api/report?${search.toString()}`)" in script
    assert 'name="parameters_b"' in script
    assert 'min="0.000001" step="any"' in script
    assert 'name="context_tokens"' in script
    assert 'name="weight_bits"' in script
    assert 'name="kv_cache_bits"' in script
    assert 'name="trained" type="checkbox"' in script
    assert 'name="use_adapter" type="checkbox"' in script
    assert 'aria-label="Hardware recommendations"' in script
    assert 'aria-label="Quantization comparison"' in script
    assert "if (!response.ok)" in script
    assert 'role="alert"' in script
    assert "Unable to load report" in script
    assert "function escapeHtml(value: string): string" in script
    assert '.replace(/</g, "&lt;")' in script
    assert '.replace(/"/g, "&quot;")' in script
    assert "${escapeHtml(report.total_vram)}" in script
    assert "${escapeHtml(report.plan.optimization)}" in script
    assert "color-scheme: dark;" in styles
    assert "height: 100dvh;" in styles


def test_playwright_harness_exercises_rendered_form_and_report_api() -> None:
    config = frontend_text("playwright.config.ts")
    spec = frontend_text("tests/calculator.spec.ts")

    assert 'testDir: "./tests"' in config
    assert 'command: "npm run dev -- --port 5173"' in config
    assert 'baseURL: "http://127.0.0.1:5173"' in config
    assert 'page.route("**/api/report?**"' in spec
    assert 'page.locator(".total")' in spec
    assert 'page.getByLabel("Parameters (billions)").fill("70")' in spec
    assert 'searchParams.get("kv_cache_bits")).toBe("8")' in spec
    assert 'total_vram: "52.3 GB"' in spec
    assert 'page.locator(".optimization")' in spec
    assert "status: 503" in spec
    assert 'page.getByRole("alert")' in spec
    assert "escapes reflected query and report values" in spec
    assert 'await expect(page.locator("img")).toHaveCount(0)' in spec
