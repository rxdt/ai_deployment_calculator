"""Weight-precision comparison layer for quantization trade-offs.

Re-evaluates the existing VRAM equation at each supported weight precision while
holding context, KV-cache precision, and task fixed.
"""

from __future__ import annotations

from dataclasses import dataclass

from vram_calculator import Bits, DeploymentSpec, total_vram_gb

SUPPORTED_WEIGHT_BITS: tuple[Bits, ...] = (32, 16, 8, 4)


@dataclass(frozen=True)
class QuantizationComparisonRow:
    """One weight-precision scenario with total VRAM and savings versus 16-bit."""

    weight_bits: Bits
    total_gb: float
    savings_gb: float
    selected: bool


@dataclass(frozen=True)
class QuantizationComparison:
    """The supported weight precisions evaluated for one deployment."""

    rows: tuple[QuantizationComparisonRow, ...]


def with_weight_bits(spec: DeploymentSpec, weight_bits: Bits) -> DeploymentSpec:
    """Return the same deployment with only weight precision changed."""
    return spec.model_copy(update={"weight_bits": weight_bits})


def quantization_comparison(spec: DeploymentSpec) -> QuantizationComparison:
    """Compare VRAM totals for each supported weight precision."""
    totals = {
        weight_bits: total_vram_gb(with_weight_bits(spec, weight_bits))
        for weight_bits in SUPPORTED_WEIGHT_BITS
    }
    baseline = totals[16]
    return QuantizationComparison(
        rows=tuple(
            QuantizationComparisonRow(
                weight_bits=weight_bits,
                total_gb=totals[weight_bits],
                savings_gb=round(baseline - totals[weight_bits], 1),
                selected=spec.weight_bits == weight_bits,
            )
            for weight_bits in SUPPORTED_WEIGHT_BITS
        )
    )
