"""Adversarial tests for the JSON payload contract the Vite frontend depends on.

`frontend/src/main.ts` types this payload as `ReportPayload` and feeds every string
field through `escapeHtml`, which throws on a non-string. The existing endpoint test
only spot-checks a few values, so a renamed/dropped key or a raw float leaking out of
`view.py` would pass CI yet silently break the frontend (blank tables, runtime error).
These tests pin the full structure and value types so that regression is caught here.
"""

from __future__ import annotations

import json
from typing import Any

from hardware import GPU_CATALOG
from web.api import report_payload

QUERY = "parameters_b=8&context_tokens=8000"

TOP_KEYS = {
    "total_vram",
    "host_ram",
    "plan",
    "breakdown",
    "hardware",
    "comparison",
    "assumptions",
    "calculation",
}


def payload() -> dict[str, Any]:
    """Return the frontend payload with a permissive value type for structural assertions."""
    return report_payload(QUERY)


def test_payload_exposes_exactly_the_keys_the_frontend_consumes() -> None:
    data = payload()

    assert set(data) == TOP_KEYS
    assert set(data["plan"]) == {"primary", "primary_fit", "optimization"}


def test_payload_rows_carry_exactly_their_frontend_keys() -> None:
    data = payload()

    assert all(set(row) == {"label", "value"} for row in data["breakdown"])
    assert all(set(row) == {"name", "detail", "sharding"} for row in data["hardware"])
    assert all(set(row) == {"precision", "total", "savings", "selected"} for row in data["comparison"])
    assert all(set(row) == {"label", "value"} for row in data["assumptions"])


def test_payload_row_counts_track_their_sources() -> None:
    data = payload()

    # One hardware row per catalog GPU, four precision rows, exactly one selected.
    assert len(data["hardware"]) == len(GPU_CATALOG)
    assert len(data["comparison"]) == 4
    assert sum(row["selected"] for row in data["comparison"]) == 1


def test_payload_display_fields_are_strings_so_escapehtml_cannot_throw() -> None:
    data = payload()

    for key in ("total_vram", "host_ram", "calculation"):
        assert isinstance(data[key], str)
    assert all(isinstance(value, str) for value in data["plan"].values())
    for table in ("breakdown", "hardware", "comparison", "assumptions"):
        for row in data[table]:
            string_values = [value for key, value in row.items() if key != "selected"]
            assert all(isinstance(value, str) for value in string_values)
    assert all(isinstance(row["selected"], bool) for row in data["comparison"])


def test_payload_is_json_serializable() -> None:
    # The endpoint returns this via JSONResponse; a leaked dataclass/float would break that.
    assert json.loads(json.dumps(payload())) == payload()
