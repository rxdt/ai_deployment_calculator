import * as z from "zod";
import type { ReportPayload } from "./types";

const nonEmpty = z.string().trim().min(1);

const row = z.object({
  label: nonEmpty,
  value: nonEmpty,
});

const hardware = z.object({
  requiredMemory: nonEmpty,
  usableVramTarget: nonEmpty,
  minimumRawVram: nonEmpty,
  recommendedTier: nonEmpty,
  math: nonEmpty,
});

const reportSchema = z.object({
  totalRequiredMemory: nonEmpty,
  recommendedHardware: hardware,
  minimumRawVramNeeded: nonEmpty,
  speed: nonEmpty,
  cloudCost: z.string().nullable(),
  accuracy: z.enum([
    "File-size based",
    "Component-based",
    "Advanced override",
    "Estimated",
    "Rough",
  ]),
  breakdown: z.array(row).min(2),
  assumptions: z.array(row).min(1),
  warnings: z.array(nonEmpty).min(1),
  calculation: nonEmpty,
});

export function isReportPayload(value: unknown): value is ReportPayload {
  return reportSchema.safeParse(value).success;
}
