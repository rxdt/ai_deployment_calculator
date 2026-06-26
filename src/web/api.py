"""JSON payload assembly for the Vite calculator frontend."""

from __future__ import annotations

from dataclasses import asdict

from web.form_query import form_from_query
from web.view import view_from_form


def report_payload(query_string: str) -> dict[str, object]:
    """Return the display-ready deployment payload for a submitted query string."""
    view = view_from_form(form_from_query(query_string))
    return {
        "total_vram": view.total_vram,
        "host_ram": view.host_ram,
        "plan": asdict(view.plan),
        "breakdown": [asdict(row) for row in view.breakdown],
        "hardware": [asdict(row) for row in view.tables.hardware],
        "comparison": [asdict(row) for row in view.tables.comparison],
        "assumptions": [asdict(row) for row in view.tables.assumptions],
        "calculation": view.calculation,
    }
