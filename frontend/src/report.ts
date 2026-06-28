import {
  STANDARD_HEURISTIC_WARNING,
  accuracyFor,
  memoryBreakdown,
  specFromState,
  speedEstimate,
  weightsGb,
} from "./calculator";
import { formatGb, hardwareRecommendation } from "./hardware";
import type { DisplayRow, FormState, ReportPayload } from "./types";

export { specFromState } from "./calculator";

function row(label: string, value: number): DisplayRow | null {
  const formatted = formatGb(value);
  return formatted === "0.0 GB" ? null : { label, value: formatted };
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

const TRANSFORMER_ARCHITECTURE_FAMILIES = new Set<FormState["workload_family"]>(
  [
    "text_generation",
    "text_encoder",
    "encoder_decoder",
    "vision_language",
    "custom",
  ],
);

function isTransformerArchitectureWorkload(
  family: FormState["workload_family"],
): boolean {
  return TRANSFORMER_ARCHITECTURE_FAMILIES.has(family);
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
  if (
    !state.exact_transformer_architecture &&
    isTransformerArchitectureWorkload(state.workload_family)
  ) {
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
    { label: "Context memory precision", value: state.kv_cache_precision },
    { label: "Conservative KV heads", value: "attention_heads" },
  ];
}

function weightsLabel(state: FormState): string {
  return state.execution_mode === "QLoRA fine-tuning"
    ? "QLoRA base model memory"
    : "Model memory";
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
    accuracy: accuracyFor(spec),
    breakdown: compactRows([
      row(weightsLabel(state), breakdown.weightsGb),
      row("Context memory", breakdown.kvCacheGb),
      row("Activation memory", breakdown.inputActivationGb),
      row("Training memory", breakdown.trainingStateGb),
      row("Runtime reserve", breakdown.runtimeOverheadGb),
      row("Safety margin", breakdown.safetyBufferGb),
    ]),
    assumptions: assumptionRows(state),
    warnings: warningsFor(state),
    calculation: `(${breakdown.weightsGb.toFixed(1)} + ${breakdown.kvCacheGb.toFixed(1)} + ${breakdown.inputActivationGb.toFixed(1)} + ${breakdown.trainingStateGb.toFixed(1)} + ${breakdown.runtimeOverheadGb.toFixed(1)}) * ${spec.runtime.buffer.toFixed(2)} = ${formatGb(required)}`,
  };
}
