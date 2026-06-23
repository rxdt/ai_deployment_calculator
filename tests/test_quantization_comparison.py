"""Tests for the pure quantization-comparison layer."""

from __future__ import annotations

import pytest

from quantization_comparison import QuantizationComparisonRow, quantization_comparison
from vram_calculator import DeploymentSpec


def test_quantization_comparison_matches_worked_example() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000)
    comparison = quantization_comparison(spec)

    assert comparison.rows == (
        QuantizationComparisonRow(weight_bits=16, total_gb=20.1, savings_gb=0.0, selected=True),
        QuantizationComparisonRow(weight_bits=8, total_gb=11.3, savings_gb=8.8, selected=False),
        QuantizationComparisonRow(weight_bits=4, total_gb=6.9, savings_gb=13.2, selected=False),
    )


def test_quantization_totals_decrease_as_precision_drops() -> None:
    spec = DeploymentSpec(parameters_b=70, context_tokens=8000, task="qlora")
    rows = quantization_comparison(spec).rows

    assert rows[0].total_gb > rows[1].total_gb > rows[2].total_gb
    assert rows[0].savings_gb == pytest.approx(0.0)


def test_only_input_weight_precision_is_selected() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000, weight_bits=4)
    rows = quantization_comparison(spec).rows

    assert [row.weight_bits for row in rows if row.selected] == [4]


def test_comparison_holds_kv_precision_context_and_task_fixed() -> None:
    baseline = DeploymentSpec(
        parameters_b=8,
        context_tokens=16000,
        weight_bits=16,
        kv_cache_bits=8,
        task="qlora",
    )
    no_context = DeploymentSpec(
        parameters_b=8,
        context_tokens=0,
        weight_bits=16,
        kv_cache_bits=8,
        task="qlora",
    )

    baseline_rows = quantization_comparison(baseline).rows
    no_context_rows = quantization_comparison(no_context).rows

    assert baseline_rows[0].total_gb - no_context_rows[0].total_gb == pytest.approx(0.8)
    assert baseline_rows[1].total_gb - no_context_rows[1].total_gb == pytest.approx(0.8)
    assert baseline_rows[2].total_gb - no_context_rows[2].total_gb == pytest.approx(0.8)
