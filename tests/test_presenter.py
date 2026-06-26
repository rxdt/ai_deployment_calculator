"""Tests for the one-page form presenter bridging UI controls to the core."""

from __future__ import annotations

from typing import Any

import pytest

from report import build_report
from vram_calculator import DeploymentSpec
from web.form_query import form_from_query, parse_decimal
from web.presenter import (
    DEFAULT_ACTIVE_PARAMETERS_B,
    DEFAULT_FORM,
    FormInputError,
    FormInputs,
    spec_from_form,
)


def test_untrained_is_inference_even_with_adapter() -> None:
    # An adapter without training holds no gradients/optimizer state, so it stays inference.
    form = FormInputs(parameters_b=8, context_tokens=8000, trained=False, use_adapter=True)
    assert form.task == "inference"


def test_trained_with_adapter_is_qlora() -> None:
    form = FormInputs(parameters_b=8, context_tokens=8000, trained=True, use_adapter=True)
    assert form.task == "qlora"


def test_trained_without_adapter_is_full_training() -> None:
    form = FormInputs(parameters_b=8, context_tokens=8000, trained=True, use_adapter=False)
    assert form.task == "full_training"


def test_spec_from_form_carries_controls_and_mapped_task() -> None:
    form = FormInputs(
        parameters_b=70,
        context_tokens=8000,
        weight_bits=4,
        kv_cache_bits=8,
        trained=True,
        use_adapter=True,
        active_parameters_b=8,
    )
    spec = spec_from_form(form)
    assert spec == DeploymentSpec(
        parameters_b=70,
        context_tokens=8000,
        weight_bits=4,
        kv_cache_bits=8,
        task="qlora",
        architecture="moe",
        active_parameters_b=8,
    )


def test_spec_from_form_matches_core_report_pipeline() -> None:
    # specs/vram_calculator.md: 8B / 16-bit / 8k / inference -> 20.1 GB total.
    form = FormInputs(parameters_b=8, context_tokens=8000)
    report = build_report(spec_from_form(form))
    assert report.total_vram_gb == pytest.approx(20.1)


def test_spec_from_form_preserves_gguf_runtime() -> None:
    form = FormInputs(parameters_b=104, context_tokens=32000, weight_bits=4, runtime="llama_cpp_gguf")
    assert spec_from_form(form).runtime == "llama_cpp_gguf"


def test_invalid_quantization_rejected() -> None:
    bad_bits: Any = 7
    with pytest.raises(ValueError, match="invalid form input"):
        FormInputs(parameters_b=8, context_tokens=8000, weight_bits=bad_bits)


def test_invalid_kv_cache_precision_rejected() -> None:
    bad_bits: Any = 7
    with pytest.raises(ValueError, match="invalid form input"):
        FormInputs(parameters_b=8, context_tokens=8000, kv_cache_bits=bad_bits)


def test_nonpositive_parameters_rejected() -> None:
    with pytest.raises(ValueError, match="invalid form input"):
        FormInputs(parameters_b=0, context_tokens=8000)


def test_negative_context_rejected() -> None:
    with pytest.raises(ValueError, match="invalid form input"):
        FormInputs(parameters_b=8, context_tokens=-1)


def test_form_without_active_parameters_is_dense() -> None:
    form = FormInputs(parameters_b=47, context_tokens=8000)
    assert form.architecture == "dense"


def test_moe_form_rejects_active_parameters_above_total_parameters() -> None:
    with pytest.raises(ValueError, match="invalid form input"):
        FormInputs(parameters_b=47, context_tokens=8000, active_parameters_b=48)


def test_form_from_query_maps_submitted_controls() -> None:
    # A checked checkbox submits "on"; an unchecked one is absent and keeps its False default.
    form = form_from_query(
        "parameters_b=70&context_tokens=8000&weight_bits=4&kv_cache_bits=8"
        "&architecture=moe&active_parameters_b=8&trained=on"
    )
    assert form == FormInputs(
        parameters_b=70,
        context_tokens=8000,
        weight_bits=4,
        kv_cache_bits=8,
        active_parameters_b=8,
        trained=True,
    )


def test_form_from_query_ignores_adapter_without_training() -> None:
    form = form_from_query("parameters_b=8&context_tokens=8000&use_adapter=on")
    assert form == FormInputs(parameters_b=8, context_tokens=8000)


@pytest.mark.parametrize("bits", [32, 16, 8, 4])
def test_form_from_query_accepts_supported_quantization(bits: int) -> None:
    form = form_from_query(f"parameters_b=8&context_tokens=8000&weight_bits={bits}")
    assert form.weight_bits == bits


