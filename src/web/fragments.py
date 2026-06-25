"""HTML fragment renderers for the deployment calculator results panel."""

from __future__ import annotations

from html import escape

from web.view import DeploymentView


def selected_class(selected: bool) -> str:
    """Return the table-row class for the current input precision."""
    return ' class="selected"' if selected else ""


def render_breakdown(view: DeploymentView) -> str:
    """Render compact VRAM component metric blocks."""
    rows = [
        f'<p class="metric">{escape(row.label)}<strong>{escape(row.value)}</strong></p>'
        for row in view.breakdown
    ]
    return "\n".join(rows)


def render_hardware_rows(view: DeploymentView) -> str:
    """Render GPU recommendation rows."""
    rows = [
        (f"<tr><td>{escape(row.name)}</td><td>{escape(row.detail)}</td><td>{escape(row.sharding)}</td></tr>")
        for row in view.tables.hardware
    ]
    return "\n".join(rows)


def render_comparison_rows(view: DeploymentView) -> str:
    """Render weight-precision comparison rows."""
    rows = [
        (
            f"<tr{selected_class(row.selected)}><td>{escape(row.precision)}</td>"
            f"<td>{escape(row.total)}</td><td>{escape(row.savings)}</td></tr>"
        )
        for row in view.tables.comparison
    ]
    return "\n".join(rows)


def render_assumptions(view: DeploymentView) -> str:
    """Render compact fixed-assumption rows."""
    rows = [
        f"<p>{escape(row.label)}: <strong>{escape(row.value)}</strong></p>" for row in view.tables.assumptions
    ]
    return "\n".join(rows)
