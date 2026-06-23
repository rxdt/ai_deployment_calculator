"""Tests for the GPU hardware recommendation layer."""

from __future__ import annotations

import pytest

from hardware import GPU_CATALOG, gpus_needed, recommend_hardware, recommended_host_ram_gb
from vram_calculator import DeploymentSpec


@pytest.mark.parametrize(
    ("required_gb", "gpu_vram_gb", "expected"),
    [(24.0, 24.0, 1), (24.1, 24.0, 2), (48.0, 24.0, 2), (1.0, 80.0, 1)],
)
def test_gpus_needed_rounds_up_to_full_card(required_gb: float, gpu_vram_gb: float, expected: int) -> None:
    assert gpus_needed(required_gb, gpu_vram_gb) == expected


def test_host_ram_has_floor_and_16gb_steps() -> None:
    assert recommended_host_ram_gb(DeploymentSpec(parameters_b=8, context_tokens=8000)) == 32
    spec = DeploymentSpec(parameters_b=70, context_tokens=8000, weight_bits=4, task="qlora")
    assert recommended_host_ram_gb(spec) == 64


def test_recommend_hardware_covers_named_catalog_gpus() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000)
    names = [opt.gpu.name for opt in recommend_hardware(spec)]
    assert names == [gpu.name for gpu in GPU_CATALOG]
    assert names == ["T4 16GB", "RTX 4090", "L4 24GB", "A100 40GB", "A100 80GB", "H100 80GB", "B200 192GB"]


def test_small_deployment_shards_t4_but_fits_larger_cards() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000)  # 20.1 GB, above T4 and under 24 GB cards
    by_name = {opt.gpu.name: opt for opt in recommend_hardware(spec)}
    assert by_name["T4 16GB"].gpu_count == 2
    assert by_name["T4 16GB"].tensor_parallel is True
    for option in tuple(by_name.values())[1:]:
        assert option.gpu_count == 1
        assert option.tensor_parallel is False


def test_large_deployment_shards_small_cards_but_not_large_ones() -> None:
    spec = DeploymentSpec(parameters_b=70, context_tokens=8000, weight_bits=4, task="qlora")
    by_name = {opt.gpu.name: opt for opt in recommend_hardware(spec)}
    t4 = by_name["T4 16GB"]  # ~52 GB need over 16 GB cards -> 4 GPUs, tensor parallel
    assert t4.gpu_count == 4
    assert t4.tensor_parallel is True
    rtx = by_name["RTX 4090"]  # ~52 GB need over 24 GB cards -> 3 GPUs, tensor parallel
    assert rtx.gpu_count == 3
    assert rtx.tensor_parallel is True
    l4 = by_name["L4 24GB"]
    assert l4.gpu_count == 3
    assert l4.tensor_parallel is True
    a100_80 = by_name["A100 80GB"]  # fits on one 80 GB card
    assert a100_80.gpu_count == 1
    assert a100_80.tensor_parallel is False
