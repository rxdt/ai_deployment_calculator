"""Pure, deterministic GPU VRAM deployment calculator core.

Implements `VRAM_GB = (W + KV + T + C) * SAFETY_MARGIN` from specs/vram_calculator.md.
Every constant traces back to docs/plan.md; no silent assumptions.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

BITS_PER_BYTE = 8
CONTEXT_TOKENS_PER_K = 1000
KV_REFERENCE_BITS = 16  # KV cache is sized in 16-bit; quantizing below this shrinks it.
KV_HEAD_RATIO = 10  # Grouped-query-attention heuristic: KV scales with P / 10.
KV_CONTEXT_DIVISOR = 8  # Per-1k-token context divisor from the worked examples.
QLORA_OVERHEAD_GB = 4.0  # 16-bit LoRA adapters plus Adam optimizer states.
FULL_TRAINING_BYTES_PER_PARAM = 16  # Weights + gradients + optimizer for 16-bit training.
CUDA_TAX_GB = 1.5  # Fixed CUDA context / system reservation.
SAFETY_MARGIN = 1.10  # Headroom so a deployment does not run at the VRAM ceiling.

Task = Literal["inference", "qlora", "full_training"]
Bits = Literal[16, 8, 4]


class DeploymentSpec(BaseModel):
    """Validated inputs describing one model deployment to size."""

    parameters_b: float = Field(gt=0)
    context_tokens: int = Field(ge=0)
    weight_bits: Bits = 16
    kv_cache_bits: Bits = 16
    task: Task = "inference"


def weights_gb(spec: DeploymentSpec) -> float:
    """Model-weight memory: parameters in billions times bytes per weight."""
    return spec.parameters_b * (spec.weight_bits / BITS_PER_BYTE)


def kv_cache_gb(spec: DeploymentSpec) -> float:
    """KV-cache memory; 16-bit unless `kv_cache_bits` is lower, and never shrinks with weights."""
    context_k = spec.context_tokens / CONTEXT_TOKENS_PER_K
    quant = spec.kv_cache_bits / KV_REFERENCE_BITS
    return (spec.parameters_b / KV_HEAD_RATIO) * (context_k / KV_CONTEXT_DIVISOR) * quant


def task_overhead_gb(spec: DeploymentSpec) -> float:
    """Gradient/optimizer/adapter memory: 0 for inference, fixed for QLoRA, P*16 for full training."""
    if spec.task == "qlora":
        return QLORA_OVERHEAD_GB
    if spec.task == "full_training":
        return spec.parameters_b * FULL_TRAINING_BYTES_PER_PARAM
    return 0.0


def total_vram_gb(spec: DeploymentSpec) -> float:
    """Total VRAM in GB: (W + KV + T + C) scaled by the safety margin, rounded to 1 decimal."""
    subtotal = weights_gb(spec) + kv_cache_gb(spec) + task_overhead_gb(spec) + CUDA_TAX_GB
    return round(subtotal * SAFETY_MARGIN, 1)
