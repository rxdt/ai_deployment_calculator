import * as z from "zod";
import type { ReportPayload } from "./types";

// Runtime validation for the report payload at the data boundary. Zod owns the
// structural shape (types, lengths, non-empty strings, exact labels); two small
// predicates own the cross-field rules zod can't express declaratively.

const SUPPORTED_PRECISIONS = ["32-bit", "16-bit", "8-bit", "4-bit"] as const;
const ASSUMPTION_LABELS = [
  "Safety margin",
  "CUDA/system tax",
  "KV cache heuristic",
  "Host RAM rule",
  "Supported precisions",
] as const;

// hasText(): reject empty or whitespace-only strings.
const nonEmpty = z.string().trim().min(1);

const breakdown = z.tuple([
  z.object({ label: z.literal("Weights"), value: nonEmpty }),
  z.object({ label: z.literal("KV cache"), value: nonEmpty }),
  z.object({ label: z.literal("Task"), value: nonEmpty }),
  z.object({ label: z.literal("CUDA/system"), value: nonEmpty }),
]);

const hardwareRow = z.object({
  name: nonEmpty,
  detail: nonEmpty,
  sharding: nonEmpty,
});

const comparisonRow = z.object({
  precision: z.string(),
  total: nonEmpty,
  savings: nonEmpty,
  selected: z.boolean(),
});

const assumptionRow = z.object({ label: z.string(), value: nonEmpty });

function hasSupportedSelection(
  rows: readonly z.infer<typeof comparisonRow>[],
  selectedWeightBits: string,
): boolean {
  const selectedPrecisions = rows
    .filter((row) => row.selected)
    .map((row) => row.precision);
  const precisions = new Set(rows.map((row) => row.precision));
  return (
    selectedPrecisions.length === 1 &&
    selectedPrecisions[0] === `${selectedWeightBits}-bit` &&
    SUPPORTED_PRECISIONS.every((precision) => precisions.has(precision))
  );
}

function hasAllAssumptionLabels(
  rows: readonly z.infer<typeof assumptionRow>[],
): boolean {
  const labels = new Set(rows.map((row) => row.label));
  return ASSUMPTION_LABELS.every((label) => labels.has(label));
}

function reportSchema(selectedWeightBits: string): z.ZodType {
  return z.object({
    total_vram: nonEmpty,
    host_ram: nonEmpty,
    calculation: nonEmpty,
    plan: z.object({
      primary: nonEmpty,
      primary_fit: nonEmpty,
      optimization: nonEmpty,
    }),
    breakdown,
    hardware: z.array(hardwareRow).min(1),
    comparison: z
      .array(comparisonRow)
      .length(4)
      .refine((rows) => hasSupportedSelection(rows, selectedWeightBits)),
    assumptions: z.array(assumptionRow).length(5).refine(hasAllAssumptionLabels),
  });
}

export function isReportPayload(
  value: unknown,
  selectedWeightBits: string,
): value is ReportPayload {
  return reportSchema(selectedWeightBits).safeParse(value).success;
}
