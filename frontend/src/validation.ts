import type { ComparisonRow, DisplayRow, HardwareRow, ReportPayload } from "./types";

const SUPPORTED_PRECISION_LABELS = new Set(["32-bit", "16-bit", "8-bit", "4-bit"]);
const REQUIRED_ASSUMPTION_LABELS = new Set([
  "Safety margin",
  "CUDA/system tax",
  "KV cache heuristic",
  "Host RAM rule",
  "Supported precisions",
]);
const REQUIRED_BREAKDOWN_LABELS = ["Weights", "KV cache", "Task", "CUDA/system"];
const BREAKDOWN_ROW_COUNT = 4;
const COMPARISON_ROW_COUNT = 4;
const ASSUMPTION_ROW_COUNT = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function isDisplayRow(value: unknown): value is DisplayRow {
  return isRecord(value) && typeof value.label === "string" && typeof value.value === "string";
}

function isHardwareRow(value: unknown): value is HardwareRow {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    hasText(value.name) &&
    typeof value.detail === "string" &&
    hasText(value.detail) &&
    typeof value.sharding === "string" &&
    hasText(value.sharding)
  );
}

function isComparisonRow(value: unknown): value is ComparisonRow {
  return (
    isRecord(value) &&
    typeof value.precision === "string" &&
    typeof value.total === "string" &&
    hasText(value.total) &&
    typeof value.savings === "string" &&
    hasText(value.savings) &&
    typeof value.selected === "boolean"
  );
}

function hasSupportedComparisonRows(rows: ComparisonRow[], selectedWeightBits: string): boolean {
  const selectedRows = rows.filter((row) => row.selected);
  const precisionLabels = new Set(rows.map((row) => row.precision));
  return (
    selectedRows.length === 1 &&
    selectedRows[0].precision === `${selectedWeightBits}-bit` &&
    precisionLabels.size === SUPPORTED_PRECISION_LABELS.size &&
    Array.from(SUPPORTED_PRECISION_LABELS).every((precision) => precisionLabels.has(precision))
  );
}

function hasRequiredAssumptionRows(rows: DisplayRow[]): boolean {
  const assumptionLabels = new Set(rows.map((row) => row.label));
  return (
    rows.every((row) => hasText(row.value)) &&
    assumptionLabels.size === REQUIRED_ASSUMPTION_LABELS.size &&
    Array.from(REQUIRED_ASSUMPTION_LABELS).every((label) => assumptionLabels.has(label))
  );
}

function hasRequiredBreakdownRows(rows: DisplayRow[]): boolean {
  return rows.every(
    (row, index) => row.label === REQUIRED_BREAKDOWN_LABELS[index] && hasText(row.value),
  );
}

function hasValidPlan(value: Record<string, unknown>): boolean {
  return (
    isRecord(value.plan) &&
    typeof value.plan.primary === "string" &&
    hasText(value.plan.primary) &&
    typeof value.plan.primary_fit === "string" &&
    hasText(value.plan.primary_fit) &&
    typeof value.plan.optimization === "string" &&
    hasText(value.plan.optimization)
  );
}

function hasValidBreakdown(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.breakdown) &&
    value.breakdown.length === BREAKDOWN_ROW_COUNT &&
    value.breakdown.every(isDisplayRow) &&
    hasRequiredBreakdownRows(value.breakdown)
  );
}

function hasValidHardware(value: Record<string, unknown>): boolean {
  return Array.isArray(value.hardware) && value.hardware.length > 0 && value.hardware.every(isHardwareRow);
}

function hasValidComparison(value: Record<string, unknown>, selectedWeightBits: string): boolean {
  return (
    Array.isArray(value.comparison) &&
    value.comparison.length === COMPARISON_ROW_COUNT &&
    value.comparison.every(isComparisonRow) &&
    hasSupportedComparisonRows(value.comparison, selectedWeightBits)
  );
}

function hasValidAssumptions(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.assumptions) &&
    value.assumptions.length === ASSUMPTION_ROW_COUNT &&
    value.assumptions.every(isDisplayRow) &&
    hasRequiredAssumptionRows(value.assumptions)
  );
}

function hasValidTopLevelText(value: Record<string, unknown>): boolean {
  return (
    typeof value.total_vram === "string" &&
    hasText(value.total_vram) &&
    typeof value.host_ram === "string" &&
    hasText(value.host_ram) &&
    typeof value.calculation === "string" &&
    hasText(value.calculation)
  );
}

export function isReportPayload(value: unknown, selectedWeightBits: string): value is ReportPayload {
  return (
    isRecord(value) &&
    hasValidTopLevelText(value) &&
    hasValidPlan(value) &&
    hasValidBreakdown(value) &&
    hasValidHardware(value) &&
    hasValidComparison(value, selectedWeightBits) &&
    hasValidAssumptions(value)
  );
}
