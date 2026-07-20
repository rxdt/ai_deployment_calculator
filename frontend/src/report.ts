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
import { fitMeter, type FitMeter } from "./result-format";
import type {
  DisplayRow,
  ExecutionMode,
  FormState,
  HardwareRecommendation,
  ParallelismStrategy,
  ReportPayload,
} from "./types";
import { memoryBreakdown, speedEstimate } from "./workload-memory";
import { hasDecoderKvCache } from "./workload-visibility";

export { specFromState } from "./calculator-core";

/**
Build a labeled calculation row with a GB-formatted value.
@param label - the row's display label
@param value - the row's memory figure in GB
@returns the label/value display row
*/
function requiredRow(label: string, value: number): DisplayRow {
  return { label, value: formatGb(value) };
}

/**
Build the buffer-multiplier calculation row (a ratio, not a GB figure).
@param value - the safety-buffer multiplier
@returns the label/value display row
*/
function multiplierRow(value: number): DisplayRow {
  return { label: "Buffer multiplier", value: `${value.toFixed(2)}x` };
}

// Actionable multi-GPU parallelism strategies, surfaced when no single card
// holds the workload. Each links its framework's canonical docs so the guidance
// is a concrete next step rather than a dead end, matching the design's sharding
// callout.
const PARALLELISM_STRATEGIES: readonly ParallelismStrategy[] = [
  { label: "FSDP", url: "https://pytorch.org/docs/stable/fsdp.html" },
  { label: "ZeRO", url: "https://www.deepspeed.ai/tutorials/zero/" },
  { label: "vLLM", url: "https://docs.vllm.ai/en/latest/" },
  {
    label: "TP",
    url: "https://huggingface.co/docs/transformers/en/perf_train_gpu_many#tensor-parallelism",
  },
];

// The per-mode formula terms, mirroring the real composition (memoryBreakdown):
// the buffer multiplies the whole subtotal, runtime overhead is included, and
// training modes carry no KV cache. The "Formula used" prose and the numbers
// line beneath it are both derived from this one table, so each printed value
// always sits under the word that names it ("training state" is the combined
// gradients + optimizer figure the calculation rows show). The exact buffer
// value shows in the calculation rows above.
interface FormulaTerm {
  readonly name: string;
  readonly value: (breakdown: Readonly<MemoryBreakdown>) => number;
  // Structural terms always print; a workload-dependent term (KV cache) drops
  // out of the formula when the family computes it as zero (diffusion, vision,
  // tabular…), so the prose never names memory the estimate doesn't contain.
  readonly omitWhenZero?: true;
}

const weightsTerm = (name: string): FormulaTerm => ({
  name,
  value: (breakdown) => breakdown.weightsGb,
});
const kvCacheTerm: FormulaTerm = {
  name: "KV cache",
  value: (breakdown) => breakdown.kvCacheGb,
  omitWhenZero: true,
};
const activationsTerm: FormulaTerm = {
  name: "activations",
  value: (breakdown) => breakdown.inputActivationGb,
};
const trainingTerm = (name: string): FormulaTerm => ({
  name,
  value: (breakdown) => breakdown.trainingStateGb,
});
const overheadTerm: FormulaTerm = {
  name: "runtime overhead",
  value: (breakdown) => breakdown.runtimeOverheadGb,
};

const MODE_TERMS: Readonly<Record<ExecutionMode, readonly FormulaTerm[]>> = {
  Inference: [
    weightsTerm("weights"),
    kvCacheTerm,
    activationsTerm,
    overheadTerm,
  ],
  "LoRA fine-tuning": [
    weightsTerm("base weights"),
    activationsTerm,
    trainingTerm("adapter training state"),
    overheadTerm,
  ],
  "QLoRA fine-tuning": [
    weightsTerm("4-bit weights"),
    activationsTerm,
    trainingTerm("adapter training state"),
    overheadTerm,
  ],
  "Full training": [
    weightsTerm("weights"),
    activationsTerm,
    trainingTerm("training state"),
    overheadTerm,
  ],
};

/**
Select the mode's formula terms that apply to this estimate: structural terms
always, workload-dependent terms only when non-zero. Both the prose and the
numbers line derive from this one selection so they stay in lockstep.
@param mode - the execution mode
@param breakdown - the computed memory breakdown
@returns the terms the formula should print, in order
*/
function formulaTerms(
  mode: ExecutionMode,
  breakdown: Readonly<MemoryBreakdown>,
): readonly FormulaTerm[] {
  return MODE_TERMS[mode].filter(
    (term) => term.omitWhenZero !== true || term.value(breakdown) > 0,
  );
}

/**
Compose the plain-language formula for this estimate's applicable terms.
@param mode - the execution mode
@param breakdown - the computed memory breakdown
@returns the one-line formula naming the estimate's terms
*/
function formulaText(
  mode: ExecutionMode,
  breakdown: Readonly<MemoryBreakdown>,
): string {
  const names = formulaTerms(mode, breakdown)
    .map((term) => term.name)
    .join(" + ");
  return `VRAM = (${names}) × buffer`;
}

