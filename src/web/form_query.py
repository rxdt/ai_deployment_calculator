"""Parse the one-page form's GET query string into a validated `FormInputs`.

This lives apart from `presenter.py` so the query-parsing helpers and the form model stay
small, focused modules. Every invalid or missing field collapses to `DEFAULT_FORM` so the
page renders the default deployment instead of an error.
"""

from __future__ import annotations

from urllib.parse import parse_qs

from web.presenter import (
    ARCHITECTURE_VALUES,
    BIT_VALUES,
    CHECKED_VALUES,
    DEFAULT_ACTIVE_PARAMETERS_B,
    DEFAULT_FORM,
    INVALID_FORM_MESSAGE,
    RUNTIME_VALUES,
    FormInputError,
    FormInputs,
)


def parse_decimal(raw: str) -> float:
    """Parse a decimal like the frontend's `Number()` so the no-JS page agrees with the JS app.

    Python's `float()` accepts inputs the Vite form's `Number()` rejects as `NaN`, which would let
    the static server page silently size a different deployment than the JS app for the same URL:
    digit-group underscores ("1_000" -> 1000.0) and non-ASCII numerals such as full-width Unicode
    digits (U+FF11.. -> 123.0), which `float()` normalizes but `Number()` rejects as `NaN`.
    """
    if "_" in raw or not raw.isascii():
        raise FormInputError(INVALID_FORM_MESSAGE)
    return float(raw)


def parse_context_tokens(raw: str) -> int:
    """Parse context tokens like the frontend's `Number.isInteger` guard.

    The Vite form accepts integer-valued floats such as "8000.0" or "8e3"; a bare `int()` rejects
    those and would silently drop every input back to the default deployment, so the rendered
    report would contradict the form the user sees.
    """
    value = parse_decimal(raw)
    if not value.is_integer():
        raise FormInputError(INVALID_FORM_MESSAGE)
    return int(value)


def form_from_query(query_string: str) -> FormInputs:
    """Build form inputs from a GET query string, falling back to defaults on missing/invalid input.

    Unchecked checkboxes are simply absent from the query, so they take their `False` default;
    invalid precisions, architectures, runtimes, or numbers raise into the single fallback below.
    """
    raw_params = {key: values[-1] for key, values in parse_qs(query_string).items()}
    if not raw_params:
        return DEFAULT_FORM
    try:
        architecture = ARCHITECTURE_VALUES[raw_params.get("architecture", DEFAULT_FORM.architecture)]
        runtime = RUNTIME_VALUES[raw_params.get("runtime", DEFAULT_FORM.runtime)]
        trained = raw_params.get("trained", "").lower() in CHECKED_VALUES
        active_parameters_b = (
            parse_decimal(raw_params.get("active_parameters_b", str(DEFAULT_ACTIVE_PARAMETERS_B)))
            if architecture == "moe"
            else None
        )
        return FormInputs(
            parameters_b=parse_decimal(raw_params["parameters_b"]),
            context_tokens=parse_context_tokens(raw_params["context_tokens"]),
            weight_bits=BIT_VALUES[raw_params.get("weight_bits", str(DEFAULT_FORM.weight_bits))],
            kv_cache_bits=BIT_VALUES[raw_params.get("kv_cache_bits", str(DEFAULT_FORM.kv_cache_bits))],
            trained=trained,
            use_adapter=trained and raw_params.get("use_adapter", "").lower() in CHECKED_VALUES,
            active_parameters_b=active_parameters_b,
            runtime=runtime,
        )
    except (ValueError, KeyError, FormInputError):
        return DEFAULT_FORM
