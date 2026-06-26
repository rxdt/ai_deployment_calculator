"""Tests for the display-ready deployment report assembler."""

from __future__ import annotations

import pytest

from assumptions import build_assumption_summary
from deployment_plan import deployment_plan
from hardware import recommend_hardware, recommended_host_ram_gb
from quantization_comparison import quantization_comparison
from report import build_report
from vram_calculator import DeploymentSpec, total_vram_gb


def test_breakdown_matches_spec_worked_check() -> None:
    # Worked example: 8B / 16-bit / 8k / inference -> W=16, KV=0.8, T=0, C=1.5, total 20.1.
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000)
    report = build_report(spec)
    assert report.breakdown.weights == pytest.approx(16.0)
    assert report.breakdown.kv_cache == pytest.approx(0.8)
    assert report.breakdown.task_overhead == pytest.approx(0.0)
    assert report.breakdown.cuda_tax == pytest.approx(1.5)
    assert report.total_vram_gb == pytest.approx(20.1)
    assert report.host_ram_gb == 32


def test_report_total_hardware_and_host_ram_reuse_the_core() -> None:
    spec = DeploymentSpec(parameters_b=70, context_tokens=8000, weight_bits=4, task="qlora")
    report = build_report(spec)
    assert report.total_vram_gb == pytest.approx(total_vram_gb(spec))
    assert report.host_ram_gb == recommended_host_ram_gb(spec)
    assert report.hardware == recommend_hardware(spec)
    assert report.plan == deployment_plan(spec)
    assert report.assumptions == build_assumption_summary(spec)
    assert report.plan.primary.option.gpu.name == "A100 80GB"
    assert report.hardware  # non-empty so the UI always has at least one option to render
    assert report.comparison == quantization_comparison(spec)


def test_report_exposes_supported_precision_comparison_flagging_the_selected_row() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000)
    rows = build_report(spec).comparison.rows
    assert [(row.weight_bits, row.total_gb) for row in rows] == [(32, 37.7), (16, 20.1), (8, 11.3), (4, 6.9)]
    assert [row.weight_bits for row in rows if row.selected] == [16]