@pytest.mark.parametrize("bits", [32, 16, 8, 4])
def test_form_from_query_accepts_supported_kv_cache_precision(bits: int) -> None:
    form = form_from_query(f"parameters_b=8&context_tokens=8000&kv_cache_bits={bits}")
    assert form.kv_cache_bits == bits


def test_form_from_query_accepts_gguf_runtime() -> None:
    form = form_from_query("parameters_b=104&context_tokens=32000&weight_bits=4&runtime=llama_cpp_gguf")
    assert form.runtime == "llama_cpp_gguf"


def test_form_from_query_uses_last_repeated_value() -> None:
    form = form_from_query("parameters_b=8&parameters_b=13&context_tokens=8000")
    assert form.parameters_b == 13


def test_form_from_query_resets_on_trailing_blank_repeated_value() -> None:
    # JS `URLSearchParams.getAll` keeps blank values and the form reads the last one, so a trailing
    # "weight_bits=" makes the JS app reset to the default deployment. Python `parse_qs` would drop
    # the blank and keep sizing the prior "8"; the no-JS page must match the JS reset.
    form = form_from_query("parameters_b=8&context_tokens=8000&weight_bits=8&weight_bits=")
    assert form == DEFAULT_FORM


def test_form_from_query_falls_back_to_default_on_empty_query() -> None:
    # First load has no query string; the page must still render the default deployment.
    assert form_from_query("") == DEFAULT_FORM


def test_form_from_query_falls_back_to_default_on_invalid_input() -> None:
    assert form_from_query("parameters_b=0&context_tokens=8000") == DEFAULT_FORM


def test_form_from_query_falls_back_to_default_on_partial_input() -> None:
    assert form_from_query("parameters_b=8") == DEFAULT_FORM


def test_form_from_query_falls_back_to_default_on_malformed_number() -> None:
    assert form_from_query("parameters_b=8&context_tokens=lots") == DEFAULT_FORM


def test_form_from_query_falls_back_to_default_on_unparseable_number() -> None:
    assert form_from_query("parameters_b=8&context_tokens=8000&weight_bits=nope") == DEFAULT_FORM


def test_form_from_query_falls_back_to_default_on_unsupported_quantization() -> None:
    assert form_from_query("parameters_b=8&context_tokens=8000&weight_bits=7") == DEFAULT_FORM


def test_form_from_query_falls_back_to_default_on_unsupported_kv_cache_precision() -> None:
    assert form_from_query("parameters_b=8&context_tokens=8000&kv_cache_bits=7") == DEFAULT_FORM


def test_form_from_query_falls_back_to_default_on_unsupported_architecture() -> None:
    assert form_from_query("parameters_b=8&context_tokens=8000&architecture=hybrid") == DEFAULT_FORM


def test_form_from_query_falls_back_to_default_on_unsupported_runtime() -> None:
    assert form_from_query("parameters_b=8&context_tokens=8000&runtime=tensorflow") == DEFAULT_FORM


def test_form_from_query_defaults_missing_moe_active_parameters() -> None:
    # The Vite normalizedState defaults a missing active_parameters_b to DEFAULT_VALUES (1.3) and
    # renders an MoE deployment; a bare KeyError reset to the dense 8B default would make the no-JS
    # server page contradict the JS app for the same URL. Mirror the frontend default instead.
    form = form_from_query("parameters_b=47&context_tokens=8000&architecture=moe")
    assert form.architecture == "moe"
    assert form.parameters_b == 47
    assert form.active_parameters_b == DEFAULT_ACTIVE_PARAMETERS_B


@pytest.mark.parametrize("context_tokens", ["8000.0", "8e3", "32000.00"])
def test_form_from_query_accepts_integer_valued_context_tokens(context_tokens: str) -> None:
    # The Vite form's Number.isInteger guard accepts "8000.0"/"8e3"; a bare int() rejects them
    # and would silently drop every input back to the default deployment, so the rendered report
    # would contradict the form shown to the user. The backend must accept them and keep the spec.
    form = form_from_query(f"parameters_b=70&context_tokens={context_tokens}&weight_bits=4")
    assert form.parameters_b == 70
    assert form.context_tokens == int(float(context_tokens))


@pytest.mark.parametrize("context_tokens", ["8000.5", "3.14", "nan", "inf"])
def test_form_from_query_rejects_non_integer_context_tokens(context_tokens: str) -> None:
    # Non-integer or non-finite context counts have no meaning in tokens; mirror the frontend
    # by normalizing them to the default deployment instead of truncating silently.
    assert form_from_query(f"parameters_b=70&context_tokens={context_tokens}") == DEFAULT_FORM


