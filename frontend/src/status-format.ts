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
    return "–";
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
    return "–";
  }
  if (hardwareClass.startsWith("No single-accelerator fit")) {
    return "multi-GPU";
  }
  // The top overflow tier is described as "> 320 GB: distributed multi-node …";
  // compact it so the fixed-width header never renders the full sentence and
  // overflows on narrow viewports. Every other class here starts with "<N> GB",
  // so the capacity is the text up to and including that unit.
  if (hardwareClass.startsWith(">")) {
    return "multi-node";
  }
  const [amount = ""] = hardwareClass.split(" GB");
  const capacity = `${amount} GB`;
  return hardwareClass.includes("sharded") ? `${capacity} sharded` : capacity;
}
