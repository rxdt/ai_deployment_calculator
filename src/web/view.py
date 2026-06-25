"""Pure view-model turning a deployment report into one-page display strings.

PRIORITY 3 of specs/vram_calculator.md wants a one-page (no-scroll) UI. The stdlib WSGI page
should render plain text, not format numbers itself, so this module converts the raw floats
and `HardwareOption` objects from `report.py` into display-ready rows. Keeping the formatting
here makes it fully testable and leaves the page a thin shell over these strings.
"""

from __future__ import annotations

from dataclasses import dataclass

from report import DeploymentReport, VramBreakdown, build_report
from web.presenter import FormInputs, spec_from_form


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
class ResultTables:
    """Grouped table data for the one-page UI."""

    hardware: tuple[HardwareRow, ...]
    comparison: tuple[ComparisonRow, ...]
    assumptions: tuple[AssumptionRow, ...]


@dataclass(frozen=True)
class DeploymentView:
    """Display-ready deployment result for the one-page UI."""

    total_vram: str
    host_ram: str
    plan: PlanSummary
    breakdown: tuple[BreakdownRow, ...]
    tables: ResultTables
    calculation: str  # Auditable VRAM equation with substituted component values.


def format_calculation(breakdown: VramBreakdown, total_vram_gb: float, runtime_margin: float) -> str:
    """Render the auditable VRAM equation so an engineer can check the estimate by hand.

    The margin is the deployment's actual safety margin, not a value back-computed from the
    rounded total; otherwise tiny deployments would display a fabricated multiplier (e.g. 1.13)
    that contradicts the documented 1.10/1.00 margins shown in the assumptions panel.
    """
    return (
        f"({breakdown.weights:.1f} + {breakdown.kv_cache:.1f} + "
        f"{breakdown.task_overhead:.1f} + {breakdown.cuda_tax:.1f}) "
        f"* {runtime_margin:.2f} = {total_vram_gb:.1f} GB"
    )


def view_from_report(report: DeploymentReport) -> DeploymentView:
    """Convert a pure deployment report into display-ready strings for the one-page UI."""
    parts = report.breakdown
    breakdown = (
        BreakdownRow("Weights", f"{parts.weights:.1f} GB"),
        BreakdownRow("KV cache", f"{parts.kv_cache:.1f} GB"),
        BreakdownRow("Task", f"{parts.task_overhead:.1f} GB"),
        BreakdownRow("CUDA/system", f"{parts.cuda_tax:.1f} GB"),
    )
    plan = report.plan
    hardware = tuple(
        HardwareRow(
            name=plan_option.option.gpu.name,
            detail=f"{plan_option.option.gpu_count}x {plan_option.option.gpu.vram_gb:.0f} GB",
            sharding="single GPU" if plan_option.fit == "single_gpu" else plan_option.fit.replace("_", " "),
        )
        for plan_option in plan.options
    )
    assumptions = tuple(AssumptionRow(item.label, item.value) for item in report.assumptions.items)
    comparison = tuple(
        ComparisonRow(
            precision=f"{row.weight_bits}-bit",
            total=f"{row.total_gb:.1f} GB",
            savings=f"{row.savings_gb:.1f} GB",
            selected=row.selected,
        )
        for row in report.comparison.rows
    )
    return DeploymentView(
        total_vram=f"{report.total_vram_gb:.1f} GB",
        host_ram=f"{report.host_ram_gb} GB host RAM",
        plan=PlanSummary(
            primary=plan.primary.option.gpu.name,
            primary_fit=(
                "single GPU" if plan.primary.fit == "single_gpu" else plan.primary.fit.replace("_", " ")
            ),
            optimization=plan.optimization,
        ),
        breakdown=breakdown,
        tables=ResultTables(hardware=hardware, comparison=comparison, assumptions=assumptions),
        calculation=format_calculation(parts, report.total_vram_gb, report.runtime_margin),
    )


def view_from_form(form: FormInputs) -> DeploymentView:
    """Assemble the display-ready view straight from the one-page form controls."""
    return view_from_report(build_report(spec_from_form(form)))
