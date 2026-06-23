"""Pure view-model turning a deployment report into one-page display strings.

PRIORITY 3 of specs/vram_calculator.md wants a one-page (no-scroll) UI. The Reflex page
should render plain text, not format numbers itself, so this module converts the raw floats
and `HardwareOption` objects from `report.py` into display-ready rows. Keeping the formatting
here makes it fully testable and leaves the page a thin shell over these strings.
"""

from __future__ import annotations

from dataclasses import dataclass

from report import DeploymentReport
from web.presenter import FormInputs, report_from_form


def format_gb(value: float) -> str:
    """Format a GB quantity to one decimal place, matching the spec's rounding."""
    return f"{value:.1f} GB"


@dataclass(frozen=True)
class BreakdownRow:
    """One VRAM component line: its name and formatted GB value."""

    label: str
    value: str


@dataclass(frozen=True)
class HardwareRow:
    """A single GPU deployment option rendered for the one-page UI."""

    name: str  # GPU model, e.g. "RTX 4090".
    detail: str  # Card count and per-card VRAM, e.g. "2x 24 GB".
    sharding: str  # "single GPU" or "tensor parallel".


@dataclass(frozen=True)
class PlanSummary:
    """Primary deployment-plan strings rendered by the one-page UI."""

    primary: str
    primary_fit: str
    optimization: str


@dataclass(frozen=True)
class AssumptionRow:
    """One fixed assumption rendered in compact form."""

    label: str
    value: str


@dataclass(frozen=True)
class ComparisonRow:
    """One weight precision comparison row rendered in compact form."""

    precision: str
    total: str
    savings: str
    selected: bool


@dataclass(frozen=True)
class DeploymentView:
    """Display-ready deployment result for the one-page UI: total, breakdown, hardware."""

    total_vram: str
    host_ram: str
    plan: PlanSummary
    breakdown: tuple[BreakdownRow, ...]
    hardware: tuple[HardwareRow, ...]
    comparison: tuple[ComparisonRow, ...]
    assumptions: tuple[AssumptionRow, ...]


def fit_label_text(fit: str) -> str:
    """Format deployment-plan fit labels for display."""
    if fit == "single_gpu":
        return "single GPU"
    return fit.replace("_", " ")


def view_from_report(report: DeploymentReport) -> DeploymentView:
    """Convert a pure deployment report into display-ready strings for the one-page UI."""
    parts = report.breakdown
    breakdown = (
        BreakdownRow("Weights", format_gb(parts.weights)),
        BreakdownRow("KV cache", format_gb(parts.kv_cache)),
        BreakdownRow("Task overhead", format_gb(parts.task_overhead)),
        BreakdownRow("CUDA tax", format_gb(parts.cuda_tax)),
    )
    plan = report.plan
    hardware = tuple(
        HardwareRow(
            name=plan_option.option.gpu.name,
            detail=f"{plan_option.option.gpu_count}x {plan_option.option.gpu.vram_gb:.0f} GB",
            sharding=fit_label_text(plan_option.fit),
        )
        for plan_option in plan.options
    )
    assumptions = tuple(AssumptionRow(item.label, item.value) for item in report.assumptions.items)
    comparison = tuple(
        ComparisonRow(
            precision=f"{row.weight_bits}-bit",
            total=format_gb(row.total_gb),
            savings=format_gb(row.savings_gb),
            selected=row.selected,
        )
        for row in report.comparison.rows
    )
    return DeploymentView(
        total_vram=format_gb(report.total_vram_gb),
        host_ram=f"{report.host_ram_gb} GB host RAM",
        plan=PlanSummary(
            primary=plan.primary.option.gpu.name,
            primary_fit=fit_label_text(plan.primary.fit),
            optimization=plan.optimization,
        ),
        breakdown=breakdown,
        hardware=hardware,
        comparison=comparison,
        assumptions=assumptions,
    )


def view_from_form(form: FormInputs) -> DeploymentView:
    """Assemble the display-ready view straight from the one-page form controls."""
    return view_from_report(report_from_form(form))
