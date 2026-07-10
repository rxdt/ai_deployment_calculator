import { recommendedGpuClass } from "./result-format";
import type { FormState, ReportPayload } from "./types";
import { hasMoeControl } from "./workload-visibility";

/**
 Format the model size shown in the compact header status strip.
 @param state - normalized calculator state
 @returns a compact model-size label
*/
export function statusModelLabel(state: Readonly<FormState>): string {
  const value = Number(state.totalParams);
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }
  const isMoe = state.moeEnabled && hasMoeControl(state.workloadFamily);
  return `${state.totalParams}${state.parameterUnit}${isMoe ? " MoE" : ""}`;
}

/**
 Format the execution mode shown in the compact header status strip.
 @param state - normalized calculator state
 @returns a short uppercase mode label
*/
export function statusModeLabel(state: Readonly<FormState>): string {
  return state.executionMode.replace(" fine-tuning", "").toUpperCase();
}

/**
 Format the fit summary shown in the compact header status strip.
 @param report - computed report payload
 @returns a compact fit label
*/
export function statusFitLabel(report: Readonly<ReportPayload>): string {
  const hardwareClass = recommendedGpuClass(
    report.recommendedHardware.recommendedTier,
  );
  if (hardwareClass === "No model loaded") {
    return "—";
  }
  if (hardwareClass.startsWith("No single-GPU fit")) {
    return "multi-GPU";
  }
  const capacity = /^\d+ GB/u.exec(hardwareClass)?.[0];
  if (capacity === undefined) {
    return hardwareClass;
  }
  return hardwareClass.includes("sharded") ? `${capacity} sharded` : capacity;
}
