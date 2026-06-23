"""Tests for the display-ready deployment report assembler."""

from __future__ import annotations

import pytest

from hardware import recommend_hardware
from report import build_report
from vram_calculator import DeploymentSpec, total_vram_gb


def test_breakdown_matches_spec_worked_check() -> None:
    # specs/vram_calculator.md: 8B / 16-bit / 8k / inference -> W=16, KV=0.8, T=0, C=1.5, total 20.1.
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000)
    report = build_report(spec)
    assert report.breakdown.weights == pytest.approx(16.0)
    assert report.breakdown.kv_cache == pytest.approx(0.8)
    assert report.breakdown.task_overhead == pytest.approx(0.0)
    assert report.breakdown.cuda_tax == pytest.approx(1.5)
    assert report.total_vram_gb == pytest.approx(20.1)


def test_report_total_and_hardware_reuse_the_core() -> None:
    spec = DeploymentSpec(parameters_b=70, context_tokens=8000, weight_bits=4, task="qlora")
    report = build_report(spec)
    assert report.total_vram_gb == pytest.approx(total_vram_gb(spec))
    assert report.hardware == recommend_hardware(spec)
    assert report.hardware  # non-empty so the UI always has at least one option to render