@pytest.mark.parametrize("parameters", ["inf", "-inf", "nan"])
def test_form_from_query_falls_back_to_default_on_non_finite_parameters(parameters: str) -> None:
    # inf crashes hardware sizing and nan yields nonsense totals; the frontend rejects both
    # via Number.isFinite, so the backend must normalize them to the default deployment too.
    assert form_from_query(f"parameters_b={parameters}&context_tokens=8000") == DEFAULT_FORM


def test_form_from_query_falls_back_to_default_on_non_finite_active_parameters() -> None:
    query = "parameters_b=47&context_tokens=8000&architecture=moe&active_parameters_b=inf"
    assert form_from_query(query) == DEFAULT_FORM


@pytest.mark.parametrize("field", ["parameters_b", "context_tokens", "active_parameters_b"])
def test_form_from_query_rejects_underscore_grouped_numbers(field: str) -> None:
    # Python float() reads "1_000" as 1000 but the Vite form's Number() returns NaN and rejects it.
    # Without matching that, the no-JS server page would size a different deployment than the JS
    # app for the same URL (e.g. "1_000" -> 1000B vs the default 8B).
    base = {
        "parameters_b": "8",
        "context_tokens": "8000",
        "architecture": "moe",
        "active_parameters_b": "1.3",
    }
    base[field] = "1_000"
    query = "&".join(f"{key}={value}" for key, value in base.items())
    assert form_from_query(query) == DEFAULT_FORM


@pytest.mark.parametrize("field", ["parameters_b", "context_tokens", "active_parameters_b"])
def test_form_from_query_rejects_non_ascii_numerals(field: str) -> None:
    # Python float() normalizes full-width Unicode digits (U+FF11.. -> 123.0) but the Vite form's
    # Number() returns NaN and rejects them. Without matching that, the no-JS server page would
    # size a 123B deployment from a URL the JS app resets to the default 8B.
    base = {
        "parameters_b": "8",
        "context_tokens": "8000",
        "architecture": "moe",
        "active_parameters_b": "1.3",
    }
    base[field] = "\uff11\uff12\uff13"  # full-width digits for "123"
    query = "&".join(f"{key}={value}" for key, value in base.items())
    assert form_from_query(query) == DEFAULT_FORM


def test_form_from_query_accepts_unicode_whitespace_padding() -> None:
    # The Vite form trims Unicode whitespace (e.g. U+00A0) before validating, so it sizes a 47B
    # deployment from a padded URL value. The backend must trim the same set instead of rejecting
    # the non-ASCII padding and resetting to the default 8B, which would diverge from the JS app.
    padded = form_from_query("parameters_b=\u00a047\u3000&context_tokens=8000")
    assert padded == form_from_query("parameters_b=47&context_tokens=8000")
    assert padded != DEFAULT_FORM


def test_form_from_query_rejects_float_only_whitespace() -> None:
    # Python float() strips ASCII control whitespace like U+001C that JS trim() keeps, so the JS
    # form rejects "47\x1c" as NaN. The backend must reject it too instead of sizing 47B.
    assert form_from_query("parameters_b=47\x1c&context_tokens=8000") == DEFAULT_FORM


# The grammar parse_decimal accepts must equal the frontend isDecimalNumber regex, and the value
# must equal what Number() yields, or the no-JS page and JS app size different deployments for the
# same URL. These pairs were cross-checked by running the live regex + Number() in Node against the
# same corpus; they pin grammar edges (leading/trailing dot, sign, uppercase exponent, leading
# zeros) the per-field tests above never exercise.
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("8", 8.0),
        ("1.3", 1.3),
        ("007", 7.0),  # leading zeros
        ("1.", 1.0),  # trailing dot, no fractional digits
        (".5", 0.5),  # leading dot, no integer digits
        ("+8", 8.0),  # explicit plus sign
        ("+.5", 0.5),
        ("1E3", 1000.0),  # uppercase exponent
        ("1e+5", 100000.0),
        ("0.0", 0.0),  # grammar accepts zero; positivity is enforced by FormInputs, not here
    ],
)
def test_parse_decimal_matches_frontend_number_grammar(raw: str, expected: float) -> None:
    assert parse_decimal(raw) == expected


# Strings the frontend regex rejects (Number() -> NaN): malformed orderings float() also rejects
# (".", "1e", "1.2.3"), non-decimal radixes ("0x10"), and separators ("12 34", "1,000"). The
# backend must reject every one so a crafted URL cannot size a deployment the JS app reset away.
@pytest.mark.parametrize(
    "raw",
    [".", "1e", "e5", ".e5", "1.5e", "1.2.3", "0x10", "0b1", "0o7", "12 34", "1,000", "Infinity"],
)
def test_parse_decimal_rejects_frontend_nan_strings(raw: str) -> None:
    with pytest.raises((ValueError, FormInputError)):
        parse_decimal(raw)
