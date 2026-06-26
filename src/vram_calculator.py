"""Pure, deterministic GPU VRAM deployment calculator core.

Implements `VRAM_GB = (W + KV + T + C) * RUNTIME_MARGINS[runtime]`.
Constants are surfaced through the report assumptions; no silent assumptions.
"""

from __future__ import annotations

from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator
from pydantic_core import PydanticCustomError

BITS_PER_BYTE = 8
CONTEXT_TOKENS_PER_K = 1000
KV_REFERENCE_BITS = 16  # KV cache is sized in 16-bit; quantizing below this shrinks it.
KV_HEAD_RATIO = 10  # Grouped-query-attention heuristic: KV scales with P / 10.
KV_CONTEXT_DIVISOR = 8  # Per-1k-token context divisor from the worked examples.
QLORA_OVERHEAD_GB = 4.0  # 16-bit LoRA adapters plus Adam optimizer states.
LORA_OPTIMIZER_BYTES_PER_PARAM = 8  # LoRA adapter weights plus optimizer states.
LORA_OVERHEAD_BUFFER = 1.10
FULL_TRAINING_BYTES_PER_PARAM = 16  # Weights + gradients + optimizer for 16-bit training.
CUDA_TAX_GB = 1.5  # Fixed CUDA context / system reservation.
SAFETY_MARGIN = 1.10  # Headroom so a deployment does not run at the VRAM ceiling.
GGUF_RUNTIME_MARGIN = 1.0  # llama.cpp GGUF sizing uses the additive components directly.
RUNTIME_MARGINS = {"pytorch": SAFETY_MARGIN, "llama_cpp_gguf": GGUF_RUNTIME_MARGIN}
FIXED_TASK_OVERHEAD_GB = {"inference": 0.0, "qlora": QLORA_OVERHEAD_GB}
MISSING_ACTIVE_PARAMETERS_ERROR = "missing_active_parameters"
MISSING_ACTIVE_PARAMETERS_MESSAGE = "MoE deployments require active_parameters_b"
ACTIVE_EXCEEDS_TOTAL_ERROR = "active_exceeds_total"
ACTIVE_EXCEEDS_TOTAL_MESSAGE = "active_parameters_b cannot exceed parameters_b"

Task = Literal["inference", "qlora", "full_training"]
Bits = Literal[32, 16, 8, 4]
Architecture = Literal["dense", "moe"]
Runtime = Literal["pytorch", "llama_cpp_gguf"]


class DeploymentSpec(BaseModel):
    """Validated inputs describing one model deployment to size."""

    parameters_b: float = Field(gt=0)
    context_tokens: int = Field(ge=0)
    weight_bits: Bits = 16
    kv_cache_bits: Bits = 16
    task: Task = "inference"
    architecture: Architecture = "dense"
    active_parameters_b: float | None = Field(default=None, gt=0)
    runtime: Runtime = "pytorch"
    trainable_parameters_percent: float | None = Field(default=None, gt=0, le=100)

    @model_validator(mode="after")
    def validate_active_parameters(self) -> Self:
        """MoE deployments need active parameters for KV cache sizing."""
        if self.architecture == "moe":
            if self.active_parameters_b is None:
                raise PydanticCustomError(
                    MISSING_ACTIVE_PARAMETERS_ERROR,
                    MISSING_ACTIVE_PARAMETERS_MESSAGE,
                )
            if self.active_parameters_b > self.parameters_b:
                raise PydanticCustomError(
                    ACTIVE_EXCEEDS_TOTAL_ERROR,
                    ACTIVE_EXCEEDS_TOTAL_MESSAGE,
                )
        return self


def weights_gb(spec: DeploymentSpec) -> float:
    """Model-weight memory: parameters in billions times bytes per weight."""
    return spec.parameters_b * (spec.weight_bits / BITS_PER_BYTE)


def kv_cache_gb(spec: DeploymentSpec) -> float:
    """KV-cache memory; 16-bit unless `kv_cache_bits` is lower, and never shrinks with weights."""
    context_k = spec.context_tokens / CONTEXT_TOKENS_PER_K
    quant = spec.kv_cache_bits / KV_REFERENCE_BITS
    if spec.architecture == "moe" and spec.active_parameters_b is not None:
        return spec.active_parameters_b * (context_k / KV_CONTEXT_DIVISOR) * quant
    return (spec.parameters_b / KV_HEAD_RATIO) * (context_k / KV_CONTEXT_DIVISOR) * quant


def task_overhead_gb(spec: DeploymentSpec) -> float:
    """Gradient/optimizer/adapter memory: 0 for inference, adapter-sized for LoRA, P*16 for training."""
    if spec.task == "full_training":
        return spec.parameters_b * FULL_TRAINING_BYTES_PER_PARAM
    if spec.task == "qlora" and spec.trainable_parameters_percent is not None:
        trainable_parameters_b = spec.parameters_b * (spec.trainable_parameters_percent / 100)
        return trainable_parameters_b * LORA_OPTIMIZER_BYTES_PER_PARAM * LORA_OVERHEAD_BUFFER
    return FIXED_TASK_OVERHEAD_GB[spec.task]


def total_vram_gb(spec: DeploymentSpec) -> float:
    """Total VRAM in GB: (W + KV + T + C) scaled by the runtime margin, rounded to 1 decimal."""
    subtotal = weights_gb(spec) + kv_cache_gb(spec) + task_overhead_gb(spec) + CUDA_TAX_GB
    return round(subtotal * RUNTIME_MARGINS[spec.runtime], 1)
