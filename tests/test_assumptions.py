"""Tests for the fixed calculator assumption summary."""

from __future__ import annotations

from assumptions import Assumption, build_assumption_summary
from vram_calculator import DeploymentSpec


def test_assumption_summary_exposes_exact_labels_and_values() -> None:
    spec = DeploymentSpec(parameters_b=8, context_tokens=8000)
    assert build_assumption_summary(spec).items == (
        Assumption("Safety margin", "10%"),
        Assumption("CUDA/system tax", "1.5 GB"),
        Assumption("KV cache heuristic", "(parameters / 10) * (context_k / 8)"),
        Assumption("Host RAM rule", "at least 32 GB, rounded up in 16 GB increments"),
        Assumption("Supported precisions", "32-bit, 16-bit, 8-bit, and 4-bit weights and KV cache"),
    )


def test_assumption_summary_reflects_moe_kv_heuristic() -> None:
    spec = DeploymentSpec(parameters_b=47, context_tokens=8000, architecture="moe", active_parameters_b=1.3)
    kv_assumption = next(
        item for item in build_assumption_summary(spec).items if item.label == "KV cache heuristic"
    )
    assert kv_assumption.value == "active_parameters * (context_k / 8)"
