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
    assert '"vite": "^8.1.0"' in package
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
    assert "function normalizedState(search: URLSearchParams): FormState" in script
    assert "function searchFromState(state: FormState): URLSearchParams" in script
    assert 'aria-label="Hardware recommendations"' in script
    assert 'aria-label="Quantization comparison"' in script
    assert "if (!response.ok)" in script
    assert 'role="alert"' in script
    assert "Unable to load report" in script
    assert "function escapeHtml(value: string): string" in script
    assert all(
        fragment in script
        for fragment in (
            "function isReportPayload(value: unknown, selectedWeightBits: string): value is ReportPayload",
            'throw new Error("Report payload does not match the frontend contract")',
            'name="runtime"',
            'value="llama_cpp_gguf"',
            'aria-label="Deployment status"',
            "~/vram-calc",
            "value.hardware.length > 0",
            "const COMPARISON_ROW_COUNT = 4;",
            'const SUPPORTED_PRECISION_LABELS = new Set(["32-bit", "16-bit", "8-bit", "4-bit"]);',
            "value.comparison.length === COMPARISON_ROW_COUNT",
            "const ASSUMPTION_ROW_COUNT = 5;",
            "const REQUIRED_ASSUMPTION_LABELS = new Set([",
            'const REQUIRED_BREAKDOWN_LABELS = ["Weights", "KV cache", "Task", "CUDA/system"];',
            '"Safety margin",',
            "value.assumptions.length === ASSUMPTION_ROW_COUNT",
            "function hasRequiredBreakdownRows(rows: DisplayRow[]): boolean",
            "hasRequiredBreakdownRows(value.breakdown)",
            "function hasRequiredAssumptionRows(rows: DisplayRow[]): boolean",
            "rows.every((row) => row.value.trim().length > 0)",
            "hasRequiredAssumptionRows(value.assumptions)",
            "function hasSupportedComparisonRows(rows: ComparisonRow[], selectedWeightBits: string): boolean",
            "selectedRows[0].precision === `${selectedWeightBits}-bit`",
            "hasSupportedComparisonRows(value.comparison, selectedWeightBits)",
        )
    )
    assert '.replace(/</g, "&lt;")' in script
    assert '.replace(/"/g, "&quot;")' in script
    assert "${escapeHtml(report.total_vram)}" in script
    assert "${escapeHtml(report.plan.optimization)}" in script
    assert "color-scheme: dark;" in styles
    assert "height: 100dvh;" in styles


def test_vite_frontend_constrains_dense_report_panel() -> None:
    script = frontend_text("src/main.ts")
    styles = frontend_text("src/styles.css")

    assert 'class="panel report-panel" aria-label="Hardware recommendations"' in script
    assert ".report-panel" in styles
    assert "overflow: auto;" in styles


def test_vite_frontend_uses_reference_terminal_theme() -> None:
    """Pin the green-on-near-black monospace identity from the model_recommendation reference."""
    styles = frontend_text("src/styles.css")

    # Near-black background, not the prior slate blue.
    assert "#070b0a" in styles
    assert "#0f172a" not in styles
    # Monospace technical font, not Inter.
    assert "ui-monospace" in styles
    assert "Inter" not in styles
    # Green accent on the primary button and result total, not teal.
    assert "background: #22c55e;" in styles
    assert "color: #4ade80;" in styles
    assert "#14b8a6" not in styles
    assert "#2dd4bf" not in styles
    # Blue heading/label accents are replaced by green.
    assert "#93c5fd" not in styles
    assert "#60a5fa" not in styles
    # Reference-style terminal shell: status strip, grid background, results left/control panel right.
    assert ".terminal-bar" in styles
    assert "background-size: 40px 40px;" in styles
    assert 'grid-template-areas:\n    "status status"\n    "results controls";' in styles
    assert "grid-area: results;" in styles
    assert "grid-area: controls;" in styles


