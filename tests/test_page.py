from __future__ import annotations

from web.page import (
    render_breakdown,
    render_hardware_rows,
    render_page,
    selected_bits,
    task_label,
)
from web.presenter import FormInputs
from web.view import BreakdownRow, DeploymentView, HardwareRow


def test_default_page_renders_required_controls_and_worked_total() -> None:
    html = render_page()
    assert '<form class="panel controls" method="get" aria-label="Deployment inputs">' in html
    assert 'name="parameters_b"' in html
    assert 'name="context_tokens"' in html
    assert 'name="weight_bits"' in html
    assert 'name="kv_cache_bits"' in html
    assert 'name="trained" type="checkbox"' in html
    assert 'name="use_adapter" type="checkbox"' in html
    assert "20.1 GB" in html
    assert "32 GB host RAM" in html


def test_page_keeps_mobile_layout_to_one_viewport() -> None:
    html = render_page()
    assert "@media (max-width: 760px)" in html
    assert "body { overflow: auto; }" not in html
    assert "main { height: 100dvh;" in html


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
    assert "<h2>QLoRA</h2>" in html


def test_page_renders_report_breakdown_and_hardware_rows() -> None:
    form = FormInputs(parameters_b=70, context_tokens=8000, weight_bits=4, trained=True, use_adapter=True)
    html = render_page(form)
    assert "52.3 GB" in html
    assert "64 GB host RAM" in html
    assert "Primary: A100 80GB (single GPU)" in html
    assert "Use an FP8 KV cache" in html
    assert "<td>RTX 4090</td>" in html
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
        primary="GPU <A>",
        primary_fit="single GPU",
        optimization="Use <less> memory",
        breakdown=(BreakdownRow("KV <cache>", "0.8 GB"),),
        hardware=(HardwareRow("GPU <A>", "1x 24 GB", "single GPU"),),
    )
    assert task_label(FormInputs(parameters_b=8, context_tokens=8000)) == "Inference"
    assert selected_bits(form.weight_bits, 8) == " selected"
    assert not selected_bits(form.weight_bits, 4)
    assert selected_bits(FormInputs(parameters_b=8, context_tokens=8000, kv_cache_bits=4).kv_cache_bits, 4)
    assert render_breakdown(view) == '<p class="metric">KV &lt;cache&gt;<strong>0.8 GB</strong></p>'
    assert render_hardware_rows(view) == (
        "<tr><td>GPU &lt;A&gt;</td><td>1x 24 GB</td><td>single GPU</td></tr>"
    )
