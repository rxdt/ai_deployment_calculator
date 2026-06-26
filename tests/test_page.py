from __future__ import annotations

from web.fragments import (
    render_assumptions,
    render_breakdown,
    render_comparison_rows,
    render_hardware_rows,
    selected_class,
)
from web.page import render_page, selected_option, task_label
from web.presenter import FormInputs
from web.view import (
    AssumptionRow,
    BreakdownRow,
    ComparisonRow,
    DeploymentView,
    HardwareRow,
    PlanSummary,
    ResultTables,
)


def test_default_page_renders_required_controls_and_worked_total() -> None:
    html = render_page()
    assert '<form class="panel controls" method="get" aria-label="Deployment inputs">' in html
    assert 'name="parameters_b"' in html
    assert 'min="0.000001" step="any"' in html
    assert 'name="context_tokens"' in html
    assert 'name="weight_bits"' in html
    assert 'name="kv_cache_bits"' in html
    assert 'name="trained" type="checkbox"' in html
    assert 'name="use_adapter" type="checkbox"' in html
    assert "20.1 GB" in html
    assert "32 GB host RAM" in html
    assert "<summary>Calculation used</summary>" in html
    assert "<code>(16.0 + 0.8 + 0.0 + 1.5) * 1.10 = 20.1 GB</code>" in html
    assert "Safety margin" in html
    assert "10%" in html
    assert "CUDA/system tax" in html
    assert "KV cache heuristic" in html
    assert "Host RAM rule" in html
    assert 'aria-label="Quantization comparison"' in html
    assert "<td>32-bit</td>" in html
    assert "<td>37.7 GB</td>" in html
    assert "<td>16-bit</td>" in html
    assert "<td>11.3 GB</td>" in html
    assert "<td>13.2 GB</td>" in html
    assert all(
        fragment in html
        for fragment in (
            '<option value="32">32-bit</option>',
            'name="runtime"',
            '<option value="pytorch" selected>PyTorch</option>',
            '<option value="llama_cpp_gguf">llama.cpp GGUF</option>',
        )
    )


def test_default_page_keeps_dependent_controls_submittable_without_javascript() -> None:
    """The fallback page must let plain HTML submissions choose QLoRA or MoE."""
    html = render_page()
    active_parameters_input = (
        'name="active_parameters_b" type="number" min="0.000001" step="any"\n          value="1.3"'
    )

    assert 'name="architecture"' in html
    assert '<option value="moe">MoE</option>' in html
    assert 'name="active_parameters_b" type="number" min="0.000001" step="any"' in html
    assert f"{active_parameters_input}>" in html
    assert 'name="use_adapter" type="checkbox" disabled' not in html
    assert f"{active_parameters_input} disabled" not in html
    assert 'activeParameters.disabled = architecture.value !== "moe";' in html


def test_page_accepts_tiny_parameter_models_supported_by_core() -> None:
    html = render_page(
        FormInputs(parameters_b=0.0004, context_tokens=8000, weight_bits=8, kv_cache_bits=8, trained=True)
    )
    assert 'value="0.0004"' in html
    assert 'name="parameters_b" type="number" min="0.000001" step="any"' in html
    assert "1.7 GB" in html
    assert "<h2>Full training</h2>" in html


def test_page_preserves_high_precision_parameter_values() -> None:
    # `:g` truncated to six significant digits, so the no-JS form diverged from the full-precision
    # report and resubmitting it sized a different deployment than the URL computed.
    form = FormInputs(parameters_b=7.123456, context_tokens=8000, active_parameters_b=1.234567)
    html = render_page(form)
    assert 'name="parameters_b" type="number" min="0.000001" step="any"\n          value="7.123456"' in html
    assert (
        'name="active_parameters_b" type="number" min="0.000001" step="any"\n          value="1.234567"'
        in html
    )
    assert "7.12346" not in html


def test_page_preserves_large_parameter_values_without_exponent() -> None:
    # `:g` rendered large totals in exponential form (`1234567` -> `1.23457e+06`), which the
    # decimal-only query parser then reparsed to a different, rounded deployment.
    html = render_page(FormInputs(parameters_b=1234567, context_tokens=8000))
    assert 'value="1234567"' in html
    assert "e+06" not in html


def test_page_keeps_mobile_layout_to_one_viewport() -> None:
    html = render_page()
    assert "@media (max-width: 760px)" in html
    assert "body { overflow: auto; }" not in html
    assert "main { height: 100dvh;" in html


def test_page_uses_dark_theme_tokens() -> None:
    html = render_page()
    assert ":root { color-scheme: dark;" in html
    assert "body { margin: 0; min-height: 100vh; overflow: hidden;" in html
    assert "background: #0f172a; color: #e5edf7;" in html
    assert ".panel { border: 1px solid #243247; border-radius: 8px;" in html
    assert "background: #162033; padding: 18px;" in html
    assert ".total { font-size: 56px; line-height: .9; font-weight: 800; color: #2dd4bf; }" in html


def test_page_script_disables_adapter_until_training_is_enabled() -> None:
    html = render_page()
    assert 'name="use_adapter" type="checkbox" disabled' not in html
    assert "function syncAdapterControl()" in html
    assert "adapter.disabled = !trained.checked;" in html
    assert "adapter.checked = false;" in html


