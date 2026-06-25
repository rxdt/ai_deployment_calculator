"""Tests for the pure quantization-comparison layer."""

from __future__ import annotations

import pytest

from quantization_comparison import QuantizationComparisonRow, quantization_comparison
from vram_calculator import DeploymentSpec, total_vram_gb


def test_quantization_comparison_matches_worked_example() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000)
    comparison = quantization_comparison(spec)

    assert comparison.rows == (
        QuantizationComparisonRow(weight_bits=32, total_gb=37.7, savings_gb=-17.6, selected=False),
        QuantizationComparisonRow(weight_bits=16, total_gb=20.1, savings_gb=0.0, selected=True),
        QuantizationComparisonRow(weight_bits=8, total_gb=11.3, savings_gb=8.8, selected=False),
        QuantizationComparisonRow(weight_bits=4, total_gb=6.9, savings_gb=13.2, selected=False),
    )


def test_quantization_totals_decrease_as_precision_drops() -> None:
    spec = DeploymentSpec(parameters_b=70, context_tokens=8000, task="qlora")
    rows = quantization_comparison(spec).rows

    assert rows[0].total_gb > rows[1].total_gb > rows[2].total_gb > rows[3].total_gb
    assert rows[1].savings_gb == pytest.approx(0.0)


def test_only_input_weight_precision_is_selected() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000, weight_bits=4)
    rows = quantization_comparison(spec).rows

    assert [row.weight_bits for row in rows if row.selected] == [4]


def test_comparison_preserves_gguf_runtime_margin() -> None:
    # The comparison re-sizes only weight precision; it must keep the GGUF runtime so every
    # row uses the additive 1.0 margin, not the 1.10 PyTorch safety multiplier. The selected
    # row must equal the deployment's real total, and each row must match its own GGUF total.
    spec = DeploymentSpec(
        parameters_b=104,
        context_tokens=32000,
        weight_bits=4,
        kv_cache_bits=32,
        runtime="llama_cpp_gguf",
    )
    rows = quantization_comparison(spec).rows

    selected = [row for row in rows if row.selected]
    assert [row.total_gb for row in selected] == [total_vram_gb(spec)]
    for row in rows:
        # Recompute independently with the runtime pinned, so a dropped-runtime regression
        # in `with_weight_bits` cannot mask itself by inflating both sides equally.
        independent = DeploymentSpec(
            parameters_b=104,
            context_tokens=32000,
            weight_bits=row.weight_bits,
            kv_cache_bits=32,
            runtime="llama_cpp_gguf",
        )
        assert row.total_gb == pytest.approx(total_vram_gb(independent))
    # 104B / 4-bit / 32-bit KV GGUF stays at the additive 136.7 GB, with no 1.10 inflation.
    assert selected[0].total_gb == pytest.approx(136.7)


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

    rounded_context_deltas = [
        round(row.total_gb - no_context_rows[index].total_gb, 1) for index, row in enumerate(baseline_rows)
    ]
    assert rounded_context_deltas == [0.9, 0.8, 0.8, 0.8]
