"""Deployment-plan layer: turn VRAM/hardware sizing into one actionable plan.

Labels how each catalog GPU fits, chooses a single primary recommendation, and
surfaces the highest-impact memory optimization. Pure functions over
`DeploymentSpec`; the output is typed dataclasses only, reusing the existing
hardware layer instead of adding a second Pydantic model.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from hardware import HardwareOption, recommend_hardware
from vram_calculator import DeploymentSpec

FitLabel = Literal["single_gpu", "tensor_parallel", "large_shard"]

MAX_TENSOR_PARALLEL_CARDS = 4  # Past this a single deployment is an awkward large shard.
LOWEST_WEIGHT_BITS = 4  # Weights are already at the lowest supported precision.
FP8_KV_BITS = 8  # KV cache can drop to 8-bit (FP8) before precision loss bites.

OPTIMIZE_WEIGHTS = "Lower weight precision (8-bit or 4-bit) to shrink the model weights first."
OPTIMIZE_KV_CACHE = "Use an FP8 KV cache to shrink long-context memory that weight quantization can't."
OPTIMIZE_SHARDING = "Reduce the context window or move to larger-memory GPUs to avoid tensor parallelism."
OPTIMIZE_NONE = "No memory optimization needed; the deployment already fits a single card."


@dataclass(frozen=True)
class PlanOption:
    """A catalog hardware option annotated with how the deployment fits it."""

    option: HardwareOption
    fit: FitLabel


@dataclass(frozen=True)
class DeploymentPlan:
    """Actionable plan: every option's fit, the primary pick, and one optimization note."""

    options: tuple[PlanOption, ...]
    primary: PlanOption
    optimization: str


def fit_label(option: HardwareOption) -> FitLabel:
    """Classify a hardware option: one card, tensor parallel (2-4 cards), or a large shard."""
    if option.gpu_count == 1:
        return "single_gpu"
    if option.gpu_count <= MAX_TENSOR_PARALLEL_CARDS:
        return "tensor_parallel"
    return "large_shard"


def primary_key(indexed: tuple[int, PlanOption]) -> tuple[int, bool, int]:
    """Sort key matching the spec precedence: fewest cards, then no sharding, then catalog order."""
    index, plan = indexed
    return (plan.option.gpu_count, plan.option.tensor_parallel, index)


def optimization_note(spec: DeploymentSpec, primary: PlanOption) -> str:
    """Pick the single highest-impact memory lever for this deployment, by spec priority order.

    Sharding advice keys off the recommended (primary) plan, not the weakest catalog card, so a
    deployment that already fits one large-memory GPU is never told to avoid tensor parallelism.
    """
    if spec.weight_bits > LOWEST_WEIGHT_BITS:
        return OPTIMIZE_WEIGHTS
    if spec.kv_cache_bits > FP8_KV_BITS and spec.context_tokens > 0:
        return OPTIMIZE_KV_CACHE
    if primary.option.tensor_parallel:
        return OPTIMIZE_SHARDING
    return OPTIMIZE_NONE


def deployment_plan(spec: DeploymentSpec) -> DeploymentPlan:
    """Build the actionable deployment plan: labeled options, the primary pick, and one note."""
    options = recommend_hardware(spec)
    plan_options = tuple(PlanOption(option=option, fit=fit_label(option)) for option in options)
    primary = min(enumerate(plan_options), key=primary_key)[1]
    return DeploymentPlan(
        options=plan_options,
        primary=primary,
        optimization=optimization_note(spec, primary),
    )