def test_page_clears_adapter_when_training_is_disabled() -> None:
    html = render_page(FormInputs(parameters_b=8, context_tokens=8000, trained=False, use_adapter=True))

    assert 'name="trained" type="checkbox" checked' not in html
    assert 'name="use_adapter" type="checkbox" checked disabled' not in html
    assert "<h2>Inference</h2>" in html


def test_page_selects_quantization_and_training_state() -> None:
    form = FormInputs(
        parameters_b=70,
        context_tokens=8000,
        weight_bits=4,
        kv_cache_bits=8,
        trained=True,
        use_adapter=True,
    )
    html = render_page(form)
    assert '<option value="4" selected>4-bit</option>' in html
    assert '<select name="kv_cache_bits">' in html
    assert '<option value="8" selected>8-bit</option>' in html
    assert 'name="trained" type="checkbox" checked' in html
    assert 'name="use_adapter" type="checkbox" checked' in html
    assert 'name="use_adapter" type="checkbox" checked disabled' not in html
    assert "<h2>QLoRA</h2>" in html


def test_page_selects_moe_architecture_and_active_parameters() -> None:
    html = render_page(
        FormInputs(
            parameters_b=47,
            context_tokens=8000,
            active_parameters_b=1.3,
        )
    )

    assert '<option value="moe" selected>MoE</option>' in html
    assert (
        'name="active_parameters_b" type="number" min="0.000001" step="any"\n          value="1.3">' in html
    )
    assert "<code>(94.0 + 1.3 + 0.0 + 1.5) * 1.10 = 106.5 GB</code>" in html


def test_page_selects_gguf_runtime_without_safety_margin() -> None:
    html = render_page(
        FormInputs(
            parameters_b=104, context_tokens=32000, weight_bits=4, kv_cache_bits=32, runtime="llama_cpp_gguf"
        )
    )

    assert '<option value="llama_cpp_gguf" selected>llama.cpp GGUF</option>' in html
    assert "136.7 GB" in html
    assert "<code>(52.0 + 83.2 + 0.0 + 1.5) * 1.00 = 136.7 GB</code>" in html


def test_page_renders_report_breakdown_and_hardware_rows() -> None:
    form = FormInputs(parameters_b=70, context_tokens=8000, weight_bits=4, trained=True, use_adapter=True)
    html = render_page(form)
    assert "52.3 GB" in html
    assert "64 GB host RAM" in html
    assert "Primary: A100 80GB (single GPU)" in html
    assert "Use an FP8 KV cache" not in html
    assert 'class="optimization"' not in html
    assert "<td>T4 16GB</td>" in html
    assert "<td>4x 16 GB</td>" in html
    assert "<td>RTX 4090</td>" in html
    assert "<td>L4 24GB</td>" in html
    assert "<td>3x 24 GB</td>" in html
    assert "<td>tensor parallel</td>" in html
    assert "<td>A100 80GB</td>" in html


def test_page_escapes_gpu_names() -> None:
    html = render_page(FormInputs(parameters_b=8, context_tokens=8000))
    assert "<td>H100 80GB</td>" in html
    assert "<td><" not in html


def test_page_labels_full_training() -> None:
    html = render_page(FormInputs(parameters_b=8, context_tokens=8000, trained=True))
    assert "<h2>Full training</h2>" in html


def test_page_helpers_render_labels_bits_and_escaped_rows() -> None:
    form = FormInputs(parameters_b=8, context_tokens=8000, weight_bits=8)
    view = DeploymentView(
        total_vram="20.1 GB",
        host_ram="32 GB host RAM",
        plan=PlanSummary(primary="GPU <A>", primary_fit="single GPU", optimization="Use <less> memory"),
        breakdown=(BreakdownRow("KV <cache>", "0.8 GB"),),
        tables=ResultTables(
            hardware=(HardwareRow("GPU <A>", "1x 24 GB", "single GPU"),),
            comparison=(ComparisonRow("8-<bit>", "11.3 GB", "8.8 GB", True),),
            assumptions=(AssumptionRow("Safety <margin>", "10%"),),
        ),
        calculation="(8.0 + 0.8 + 0.0 + 1.5) * 1.10 = 11.3 GB",
    )
    assert task_label(FormInputs(parameters_b=8, context_tokens=8000)) == "Inference"
    assert selected_option(form.weight_bits, 8) == " selected"
    assert not selected_option(form.weight_bits, 4)
    assert selected_option(FormInputs(parameters_b=8, context_tokens=8000, kv_cache_bits=4).kv_cache_bits, 4)
    assert selected_option("moe", "moe") == " selected"
    assert not selected_option("dense", "moe")
    assert selected_option("llama_cpp_gguf", "llama_cpp_gguf") == " selected"
    assert not selected_option("pytorch", "llama_cpp_gguf")
    assert selected_class(True) == ' class="selected"'
    assert not selected_class(False)
    assert render_breakdown(view) == '<p class="metric">KV &lt;cache&gt;<strong>0.8 GB</strong></p>'
    assert render_hardware_rows(view) == (
        "<tr><td>GPU &lt;A&gt;</td><td>1x 24 GB</td><td>single GPU</td></tr>"
    )
    assert render_comparison_rows(view) == (
        '<tr class="selected"><td>8-&lt;bit&gt;</td><td>11.3 GB</td><td>8.8 GB</td></tr>'
    )
    assert render_assumptions(view) == "<p>Safety &lt;margin&gt;: <strong>10%</strong></p>"
