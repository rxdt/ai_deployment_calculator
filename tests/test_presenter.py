"""Tests for the one-page form presenter bridging UI controls to the core."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from report import build_report
from vram_calculator import DeploymentSpec
from web.presenter import (
    DEFAULT_FORM,
    FormInputs,
    deployment_task,
    form_from_query,
    report_from_form,
    spec_from_form,
)


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


def test_form_from_query_maps_submitted_controls() -> None:
    # A checked checkbox submits "on"; an unchecked one is absent and keeps its False default.
    form = form_from_query("parameters_b=70&context_tokens=8000&weight_bits=4&trained=on")
    assert form == FormInputs(parameters_b=70, context_tokens=8000, weight_bits=4, trained=True)


def test_form_from_query_uses_last_repeated_value() -> None:
    form = form_from_query("parameters_b=8&parameters_b=13&context_tokens=8000")
    assert form.parameters_b == 13


def test_form_from_query_falls_back_to_default_on_empty_query() -> None:
    # First load has no query string; the page must still render the default deployment.
    assert form_from_query("") == DEFAULT_FORM


def test_form_from_query_falls_back_to_default_on_invalid_input() -> None:
    assert form_from_query("parameters_b=0&context_tokens=8000") == DEFAULT_FORM


def test_form_from_query_falls_back_to_default_on_malformed_number() -> None:
    assert form_from_query("parameters_b=8&context_tokens=lots") == DEFAULT_FORM


def test_form_from_query_falls_back_to_default_on_unparseable_number() -> None:
    assert form_from_query("parameters_b=8&context_tokens=8000&weight_bits=nope") == DEFAULT_FORM