/**
Substitute the estimate's actual numbers into the mode formula's shape, one
value per named term in the same order.
@param breakdown - the computed memory breakdown
@param buffer - the mode's safety-buffer multiplier
@param mode - the execution mode
@returns the formula with the real component values filled in
*/
function formulaNumbers(
  breakdown: Readonly<MemoryBreakdown>,
  buffer: number,
  mode: ExecutionMode,
): string {
  const memoryNumber = (value: number): string =>
    formatGb(value).replace(" GB", "");
  const sum = formulaTerms(mode, breakdown)
    .map((term) => memoryNumber(term.value(breakdown)))
    .join(" + ");
  // "≈": the components are rounded for display, so multiplying them back
  // does not always land exactly on the (separately rounded) total.
  return `${formatGb(breakdown.requiredGb)} ≈ (${sum}) GB × ${buffer.toFixed(2)}`;
}

/**
Build the itemized calculation rows shown in the "Values Used In Calculations" panel.
@param breakdown - the computed memory breakdown
@param buffer - the mode's safety-buffer multiplier
@returns the label/value rows in display order
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
    requiredRow("Model weights", breakdown.weightsGb),
    requiredRow("Context memory", breakdown.kvCacheGb),
    requiredRow("Activation memory", breakdown.inputActivationGb),
    requiredRow("Working memory subtotal", working),
    requiredRow("Training state", breakdown.trainingStateGb),
    requiredRow("Runtime overhead", breakdown.runtimeOverheadGb),
    requiredRow("Base subtotal before buffer", base),
    multiplierRow(buffer),
    requiredRow("Safety buffer", breakdown.safetyBufferGb),
    requiredRow("Total required", breakdown.requiredGb),
  ];
}

/**
The Headroom chip's leftover-budget reading. No single card fits (overflow):
report N/A rather than a literal 0% that reads as "just barely fits". "–" stays
reserved for no estimate at all.
@param meter - the computed fit meter, or null when there is no estimate
@returns the chip's display string
*/
function headroomValue(meter: FitMeter | null): string {
  if (meter === null) {
    return "–";
  }
  if (meter.isOverflow) {
    return "N/A";
  }
  return `${(100 - meter.fillPercent).toString()}%`;
}

/**
The four headline stat chips shown under the hero: the answer's biggest levers
at a glance. Model weights and the dominant working-memory term (KV cache for
decoders, else activations) are the two largest contributors; the batch chip
reads as "Concurrency" for inference and "Micro Batch" for training; "Headroom"
mirrors the fit meter's leftover budget, or "–" when no single card fits and
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
      label: "Headroom",
      value: headroomValue(meter),
    },
  ];
}

/**
Compute the full report the UI renders for a normalized form state: the memory
breakdown, hardware recommendation, speed estimate, and every display string.
@param state - normalized form state
@returns the complete report payload
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
  const minimumRaw = minimumRawVramGb(required, utilization);
  const tier = hardware(minimumRaw, { allowSharding: canShard });
  const speedTier = speedTierFor(tier);
  const requiresMultiGpu = speedTier.requiresSharding;
  const warnings: string[] = [];
  // The tier catalog is shared across runtime profiles, so a big Local / Edge
  // deployment can land on a datacenter class (H200/B200). Say what that means
  // locally instead of letting it read as a hardware-store suggestion. 96 GB
  // is the largest common local PCIe card (RTX PRO 6000 Blackwell).
  if (state.runtimeProfile === "Local / Edge" && minimumRaw > 96) {
    warnings.push(
      "Beyond typical local hardware: this needs more than 96 GB of advertised VRAM, larger than any common local PCIe card. Local routes are a large unified-memory Mac or sharding across multiple GPUs.",
    );
  }
  if (requiresMultiGpu) {
    warnings.push(speedLabel(speedTier));
  }
  // A MoE split cannot activate more parameters than the model has; the spec
  // caps it, so say the entered value was reduced rather than let it look honored.
  if (spec.activeParamsClamped) {
    warnings.push(
      `Active parameters exceed total and were capped at ${spec.totalParamsB.toString()}B. A mixture-of-experts model cannot activate more parameters than it has.`,
    );
  }
  return {
    totalRequiredMemory: formatGb(required),
    recommendedHardware: recommendation,
    minimumRawVramNeeded: recommendation.minimumRawVram,
    speed: speedEstimate(spec, weights, speedTier),
    statChips: statChips(state, breakdown, spec.workloadSize, recommendation),
    calculationRows: calculationRows(breakdown, spec.runtime.buffer),
    assumptions: assumptionRows(state, spec),
    warnings,
    parallelismStrategies: requiresMultiGpu ? PARALLELISM_STRATEGIES : [],
    calculation: formulaText(state.executionMode, breakdown),
    calculationNumbers: formulaNumbers(
      breakdown,
      spec.runtime.buffer,
      state.executionMode,
    ),
  };
}
