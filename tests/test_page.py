from __future__ import annotations

from web.page import render_page
from web.presenter import FormInputs


def test_default_page_renders_required_controls_and_worked_total() -> None:
    html = render_page()
    assert '<form class="panel controls" aria-label="Deployment inputs">' in html
    assert 'name="parameters_b"' in html
    assert 'name="context_tokens"' in html
    assert 'name="weight_bits"' in html
    assert 'name="trained" type="checkbox"' in html
    assert 'name="use_adapter" type="checkbox"' in html
    assert "20.1 GB" in html


def test_page_keeps_mobile_layout_to_one_viewport() -> None:
    html = render_page()
    assert "@media (max-width: 760px)" in html
    assert "body { overflow: auto; }" not in html
    assert "main { height: 100dvh;" in html


def test_page_selects_quantization_and_training_state() -> None:
    form = FormInputs(parameters_b=70, context_tokens=8000, weight_bits=4, trained=True, use_adapter=True)
    html = render_page(form)
    assert '<option value="4" selected>4-bit</option>' in html
    assert 'name="trained" type="checkbox" checked' in html
    assert 'name="use_adapter" type="checkbox" checked' in html
    assert "<h2>QLoRA</h2>" in html


def test_page_renders_report_breakdown_and_hardware_rows() -> None:
    form = FormInputs(parameters_b=70, context_tokens=8000, weight_bits=4, trained=True, use_adapter=True)
    html = render_page(form)
    assert "52.3 GB" in html
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
