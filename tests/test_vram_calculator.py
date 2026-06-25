"""Tests for the pure VRAM deployment calculator core."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from vram_calculator import (
    RUNTIME_MARGINS,
    Bits,
    DeploymentSpec,
    kv_cache_gb,
    task_overhead_gb,
    total_vram_gb,
    weights_gb,
)


def test_defaults_are_inference_16bit() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000)
    assert spec.weight_bits == 16
    assert spec.kv_cache_bits == 16
    assert spec.task == "inference"
    assert spec.architecture == "dense"
    assert spec.active_parameters_b is None
    assert spec.runtime == "pytorch"


@pytest.mark.parametrize(
    ("weight_bits", "expected"),
    [(32, 32.0), (16, 16.0), (8, 8.0), (4, 4.0)],
)
def test_weights_gb_scales_with_precision(weight_bits: Bits, expected: float) -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=0, weight_bits=weight_bits)
    assert weights_gb(spec) == expected


def test_kv_cache_matches_worked_example() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000)
    assert kv_cache_gb(spec) == pytest.approx(0.8)


def test_kv_cache_stays_16bit_under_weight_quantization() -> None:
    quantized = DeploymentSpec(parameters_b=70, context_tokens=8000, weight_bits=4)
    assert kv_cache_gb(quantized) == pytest.approx(7.0)


def test_kv_cache_shrinks_only_when_kv_quantized() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000, kv_cache_bits=8)
    assert kv_cache_gb(spec) == pytest.approx(0.4)


def test_kv_cache_expands_for_32bit_precision() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000, kv_cache_bits=32)
    assert kv_cache_gb(spec) == pytest.approx(1.6)


def test_moe_kv_cache_uses_active_parameters_not_total_weights() -> None:
    spec = DeploymentSpec(
        parameters_b=47,
        context_tokens=8000,
        architecture="moe",
        active_parameters_b=1.3,
    )
    assert weights_gb(spec) == pytest.approx(94.0)
    assert kv_cache_gb(spec) == pytest.approx(1.3)
    assert total_vram_gb(spec) == pytest.approx(106.5)


def test_kv_cache_zero_context() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=0)
    assert kv_cache_gb(spec) == pytest.approx(0.0)


def test_task_overhead_inference_is_zero() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000, task="inference")
    assert task_overhead_gb(spec) == pytest.approx(0.0)


def test_task_overhead_qlora_is_fixed() -> None:
    spec = DeploymentSpec(parameters_b=70, context_tokens=8000, weight_bits=4, task="qlora")
    assert task_overhead_gb(spec) == pytest.approx(4.0)


def test_task_overhead_lora_scales_with_trainable_parameters() -> None:
    spec = DeploymentSpec(
        parameters_b=8,
        context_tokens=8000,
        weight_bits=16,
        task="qlora",
        trainable_parameters_percent=2,
    )

    assert weights_gb(spec) == pytest.approx(16.0)
    assert kv_cache_gb(spec) == pytest.approx(0.8)
    assert task_overhead_gb(spec) == pytest.approx(1.408)
    assert total_vram_gb(spec) == pytest.approx(21.7)


def test_task_overhead_full_training_scales_with_params() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000, task="full_training")
    assert task_overhead_gb(spec) == pytest.approx(128.0)


def test_total_vram_8b_inference_acceptance_signal() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000)
    assert total_vram_gb(spec) == pytest.approx(20.1)


def test_llama_cpp_gguf_uses_additive_total_without_safety_margin() -> None:
    spec = DeploymentSpec(
        parameters_b=104,
        context_tokens=32000,
        weight_bits=4,
        kv_cache_bits=32,
        runtime="llama_cpp_gguf",
    )

    assert weights_gb(spec) == pytest.approx(52.0)
    assert kv_cache_gb(spec) == pytest.approx(83.2)
    assert task_overhead_gb(spec) == pytest.approx(0.0)
    assert RUNTIME_MARGINS[spec.runtime] == pytest.approx(1.0)
    assert total_vram_gb(spec) == pytest.approx(136.7)


def test_tiny_fp8_full_training_rounds_to_cuda_dominated_total() -> None:
    spec = DeploymentSpec(
        parameters_b=0.0004,
        context_tokens=8000,
        weight_bits=8,
        kv_cache_bits=8,
        task="full_training",
    )

    assert weights_gb(spec) == pytest.approx(0.0004)
    assert kv_cache_gb(spec) == pytest.approx(0.00002)
    assert task_overhead_gb(spec) == pytest.approx(0.0064)
    assert total_vram_gb(spec) == pytest.approx(1.7)


@pytest.mark.parametrize(
    ("spec", "weights", "kv_cache", "expected_total"),
    [
        (
            DeploymentSpec(
                parameters_b=70,
                context_tokens=128000,
                weight_bits=4,
                kv_cache_bits=8,
            ),
            35.0,
            56.0,
            101.8,
        ),
        (
            DeploymentSpec(
                parameters_b=104,
                context_tokens=32000,
                weight_bits=8,
                kv_cache_bits=16,
            ),
            104.0,
            41.6,
            161.8,
        ),
    ],
)
def test_large_inference_regressions(
    spec: DeploymentSpec,
    weights: float,
    kv_cache: float,
    expected_total: float,
) -> None:
    assert weights_gb(spec) == pytest.approx(weights)
    assert kv_cache_gb(spec) == pytest.approx(kv_cache)
    assert task_overhead_gb(spec) == pytest.approx(0.0)
    assert total_vram_gb(spec) == pytest.approx(expected_total)


@pytest.mark.parametrize(
    ("spec", "subtotal"),
    [
        (DeploymentSpec(parameters_b=8, context_tokens=8000, weight_bits=4, task="qlora"), 10.3),
        (DeploymentSpec(parameters_b=70, context_tokens=8000, weight_bits=4, task="qlora"), 47.5),
    ],
)
def test_total_vram_applies_margin_to_worked_subtotals(spec: DeploymentSpec, subtotal: float) -> None:
    assert total_vram_gb(spec) == round(subtotal * 1.10, 1)


@pytest.mark.parametrize("field", ["weight_bits", "kv_cache_bits"])
def test_invalid_bit_widths_rejected(field: str) -> None:
    base = {"parameters_b": 8, "context_tokens": 8000}
    with pytest.raises(ValidationError):
        DeploymentSpec.model_validate({**base, field: 5})


def test_non_positive_parameters_rejected() -> None:
    with pytest.raises(ValidationError):
        DeploymentSpec(parameters_b=0, context_tokens=8000)


def test_negative_context_rejected() -> None:
    with pytest.raises(ValidationError):
        DeploymentSpec(parameters_b=8, context_tokens=-1)


@pytest.mark.parametrize("trainable_parameters_percent", [0, 101])
def test_invalid_trainable_parameters_percent_rejected(trainable_parameters_percent: float) -> None:
    with pytest.raises(ValidationError):
        DeploymentSpec(
            parameters_b=8,
            context_tokens=8000,
            task="qlora",
            trainable_parameters_percent=trainable_parameters_percent,
        )


def test_moe_requires_active_parameters() -> None:
    with pytest.raises(ValidationError):
        DeploymentSpec(parameters_b=47, context_tokens=8000, architecture="moe")


def test_moe_active_parameters_cannot_exceed_total_parameters() -> None:
    with pytest.raises(ValidationError):
        DeploymentSpec(
            parameters_b=47,
            context_tokens=8000,
            architecture="moe",
            active_parameters_b=48,
        )
