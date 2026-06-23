"""Tests for the GPU hardware recommendation layer."""

from __future__ import annotations

import pytest

from hardware import GPU_CATALOG, gpus_needed, recommend_hardware
from vram_calculator import DeploymentSpec


@pytest.mark.parametrize(
    ("required_gb", "gpu_vram_gb", "expected"),
    [(24.0, 24.0, 1), (24.1, 24.0, 2), (48.0, 24.0, 2), (1.0, 80.0, 1)],
)
def test_gpus_needed_rounds_up_to_full_card(required_gb: float, gpu_vram_gb: float, expected: int) -> None:
    assert gpus_needed(required_gb, gpu_vram_gb) == expected


def test_recommend_hardware_covers_named_catalog_gpus() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000)
    names = [opt.gpu.name for opt in recommend_hardware(spec)]
    assert names == [gpu.name for gpu in GPU_CATALOG]
    assert "RTX 4090" in names
    assert "H100 80GB" in names


def test_small_deployment_fits_single_gpu_without_tensor_parallel() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000)  # 20.1 GB, under every card
    for option in recommend_hardware(spec):
        assert option.gpu_count == 1
        assert option.tensor_parallel is False


def test_large_deployment_shards_small_cards_but_not_large_ones() -> None:
    spec = DeploymentSpec(parameters_b=70, context_tokens=8000, weight_bits=4, task="qlora")
    by_name = {opt.gpu.name: opt for opt in recommend_hardware(spec)}
    rtx = by_name["RTX 4090"]  # ~52 GB need over 24 GB cards -> 3 GPUs, tensor parallel
    assert rtx.gpu_count == 3
    assert rtx.tensor_parallel is True
    a100_80 = by_name["A100 80GB"]  # fits on one 80 GB card
    assert a100_80.gpu_count == 1
    assert a100_80.tensor_parallel is False
