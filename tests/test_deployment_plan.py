"""Tests for the pure deployment-plan layer (specs/deployment_plan.md PRIORITY 1)."""

from __future__ import annotations

import pytest

from deployment_plan import (
    OPTIMIZE_KV_CACHE,
    OPTIMIZE_NONE,
    OPTIMIZE_SHARDING,
    OPTIMIZE_WEIGHTS,
    deployment_plan,
    fit_label,
)
from hardware import Gpu, HardwareOption
from vram_calculator import DeploymentSpec


def option(count: int) -> HardwareOption:
    return HardwareOption(gpu=Gpu("test", 24.0), gpu_count=count, tensor_parallel=count > 1)


@pytest.mark.parametrize(
    ("count", "expected"),
    [(1, "single_gpu"), (2, "tensor_parallel"), (4, "tensor_parallel"), (5, "large_shard")],
)
def test_fit_label_classifies_card_count(count: int, expected: str) -> None:
    assert fit_label(option(count)) == expected


def test_primary_prefers_single_card_and_earliest_catalog_gpu() -> None:
    # 70B / 4-bit / 8k / QLoRA (52.3 GB): only the 80 GB cards fit on one card; A100 80GB precedes H100.
    spec = DeploymentSpec(parameters_b=70, context_tokens=8000, weight_bits=4, task="qlora")
    plan = deployment_plan(spec)
    assert plan.primary.option.gpu_count == 1
    assert plan.primary.option.tensor_parallel is False
    assert plan.primary.option.gpu.name == "A100 80GB"
    assert plan.primary.fit == "single_gpu"


def test_plan_labels_every_catalog_option_and_includes_primary() -> None:
    spec = DeploymentSpec(parameters_b=70, context_tokens=8000, weight_bits=4, task="qlora")
    plan = deployment_plan(spec)
    by_name = {po.option.gpu.name: po.fit for po in plan.options}
    assert by_name["T4 16GB"] == "tensor_parallel"  # ~52 GB over 16 GB cards -> 4 cards
    assert by_name["RTX 4090"] == "tensor_parallel"  # ~52 GB over 24 GB cards -> 3 cards
    assert by_name["L4 24GB"] == "tensor_parallel"
    assert by_name["A100 80GB"] == "single_gpu"
    assert plan.primary in plan.options


def test_large_shard_label_when_more_than_four_cards() -> None:
    # 70B full 16-bit training is enormous, forcing >4 of the 24 GB cards.
    spec = DeploymentSpec(parameters_b=70, context_tokens=8000, task="full_training")
    fits = {po.option.gpu.name: po.fit for po in deployment_plan(spec).options}
    assert fits["T4 16GB"] == "large_shard"
    assert fits["RTX 4090"] == "large_shard"
    assert fits["L4 24GB"] == "large_shard"


def test_optimization_lowers_weight_precision_first() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000, weight_bits=16)
    assert deployment_plan(spec).optimization == OPTIMIZE_WEIGHTS


def test_optimization_recommends_fp8_kv_cache_when_weights_minimal() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000, weight_bits=4, kv_cache_bits=16)
    assert deployment_plan(spec).optimization == OPTIMIZE_KV_CACHE


def test_optimization_skips_kv_note_when_context_is_zero() -> None:
    # 16-bit KV cannot help with no context, so the note falls through past the KV branch.
    spec = DeploymentSpec(parameters_b=8, context_tokens=0, weight_bits=4, kv_cache_bits=16)
    assert deployment_plan(spec).optimization == OPTIMIZE_NONE


def test_optimization_recommends_avoiding_sharding_when_levers_exhausted() -> None:
    # 405B at 4-bit weights and 8-bit KV overflows even the 192 GB card, so the primary plan shards.
    spec = DeploymentSpec(parameters_b=405, context_tokens=8000, weight_bits=4, kv_cache_bits=8)
    plan = deployment_plan(spec)
    assert plan.primary.option.tensor_parallel is True
    assert plan.optimization == OPTIMIZE_SHARDING


def test_optimization_none_when_primary_fits_one_card_despite_weak_gpus_sharding() -> None:
    # 70B / 4-bit / 8-bit KV needs >1 of the small cards, but a single A100 80GB fits it,
    # so the note must not tell an already-single-card plan to avoid tensor parallelism.
    spec = DeploymentSpec(parameters_b=70, context_tokens=8000, weight_bits=4, kv_cache_bits=8)
    plan = deployment_plan(spec)
    assert plan.primary.option.gpu_count == 1
    assert any(po.option.tensor_parallel for po in plan.options)
    assert plan.optimization == OPTIMIZE_NONE


def test_optimization_none_when_fitting_single_card_with_minimal_precision() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000, weight_bits=4, kv_cache_bits=8)
    assert deployment_plan(spec).optimization == OPTIMIZE_NONE