def test_vite_frontend_disables_adapter_until_training_is_enabled() -> None:
    script = frontend_text("src/main.ts")

    assert 'const adapterState = state.trained ? checked(state.use_adapter) : "";' in script
    assert 'const adapterDisabled = state.trained ? "" : " disabled";' in script
    assert "function syncAdapterControl(): void" in script
    assert "adapter.disabled = !trained.checked;" in script
    assert "adapter.checked = false;" in script
    assert 'target.name === "trained"' in script


def test_vite_frontend_disables_active_parameters_until_moe_is_selected() -> None:
    script = frontend_text("src/main.ts")

    assert 'name="architecture"' in script
    assert 'name="active_parameters_b"' in script
    assert (
        "function isValidActiveParameters(value: string | null, totalParameters: string): value is string"
        in script
    )
    assert 'const activeParametersDisabled = state.architecture === "moe" ? "" : " disabled";' in script
    assert 'activeParameters.disabled = architecture.value !== "moe";' in script
    assert "function syncArchitectureControl(): void" in script
    assert 'target.name === "architecture"' in script
    assert 'search.set("architecture", state.architecture);' in script
    assert 'search.set("active_parameters_b", state.active_parameters_b);' in script


def test_playwright_harness_declares_vite_server() -> None:
    config = frontend_text("playwright.config.ts")

    assert 'testDir: "./tests"' in config
    assert 'command: "npm run dev -- --port 5173"' in config
    assert 'baseURL: "http://127.0.0.1:5173"' in config


def test_playwright_harness_exercises_rendered_form_and_report_api() -> None:
    spec = frontend_text("tests/calculator.spec.ts")

    assert 'page.route("**/api/report?**"' in spec
    assert 'page.locator(".total")' in spec
    assert 'page.getByLabel("Parameters (billions)").fill("70")' in spec
    assert 'page.getByLabel("Architecture").selectOption("moe")' in spec
    assert 'page.getByLabel("Active parameters (billions)").fill("8")' in spec
    assert 'page.getByLabel("LoRA adapter")).toBeDisabled()' in spec
    assert 'page.getByLabel("LoRA adapter")).toBeEnabled()' in spec
    assert 'searchParams.get("architecture")).toBe("moe")' in spec
    assert 'searchParams.get("active_parameters_b")).toBe("8")' in spec
    assert 'total_vram: "52.3 GB"' in spec
    assert 'page.getByLabel("Assumptions")' in spec
    assert "KV cache heuristic" in spec
    assert "Host RAM rule" in spec
    assert "Supported precisions" in spec
    assert 'page.locator(".optimization")' in spec
    assert "status: 503" in spec
    assert 'page.getByRole("alert")' in spec
    assert all(
        fragment in spec
        for fragment in (
            "rejects malformed report payloads before rendering",
            'selected: "yes"',
            "rejects breakdown payloads with unexpected labels before rendering",
            'label: "Unknown subtotal"',
            "rejects empty hardware recommendations before rendering",
            "hardware: []",
            "rejects empty assumption summaries before rendering",
            "assumptions: []",
            "rejects assumption summaries with unexpected labels before rendering",
            'label: "Unknown assumption"',
            "rejects assumption summaries with empty values before rendering",
            'value: ""',
            "rejects partial quantization comparisons before rendering",
            "comparison: report.comparison.slice(0, 2)",
            "rejects ambiguous selected quantization comparisons before rendering",
            "selected: true",
            "rejects selected quantization comparisons that do not match the submitted precision",
            'selected: row.precision === "8-bit"',
            'searchParams.get("kv_cache_bits")).toBe("8")',
            'searchParams.get("runtime")).toBe("llama_cpp_gguf")',
        )
    )
    assert "escapes reflected query and report values" in spec
    assert 'await expect(page.locator("img")).toHaveCount(0)' in spec
    assert "clears adapter use when training is turned off" in spec
    assert "normalizes invalid query values before rendering and requesting a report" in spec
    assert all(
        fragment in spec
        for fragment in (
            "keeps the latest submitted report when an earlier request finishes late",
            "releaseStaleRequest",
            "13.0 GB",
            "70.0 GB",
        )
    )
