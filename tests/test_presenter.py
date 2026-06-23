"""Tests for the one-page form presenter bridging UI controls to the core."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from report import build_report
from vram_calculator import DeploymentSpec
from web.presenter import FormInputs, deployment_task, report_from_form, spec_from_form


def test_untrained_is_inference_even_with_adapter() -> None:
    # An adapter without training holds no gradients/optimizer state, so it stays inference.
    form = FormInputs(parameters_b=8, context_tokens=8000, trained=False, use_adapter=True)
    assert deployment_task(form) == "inference"


def test_trained_with_adapter_is_qlora() -> None:
    form = FormInputs(parameters_b=8, context_tokens=8000, trained=True, use_adapter=True)
    assert deployment_task(form) == "qlora"


def test_trained_without_adapter_is_full_training() -> None:
    form = FormInputs(parameters_b=8, context_tokens=8000, trained=True, use_adapter=False)
    assert deployment_task(form) == "full_training"


def test_spec_from_form_carries_controls_and_mapped_task() -> None:
    form = FormInputs(parameters_b=70, context_tokens=8000, weight_bits=4, trained=True, use_adapter=True)
    spec = spec_from_form(form)
    assert spec == DeploymentSpec(parameters_b=70, context_tokens=8000, weight_bits=4, task="qlora")


def test_report_from_form_matches_core_pipeline() -> None:
    # specs/vram_calculator.md: 8B / 16-bit / 8k / inference -> 20.1 GB total.
    form = FormInputs(parameters_b=8, context_tokens=8000)
    report = report_from_form(form)
    assert report == build_report(spec_from_form(form))
    assert report.total_vram_gb == pytest.approx(20.1)


def test_invalid_quantization_rejected() -> None:
    with pytest.raises(ValidationError):
        FormInputs.model_validate({"parameters_b": 8, "context_tokens": 8000, "weight_bits": 7})


def test_nonpositive_parameters_rejected() -> None:
    with pytest.raises(ValidationError):
        FormInputs(parameters_b=0, context_tokens=8000)
