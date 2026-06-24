"""Fixed calculator assumptions exposed for reports and compact UI display."""

from __future__ import annotations

from dataclasses import dataclass

from hardware import HOST_RAM_FLOOR_GB, HOST_RAM_STEP_GB
from vram_calculator import CUDA_TAX_GB, SAFETY_MARGIN, DeploymentSpec

DENSE_KV_HEURISTIC = "(parameters / 10) * (context_k / 8)"
MOE_KV_HEURISTIC = "active_parameters * (context_k / 8)"


@dataclass(frozen=True)
class Assumption:
    """One named calculator assumption and its audit-ready value."""

    label: str
    value: str


@dataclass(frozen=True)
class AssumptionSummary:
    """The fixed assumptions that shape every deployment estimate."""

    items: tuple[Assumption, ...]


def build_assumption_summary(spec: DeploymentSpec) -> AssumptionSummary:
    """Return the fixed assumptions behind the calculator formulas for this deployment.

    The KV-cache heuristic differs by architecture: MoE deployments size KV from the
    active parameters, so the displayed formula matches what the core actually computes.
    """
    safety_margin_percent = round((SAFETY_MARGIN - 1) * 100)
    kv_heuristic = MOE_KV_HEURISTIC if spec.architecture == "moe" else DENSE_KV_HEURISTIC
    return AssumptionSummary(
        items=(
            Assumption("Safety margin", f"{safety_margin_percent}%"),
            Assumption("CUDA/system tax", f"{CUDA_TAX_GB:.1f} GB"),
            Assumption("KV cache heuristic", kv_heuristic),
            Assumption(
                "Host RAM rule",
                f"at least {HOST_RAM_FLOOR_GB} GB, rounded up in {HOST_RAM_STEP_GB} GB increments",
            ),
            Assumption("Supported precisions", "32-bit, 16-bit, 8-bit, and 4-bit weights and KV cache"),
        )
    )
