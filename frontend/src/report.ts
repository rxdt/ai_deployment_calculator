import {
  STANDARD_HEURISTIC_WARNING,
  accuracyFor,
  memoryBreakdown,
  specFromState,
  speedEstimate,
  weightsGb,
} from "./calculator";
import { cloudCost, formatGb, hardwareRecommendation } from "./hardware";
import type { DisplayRow, FormState, ReportPayload } from "./types";

export { specFromState } from "./calculator";

function row(label: string, value: number): DisplayRow | null {
  return value === 0 ? null : { label, value: formatGb(value) };
}

function compactRows(rows: readonly (DisplayRow | null)[]): DisplayRow[] {
  return rows.filter(
    (candidate): candidate is DisplayRow => candidate !== null,
  );
}

function familyWarning(state: FormState): string | null {
  if (state.execution_mode !== "Inference") {
    return "Training estimates include parameter state and checkpointed activations, but real runs vary by optimizer, sequence packing, and framework.";
  }
  if (
    state.workload_family === "image_diffusion" ||
    state.workload_family === "video_generation"
  ) {
    return "Diffusion and video estimates are rough because pipeline components, schedulers, and resolution choices dominate memory.";
  }
  if (state.workload_family === "tabular") {
    return "Tabular estimates model batch working memory, not every classical ML algorithm or data-loader path.";
  }
  if (state.workload_family === "vision") {
    return "Vision estimates depend on patching, image count, and preprocessing buffers.";
  }
  if (state.workload_family === "audio") {
    return "Audio estimates depend on tokenizer stride, chunking, and streaming buffers.";
  }
  return null;
}

function warningsFor(state: FormState): string[] {
  const warnings = [STANDARD_HEURISTIC_WARNING];
  const conditional = familyWarning(state);
  if (conditional !== null) {
    warnings.push(conditional);
  }
  if (state.moe_enabled) {
    warnings.push(
      "MoE active parameters affect speed, not resident weight memory, unless expert offload or sharding is enabled.",
    );
  }
  if (
    state.runtime_profile === "Local / Edge" &&
    state.my_gpu_vram_gb.trim() !== ""
  ) {
    warnings.push(
      "Local GPU fit uses usable VRAM, so drivers, displays, and other processes can still force offload.",
    );
  }
  if (!state.exact_transformer_architecture) {
    warnings.push(
      "Transformer architecture is estimated from the parameter count.",
    );
  }
  return warnings;
}

function assumptionRows(state: FormState): DisplayRow[] {
  return [
    { label: "Precision", value: state.precision },
    { label: "Runtime profile", value: state.runtime_profile },
    { label: "Execution mode", value: state.execution_mode },
    { label: "KV cache precision", value: state.kv_cache_precision },
    { label: "Conservative KV heads", value: "attention_heads" },
  ];
}

export function buildReport(state: FormState): ReportPayload {
  const spec = specFromState(state);
  const breakdown = memoryBreakdown(spec);
  const weights = weightsGb(spec);
  const required = breakdown.requiredGb;
  const hardware = hardwareRecommendation(required, spec.runtime.utilization);
  return {
    totalRequiredMemory: formatGb(required),
    recommendedHardware: hardware,
    minimumRawVramNeeded: hardware.minimumRawVram,
    speed: speedEstimate(spec, weights),
    cloudCost:
      state.runtime_profile === "Server / Cloud"
        ? cloudCost(
            required,
            spec.runtime.utilization,
            state.cloud_cost_override,
          )
        : null,
    accuracy: accuracyFor(spec),
    breakdown: compactRows([
      row("Model / pipeline weights", breakdown.weightsGb),
      row("KV cache", breakdown.kvCacheGb),
      row("Input / activation memory", breakdown.inputActivationGb),
      row("Training state", breakdown.trainingStateGb),
      row("Runtime overhead", breakdown.runtimeOverheadGb),
      row("Safety buffer", breakdown.safetyBufferGb),
    ]),
    assumptions: assumptionRows(state),
    warnings: warningsFor(state),
    calculation: `(${breakdown.weightsGb.toFixed(1)} + ${breakdown.kvCacheGb.toFixed(1)} + ${breakdown.inputActivationGb.toFixed(1)} + ${breakdown.trainingStateGb.toFixed(1)} + ${breakdown.runtimeOverheadGb.toFixed(1)}) * ${spec.runtime.buffer.toFixed(2)} = ${formatGb(required)}`,
  };
}
