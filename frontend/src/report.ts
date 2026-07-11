import {
  specFromState,
  weightsGb,
  type MemoryBreakdown,
} from "./calculator-core";
import {
  formatGb,
  hardware,
  hardwareRecommendation,
  minimumRawVramGb,
  speedLabel,
  speedTierFor,
} from "./hardware";
import { assumptionRows } from "./report-assumptions";
import { fitMeter } from "./result-format";
import type {
  DisplayRow,
  FormState,
  HardwareRecommendation,
  ReportPayload,
} from "./types";
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

@param label
@param value
*/
function requiredRow(label: string, value: number): DisplayRow {
  return { label, value: formatGb(value) };
}

/**

@param value
*/
function multiplierRow(value: number): DisplayRow {
  return { label: "Buffer multiplier", value: `${value.toFixed(2)}x` };
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
function weightsLabel(state: Readonly<FormState>): string {
  return state.executionMode === "QLoRA fine-tuning"
    ? "QLoRA base model memory"
    : "Model memory";
}

/**
Return the symbolic formula shown separately from substituted values.
*/
function formulaText(): string {
  return "Required_GB = (Weights_GB + Working_Memory_GB + Training_State_GB + Runtime_Overhead_GB) * Buffer; Safety_Buffer_GB = Base_GB * (Buffer - 1)";
}

/**

@param breakdown
@param buffer
*/
function calculationRows(
  breakdown: Readonly<MemoryBreakdown>,
  buffer: number,
): DisplayRow[] {
  const working = breakdown.kvCacheGb + breakdown.inputActivationGb;
  const base =
    breakdown.weightsGb +
    working +
    breakdown.trainingStateGb +
    breakdown.runtimeOverheadGb;
  return [
    requiredRow("Weights_GB (model memory)", breakdown.weightsGb),
    requiredRow("Context memory", breakdown.kvCacheGb),
    requiredRow("Activation memory", breakdown.inputActivationGb),
    requiredRow("Working_Memory_GB subtotal", working),
    requiredRow("Training_State_GB", breakdown.trainingStateGb),
    requiredRow("Runtime_Overhead_GB", breakdown.runtimeOverheadGb),
    requiredRow("Base_GB before buffer", base),
    multiplierRow(buffer),
    requiredRow("Safety_Buffer_GB", breakdown.safetyBufferGb),
    requiredRow("Required_GB", breakdown.requiredGb),
  ];
}

/**
The four headline stat chips shown under the hero: the answer's biggest levers
at a glance. Model weights and the dominant working-memory term (KV cache for
decoders, else activations) are the two largest contributors; the batch chip
reads as "Concurrency" for inference and "Micro Batch" for training; "Spare"
mirrors the fit meter's leftover budget, or "—" when no single card fits and
there is no usable-VRAM budget to divide.
@param state - normalized form state
@param breakdown - the computed memory breakdown
@param concurrency - the parsed batch/concurrency count
@param recommendation - the computed hardware recommendation
@returns the four chip label/value rows in display order
*/
function statChips(
  state: Readonly<FormState>,
  breakdown: Readonly<MemoryBreakdown>,
  concurrency: number,
  recommendation: Readonly<HardwareRecommendation>,
): DisplayRow[] {
  const meter = fitMeter(recommendation);
  const working = hasDecoderKvCache(state)
    ? { label: "KV Cache", value: formatGb(breakdown.kvCacheGb) }
    : { label: "Activations", value: formatGb(breakdown.inputActivationGb) };
  return [
    { label: "Model Weights", value: formatGb(breakdown.weightsGb) },
    working,
    {
      label:
        state.executionMode === "Inference" ? "Concurrency" : "Micro Batch",
      value: String(concurrency),
    },
    {
      label: "Spare",
      value: meter === null ? "—" : `${(100 - meter.fillPercent).toString()}%`,
    },
  ];
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
    speed: speedEstimate(spec, weights, speedTier),
    statChips: statChips(state, breakdown, spec.workloadSize, recommendation),
    breakdown: compactRows([
      row(weightsLabel(state), breakdown.weightsGb),
      row("Context memory", breakdown.kvCacheGb),
      row("Activation memory", breakdown.inputActivationGb),
      row("Training memory", breakdown.trainingStateGb),
      row("Runtime reserve", breakdown.runtimeOverheadGb),
      row("Safety margin", breakdown.safetyBufferGb),
    ]),
    calculationRows: calculationRows(breakdown, spec.runtime.buffer),
    assumptions: assumptionRows(state, spec),
    warnings,
    calculation: formulaText(),
  };
}
