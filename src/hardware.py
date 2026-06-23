"""Hardware recommendation: map a deployment's VRAM need onto real GPUs.

Implements PRIORITY 2 of specs/vram_calculator.md by turning `total_vram_gb`
into per-GPU card counts and a tensor-parallel flag. Reuses the pure core.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from vram_calculator import DeploymentSpec, total_vram_gb


@dataclass(frozen=True)
class Gpu:
    """A deployable accelerator and its usable VRAM in GB."""

    name: str
    vram_gb: float


# Common deployment targets, ordered from least to most VRAM per card.
GPU_CATALOG: tuple[Gpu, ...] = (
    Gpu("T4 16GB", 16.0),
    Gpu("RTX 4090", 24.0),
    Gpu("L4 24GB", 24.0),
    Gpu("A100 40GB", 40.0),
    Gpu("A100 80GB", 80.0),
    Gpu("H100 80GB", 80.0),
    Gpu("B200 192GB", 192.0),
)
HOST_RAM_FLOOR_GB = 32
HOST_RAM_STEP_GB = 16


@dataclass(frozen=True)
class HardwareOption:
    """How a given GPU can host a deployment: card count and whether it must shard."""

    gpu: Gpu
    gpu_count: int
    tensor_parallel: bool  # True once a deployment spans more than one card.


def gpus_needed(required_gb: float, gpu_vram_gb: float) -> int:
    """Whole GPUs needed to hold `required_gb`, rounding up to the next full card."""
    return math.ceil(required_gb / gpu_vram_gb)


def recommended_host_ram_gb(spec: DeploymentSpec) -> int:
    """CPU/system RAM floor: 32 GB minimum, then 16 GB increments from total VRAM."""
    rounded_vram = math.ceil(total_vram_gb(spec) / HOST_RAM_STEP_GB) * HOST_RAM_STEP_GB
    return max(HOST_RAM_FLOOR_GB, rounded_vram)


def recommend_hardware(spec: DeploymentSpec) -> tuple[HardwareOption, ...]:
    """Map a deployment's VRAM need onto each catalog GPU: count and tensor-parallel flag."""
    required = total_vram_gb(spec)
    options = []
    for gpu in GPU_CATALOG:
        count = gpus_needed(required, gpu.vram_gb)
        options.append(HardwareOption(gpu=gpu, gpu_count=count, tensor_parallel=count > 1))
    return tuple(options)
