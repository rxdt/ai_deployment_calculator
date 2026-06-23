"""Deployment report assembly: the display-ready contract the one-page web UI renders.

Bundles the VRAM component breakdown (W, KV, T, C from specs/vram_calculator.md) with the
final margin-applied total and the hardware options, so the PRIORITY 3 one-page UI can render
a whole deployment from one pure call instead of stitching the core modules together itself.
"""

from __future__ import annotations

from dataclasses import dataclass

from hardware import HardwareOption, recommend_hardware, recommended_host_ram_gb
from vram_calculator import (
    CUDA_TAX_GB,
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


def build_report(spec: DeploymentSpec) -> DeploymentReport:
    """Assemble the full display-ready report for one deployment spec from the pure core."""
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
        hardware=recommend_hardware(spec),
    )
