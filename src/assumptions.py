"""Fixed calculator assumptions exposed for reports and compact UI display."""

from __future__ import annotations

from dataclasses import dataclass

from hardware import HOST_RAM_FLOOR_GB, HOST_RAM_STEP_GB
from vram_calculator import CUDA_TAX_GB, SAFETY_MARGIN


@dataclass(frozen=True)
class Assumption:
    """One named calculator assumption and its audit-ready value."""

    label: str
    value: str


@dataclass(frozen=True)
class AssumptionSummary:
    """The fixed assumptions that shape every deployment estimate."""

    items: tuple[Assumption, ...]


def build_assumption_summary() -> AssumptionSummary:
    """Return the fixed assumptions behind the calculator formulas."""
    safety_margin_percent = round((SAFETY_MARGIN - 1) * 100)
    return AssumptionSummary(
        items=(
            Assumption("Safety margin", f"{safety_margin_percent}%"),
            Assumption("CUDA/system tax", f"{CUDA_TAX_GB:.1f} GB"),
            Assumption("KV cache heuristic", "(parameters / 10) * (context_k / 8)"),
            Assumption(
                "Host RAM rule",
                f"at least {HOST_RAM_FLOOR_GB} GB, rounded up in {HOST_RAM_STEP_GB} GB increments",
            ),
            Assumption("Supported precisions", "32-bit, 16-bit, 8-bit, and 4-bit weights and KV cache"),
        )
    )
