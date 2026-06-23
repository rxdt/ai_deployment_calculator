"""Tests for the fixed calculator assumption summary."""

from __future__ import annotations

from assumptions import Assumption, build_assumption_summary


def test_assumption_summary_exposes_exact_labels_and_values() -> None:
    assert build_assumption_summary().items == (
        Assumption("Safety margin", "10%"),
        Assumption("CUDA/system tax", "1.5 GB"),
        Assumption("KV cache heuristic", "(parameters / 10) * (context_k / 8)"),
        Assumption("Host RAM rule", "at least 32 GB, rounded up in 16 GB increments"),
        Assumption("Supported precisions", "32-bit, 16-bit, 8-bit, and 4-bit weights and KV cache"),
    )
