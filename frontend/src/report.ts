import {
  specFromState,
  weightsGb,
  type MemoryBreakdown,
} from "./calculator-core";
import { confidenceLabel } from "./confidence";
import {
  formatGb,
  hardware,
  hardwareRecommendation,
  minimumRawVramGb,
  speedLabel,
  speedTierFor,
} from "./hardware";
import type { DisplayRow, FormState, ReportPayload } from "./types";
import { memoryBreakdown, speedEstimate } from "./workload-memory";
import { hasDecoderKvCache, hasMoeControl } from "./workload-visibility";

export { specFromState } from "./calculator-core";

/**
 
@param label
@param value
*/
function row(label: string, value: number): DisplayRow | null {
  const formatted = formatGb(value);
  return formatted === "0.0 GB" ? null : { label, value: formatted };
}

/**
 
@param rows
*/
function compactRows(
  rows: readonly (Readonly<DisplayRow> | null)[],
): DisplayRow[] {
  return rows.filter(
    (candidate): candidate is DisplayRow => candidate !== null,
  );
}

/**
 
@param state
*/
function trainingWarning(state: Readonly<FormState>): string | null {
  if (state.executionMode !== "Inference") {
    return "Training estimates include parameter state and checkpointed activations, but real runs vary by optimizer, sequence packing, and framework.";
  }
  return null;
}

/**
 
@param state
*/
function warningsFor(state: Readonly<FormState>): string[] {
  const warnings: string[] = [];
  const conditional = trainingWarning(state);
  if (conditional !== null) {
    warnings.push(conditional);
  }
  if (state.moeEnabled && hasMoeControl(state.workloadFamily)) {
    warnings.push(
      "MoE active parameters affect speed, not resident weight memory, unless expert offload or sharding is enabled.",
    );
  }
  return warnings;
}

/**
 
@param state
*/
function assumptionRows(state: Readonly<FormState>): DisplayRow[] {
  const rows: DisplayRow[] = [
    { label: "Precision", value: state.precision },
    { label: "Runtime profile", value: state.runtimeProfile },
    { label: "Execution mode", value: state.executionMode },
  ];
  if (!hasDecoderKvCache(state)) {
    return rows;
  }
  const spec = specFromState(state);
  return [
    ...rows,
    { label: "KV Cache precision", value: state.kvCachePrecision },
    { label: "KV heads used", value: spec.architecture.kvHeads.toString() },
    {
      label: "Conservative KV heads",
      value: spec.architecture.attentionHeads.toString(),
    },
  ];
}

/**
 
@param state
*/
function weightsLabel(state: Readonly<FormState>): string {
  return state.executionMode === "QLoRA fine-tuning"
    ? "QLoRA base model memory"
    : "Model memory";
}

/**
 
@param breakdown
@param required
@param buffer
*/
function formulaText(
  breakdown: Readonly<MemoryBreakdown>,
  required: number,
  buffer: number,
): string {
  const working = breakdown.kvCacheGb + breakdown.inputActivationGb;
  const terms = [
    `Weights_GB ${formatGb(breakdown.weightsGb)}`,
    `Working_Memory_GB ${formatGb(working)}`,
    `Training_State_GB ${formatGb(breakdown.trainingStateGb)}`,
    `Runtime_Overhead_GB ${formatGb(breakdown.runtimeOverheadGb)}`,
  ].join(" + ");
  return `Required_GB = (${terms}) * Buffer ${buffer.toFixed(2)} = ${formatGb(required)}; Safety_Buffer_GB = ${formatGb(breakdown.safetyBufferGb)}`;
}

/**
 
@param state
*/
export function buildReport(state: Readonly<FormState>): ReportPayload {
  const spec = specFromState(state);
  const breakdown = memoryBreakdown(spec);
  const weights = weightsGb(spec);
  const { requiredGb: required } = breakdown;
  const { utilization } = spec.runtime;
  const canShard = state.memoryShardingEnabled;
  const recommendation = hardwareRecommendation(required, utilization, {
    allowSharding: canShard,
  });
  const tier = hardware(minimumRawVramGb(required, utilization), {
    allowSharding: canShard,
  });
  const speedTier = speedTierFor(tier);
  const warnings = warningsFor(state);
  if (speedTier.requiresSharding) {
    warnings.push(speedLabel(speedTier));
  }
  return {
    totalRequiredMemory: formatGb(required),
    recommendedHardware: recommendation,
    minimumRawVramNeeded: recommendation.minimumRawVram,
    confidence: confidenceLabel(state.workloadFamily),
    speed: speedEstimate(spec, weights, speedTier),
    breakdown: compactRows([
      row(weightsLabel(state), breakdown.weightsGb),
      row("Context memory", breakdown.kvCacheGb),
      row("Activation memory", breakdown.inputActivationGb),
      row("Training memory", breakdown.trainingStateGb),
      row("Runtime reserve", breakdown.runtimeOverheadGb),
      row("Safety margin", breakdown.safetyBufferGb),
    ]),
    assumptions: assumptionRows(state),
    warnings,
    calculation: formulaText(breakdown, required, spec.runtime.buffer),
  };
}
