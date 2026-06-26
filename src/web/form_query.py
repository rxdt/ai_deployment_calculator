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

# Code points JS `String.prototype.trim()` strips (WhiteSpace + LineTerminator); the JS form trims
# before validating, so the backend must strip the same set rather than Python's wider `float()`
# whitespace (e.g. U+001C-U+001F), which JS keeps and rejects.
JS_WHITESPACE = "".join(
    chr(code)
    for code in (
        0x09,
        0x0A,
        0x0B,
        0x0C,
        0x0D,
        0x20,
        0xA0,
        0x1680,
        0x2000,
        0x2001,
        0x2002,
        0x2003,
        0x2004,
        0x2005,
        0x2006,
        0x2007,
        0x2008,
        0x2009,
        0x200A,
        0x2028,
        0x2029,
        0x202F,
        0x205F,
        0x3000,
        0xFEFF,
    )
)
# The only characters the Vite form's `isDecimalNumber` regex permits; anything else (underscores,
# non-ASCII digits, `inf`/`nan` letters, `float()`-only whitespace) makes `Number()` return `NaN`.
DECIMAL_CHARS = frozenset("0123456789.eE+-")


def parse_decimal(raw: str) -> float:
    """Parse a decimal like the frontend's trimmed `Number()` so the no-JS page agrees with the JS app.

    Python's `float()` accepts inputs the Vite form rejects as `NaN`, which would let the static
    server page silently size a different deployment than the JS app for the same URL: digit-group
    underscores ("1_000"), non-ASCII numerals (full-width digits), and `float()`-only whitespace.
    Conversely the JS form trims Unicode whitespace (e.g. U+00A0) before validating, so a padded
    decimal it accepts as 1.5 must parse here too instead of resetting to the default deployment.
    Restricting to the decimal alphabet before `float()` rejects everything `Number()` rejects while
    `float()` still rejects malformed orderings like "1.2.3".
    """
    trimmed = raw.strip(JS_WHITESPACE)
    if not trimmed or any(char not in DECIMAL_CHARS for char in trimmed):
        raise FormInputError(INVALID_FORM_MESSAGE)
    return float(trimmed)


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
    # keep_blank_values mirrors JS `URLSearchParams.getAll`, which keeps blank values; the JS form
    # reads the last value, so a trailing blank (e.g. "weight_bits=8&weight_bits=") must reset here
    # too instead of falling back to the prior value Python would otherwise drop and keep sizing.
    raw_params = {key: values[-1] for key, values in parse_qs(query_string, keep_blank_values=True).items()}
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
