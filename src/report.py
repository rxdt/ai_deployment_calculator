"""Deployment report assembly: the display-ready contract the one-page web UI renders.

Bundles the VRAM component breakdown (W, KV, T, C from specs/vram_calculator.md) with the
final margin-applied total and the hardware options, so the PRIORITY 3 one-page UI can render
a whole deployment from one pure call instead of stitching the core modules together itself.
"""

from __future__ import annotations

from dataclasses import dataclass

from assumptions import AssumptionSummary, build_assumption_summary
from deployment_plan import DeploymentPlan, deployment_plan
from hardware import HardwareOption, recommended_host_ram_gb
from quantization_comparison import QuantizationComparison, quantization_comparison
from vram_calculator import (
    CUDA_TAX_GB,
    RUNTIME_MARGINS,
    SAFETY_MARGIN,
    DeploymentSpec,
    kv_cache_gb,
    task_overhead_gb,
    total_vram_gb,
    weights_gb,
)


@dataclass(frozen=True)
class VramBreakdown:
    """The four additive VRAM components in GB, before the safety margin is applied."""

    weights: float
    kv_cache: float
    task_overhead: float
    cuda_tax: float


@dataclass(frozen=True)
class DeploymentReport:
    """Display-ready sizing result: per-component breakdown, final total, and hardware options."""

    breakdown: VramBreakdown
    total_vram_gb: float
    host_ram_gb: int
    hardware: tuple[HardwareOption, ...]
    plan: DeploymentPlan
    assumptions: AssumptionSummary
    comparison: QuantizationComparison
    runtime_margin: float = SAFETY_MARGIN  # The actual (W+KV+T+C) multiplier this deployment used.


def build_report(spec: DeploymentSpec) -> DeploymentReport:
    """Assemble the full display-ready report for one deployment spec from the pure core."""
    plan = deployment_plan(spec)
    breakdown = VramBreakdown(
        weights=weights_gb(spec),
        kv_cache=kv_cache_gb(spec),
        task_overhead=task_overhead_gb(spec),
        cuda_tax=CUDA_TAX_GB,
    )
    return DeploymentReport(
        breakdown=breakdown,
        total_vram_gb=total_vram_gb(spec),
        host_ram_gb=recommended_host_ram_gb(spec),
        hardware=tuple(plan_option.option for plan_option in plan.options),
        plan=plan,
        assumptions=build_assumption_summary(spec),
        comparison=quantization_comparison(spec),
        runtime_margin=RUNTIME_MARGINS[spec.runtime],
    )
