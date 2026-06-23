"""Tests for the one-page view-model formatting the deployment report for display."""

from __future__ import annotations

from deployment_plan import OPTIMIZE_NONE, DeploymentPlan, PlanOption
from hardware import Gpu, HardwareOption
from report import DeploymentReport, VramBreakdown
from web.presenter import FormInputs
from web.view import (
    BreakdownRow,
    DeploymentView,
    HardwareRow,
    view_from_form,
    view_from_report,
)


def sample_report() -> DeploymentReport:
    # 8B / 16-bit / 8k / inference worked example from specs/vram_calculator.md.
    rtx = HardwareOption(gpu=Gpu("RTX 4090", 24.0), gpu_count=1, tensor_parallel=False)
    a100 = HardwareOption(gpu=Gpu("A100 80GB", 80.0), gpu_count=2, tensor_parallel=True)
    rtx_plan = PlanOption(option=rtx, fit="single_gpu")
    a100_plan = PlanOption(option=a100, fit="tensor_parallel")
    return DeploymentReport(
        breakdown=VramBreakdown(weights=16.0, kv_cache=0.8, task_overhead=0.0, cuda_tax=1.5),
        total_vram_gb=20.1,
        host_ram_gb=32,
        hardware=(rtx, a100),
        plan=DeploymentPlan(options=(rtx_plan, a100_plan), primary=rtx_plan, optimization=OPTIMIZE_NONE),
    )


def test_total_and_breakdown_are_formatted_to_one_decimal() -> None:
    view = view_from_report(sample_report())
    assert view.total_vram == "20.1 GB"
    assert view.host_ram == "32 GB host RAM"
    assert view.primary == "RTX 4090"
    assert view.primary_fit == "single GPU"
    assert view.optimization == OPTIMIZE_NONE
    assert view.breakdown == (
        BreakdownRow("Weights", "16.0 GB"),
        BreakdownRow("KV cache", "0.8 GB"),
        BreakdownRow("Task overhead", "0.0 GB"),
        BreakdownRow("CUDA tax", "1.5 GB"),
    )


def test_hardware_rows_label_count_capacity_and_sharding() -> None:
    view = view_from_report(sample_report())
    assert view.hardware == (
        HardwareRow(name="RTX 4090", detail="1x 24 GB", sharding="single GPU"),
        HardwareRow(name="A100 80GB", detail="2x 80 GB", sharding="tensor parallel"),
    )


def test_view_from_form_matches_view_from_report() -> None:
    form = FormInputs(parameters_b=8, context_tokens=8000)
    view = view_from_form(form)
    assert isinstance(view, DeploymentView)
    assert view.total_vram == "20.1 GB"
    assert view.host_ram == "32 GB host RAM"
    assert view.primary == "RTX 4090"
    assert view.primary_fit == "single GPU"
    # Every catalog GPU yields one display row.
    assert len(view.hardware) == 4
    assert view.hardware[0] == HardwareRow(name="RTX 4090", detail="1x 24 GB", sharding="single GPU")
