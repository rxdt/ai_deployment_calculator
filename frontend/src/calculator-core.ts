import {
  architectureFor,
  type AttentionMemory,
  type TransformerArchitecture,
} from "./architecture";
import type {
  ExecutionMode,
  FormState,
  KvPrecision,
  ParameterUnit,
  Precision,
  RuntimeProfile,
  WorkloadFamily,
} from "./types";
import { trainingTokenCount } from "./workload-sizing";
import { hasMoeControl } from "./workload-visibility";

const BYTES_PER_GB = 1_000_000_000;

export const PRECISION_MAP: Record<
  Precision,
  { readonly weightBytes: number; readonly weightOverhead: number }
> = {
  "4-bit": { weightBytes: 0.5, weightOverhead: 1.15 },
  // OCP microscaling formats. MXFP4 stores 4-bit (E2M1) elements plus one 8-bit
  // block scale per 32-element block => 4.25 bpw for the quantized tensors. Real
  // MXFP4 checkpoints keep attention, shared experts, embeddings, and the LM head
  // at higher precision, so a 1.18 uplift lands the effective rate near ~5 bpw
  // rather than a flat 4-bit — the reason a plain "4-bit" line undercounts K3.
  // How much stays unquantized varies per checkpoint, so this is an estimate, not
  // a measurement: Kimi K3's published shards come to 4.49 bpw (a 1.057 uplift),
  // which is why that preset carries its exact file size instead of this line.
  // MXFP8 (E4M3 + 8-bit block scale) is 8.25 bpw with negligible unquantized-module uplift.
  MXFP4: { weightBytes: 4.25 / 8, weightOverhead: 1.18 },
  MXFP8: { weightBytes: 8.25 / 8, weightOverhead: 1 },
  "5-bit GGUF": { weightBytes: 0.625, weightOverhead: 1.12 },
  "6-bit GGUF": { weightBytes: 0.75, weightOverhead: 1.1 },
  "8-bit": { weightBytes: 1, weightOverhead: 1.05 },
  "16-bit": { weightBytes: 2, weightOverhead: 1 },
  "32-bit": { weightBytes: 4, weightOverhead: 1 },
  // Real published bits-per-weight tiers. The GGUF k-/i-quant figures already
  // fold in block-scale metadata (why Q4_K_M is 4.85 bpw, not a flat 4.0), so
  // weightBytes = bpw / 8 IS the resident bytes/param and no nominal-vs-real
  // overhead multiplier applies (weightOverhead 1). INT2/INT3 are given directly
  // in bytes/param (2- and 3-bit integer weights).
  IQ1_S: { weightBytes: 1.56 / 8, weightOverhead: 1 },
  IQ2_XXS: { weightBytes: 2.06 / 8, weightOverhead: 1 },
  IQ3_XXS: { weightBytes: 3.06 / 8, weightOverhead: 1 },
  Q4_K_M: { weightBytes: 4.85 / 8, weightOverhead: 1 },
  Q5_K_M: { weightBytes: 5.69 / 8, weightOverhead: 1 },
  Q6_K: { weightBytes: 6.59 / 8, weightOverhead: 1 },
  Q8_0: { weightBytes: 8.5 / 8, weightOverhead: 1 },
  INT2: { weightBytes: 0.25, weightOverhead: 1 },
  INT3: { weightBytes: 0.375, weightOverhead: 1 },
};

const UNIT_MULTIPLIERS: Record<ParameterUnit, number> = {
  B: 1,
  M: 0.001,
};

const KV_BYTES: Record<KvPrecision, number> = {
  "8-bit / FP8": 1,
  "16-bit": 2,
  "32-bit": 4,
};

export interface RuntimeAssumptions {
  readonly overheadGb: number;
  readonly buffer: number;
  readonly utilization: number;
}

interface VisionArchitecture {
  readonly layers: number;
  readonly hidden: number;
}

export interface CalculationSpec {
  readonly family: WorkloadFamily;
  readonly totalParamsB: number;
  readonly residentParamsB: number;
  readonly activeParamsB: number;
  // True when the entered active count exceeded total and was capped to it.
  readonly activeParamsClamped: boolean;
  readonly precision: Precision;
  readonly executionMode: ExecutionMode;
  readonly runtimeProfile: RuntimeProfile;
  readonly runtime: RuntimeAssumptions;
  readonly workloadSize: number;
  readonly kvBytes: number;
  readonly architecture: TransformerArchitecture;
  readonly attention: AttentionMemory;
  readonly visionArchitecture: VisionArchitecture | null;
  readonly knownModelFileSizeGb: number | null;
  readonly gpuResidentFraction: number;
  readonly loraTrainablePercent: number;
  readonly optimizerBytes: number;
  readonly gradientCheckpointing: boolean;
  readonly state: FormState;
}

export interface MemoryBreakdown {
  readonly weightsGb: number;
  readonly kvCacheGb: number;
  readonly inputActivationGb: number;
  readonly trainingStateGb: number;
  readonly runtimeOverheadGb: number;
  readonly safetyBufferGb: number;
  readonly requiredGb: number;
}

/**
 
@param value
@param fallback
*/
function decimal(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 
@param value
@param fallback
*/
function positive(value: string, fallback: number): number {
  const parsed = decimal(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

/**
 
@param value
@param fallback
*/
function nonNegative(value: string, fallback: number): number {
  const parsed = decimal(value, fallback);
  return parsed >= 0 ? parsed : fallback;
}

/**
 
@param value
@param fallback
*/
function fraction(value: string, fallback: number): number {
  const parsed = decimal(value, fallback);
  return parsed >= 0 ? Math.min(parsed, 1) : fallback;
}

/**

@param state
*/
function totalParametersB(state: Readonly<FormState>): number {
  return (
    nonNegative(state.totalParams, 7) * UNIT_MULTIPLIERS[state.parameterUnit]
  );
}

/**
 
@param value
@param digits
*/
export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
Round a memory quantity toward more memory at the requested precision.
@param value
@param digits
*/
export function roundUpTo(value: number, digits: number): number {
  return Math.ceil(value * 10 ** digits) / 10 ** digits;
}

// Default MLA latent widths (DeepSeek/Kimi scale) used when the form leaves the
// MLA fields blank but selects an MLA or hybrid attention model.
const DEFAULT_KV_LORA_RANK = 512;
const DEFAULT_ROPE_HEAD_DIM = 64;

// Resolve the transformer shape: the parameter-count bucket, with each field
// overridden when the form supplies a positive exact value (Kimi K3: 93 layers,
// hidden 7168, 96 heads). A blank or non-positive override keeps the bucket.
/**
Resolve the transformer shape for a model.
@param state - normalized form state
@param parametersB - total parameter count in billions
@returns the bucket shape with the form's exact overrides applied
*/
function architectureFrom(
  state: Readonly<FormState>,
  parametersB: number,
): TransformerArchitecture {
  const base = architectureFor(parametersB);
  return {
    layers: positive(state.layers, base.layers),
    hidden: positive(state.hiddenSize, base.hidden),
    attentionHeads: positive(state.attentionHeads, base.attentionHeads),
    kvHeads: positive(state.kvHeads, base.kvHeads),
    headDim: positive(state.headDim, base.headDim),
  };
}

// Resolve the attention memory model. The two hybrid slices are clamped as a
// pair, not independently: a stack has `layers` layers to give away, so MLA
// takes what it asks for (up to the depth) and KDA takes only what is left.
// Clamping each against the depth alone would accept 93 MLA *and* 93 KDA on a
// 93-layer model and charge the cache for both.
/**
Resolve the decoder's attention memory model from the form's controls.
@param state - normalized form state
@param layers - the resolved stack depth
@returns the attention memory model, with mlaLayers + kdaLayers <= layers
*/
function attentionFrom(
  state: Readonly<FormState>,
  layers: number,
): AttentionMemory {
  const mlaLayers = Math.min(nonNegative(state.mlaLayers, 0), layers);
  return {
    type: state.attentionType,
    mlaLayers,
    kdaLayers: Math.min(nonNegative(state.kdaLayers, 0), layers - mlaLayers),
    kvLoraRank: positive(state.kvLoraRank, DEFAULT_KV_LORA_RANK),
    ropeHeadDim: positive(state.ropeHeadDim, DEFAULT_ROPE_HEAD_DIM),
  };
}

/**
 
@param mode
@param runtimeProfile
*/
export function runtimeAssumptions(
  mode: ExecutionMode,
  runtimeProfile: RuntimeProfile,
): RuntimeAssumptions {
  if (mode !== "Inference") {
    return { overheadGb: 4, buffer: 1.25, utilization: 0.8 };
  }
  if (runtimeProfile === "Local / Edge") {
    return { overheadGb: 0.5, buffer: 1, utilization: 0.9 };
  }
  return { overheadGb: 1.5, buffer: 1.1, utilization: 0.85 };
}

/**
 
@param name
*/
function optimizerBytes(name: FormState["optimizer"]): number {
  // Quantized 8-bit optimizer state (bitsandbytes) is ~25% of AdamW's 8 bytes;
  // paging only moves that state dynamically, so it sizes the same 2 bytes.
  if (name === "8-bit Adam" || name === "Paged 8-bit AdamW") {
    return 2;
  }
  // Adafactor's factored second moment is sublinear in parameters; 1 byte per
  // parameter is the conservative scalar stand-in for this bytes/param model.
  if (name === "Adafactor") {
    return 1;
  }
  if (name === "SGD-like") {
    return 4;
  }
  return 8;
}

/**
 
@param state
*/
export function specFromState(state: Readonly<FormState>): CalculationSpec {
  const total = totalParametersB(state);
  const isMoeEnabled = hasMoeControl(state.workloadFamily) && state.moeEnabled;
  // Entered active count, before the "cannot exceed total" cap below.
  const wantActive = isMoeEnabled ? positive(state.activeParams, total) : total;
  const architecture = architectureFrom(state, total);
  return {
    family: state.workloadFamily,
    totalParamsB: total,
    residentParamsB: total,
    activeParamsB: Math.min(wantActive, total),
    activeParamsClamped: wantActive > total,
    precision: state.precision,
    executionMode: state.executionMode,
    runtimeProfile: state.runtimeProfile,
    runtime: runtimeAssumptions(state.executionMode, state.runtimeProfile),
    workloadSize: positive(state.workloadSize, 1),
    kvBytes: KV_BYTES[state.kvCachePrecision],
    architecture,
    attention: attentionFrom(state, architecture.layers),
    visionArchitecture: null,
    knownModelFileSizeGb: state.knownModelFileSizeGb.trim()
      ? positive(state.knownModelFileSizeGb, 0) || null
      : null,
    gpuResidentFraction: fraction(state.gpuResidentFraction, 1),
    loraTrainablePercent: Math.min(
      nonNegative(state.loraTrainablePercent, 0.5),
      100,
    ),
    optimizerBytes: optimizerBytes(state.optimizer),
    gradientCheckpointing: state.gradientCheckpointing,
    state,
  };
}

/**
 
@param spec
*/
export function weightsGb(spec: Readonly<CalculationSpec>): number {
  if (spec.executionMode === "Full training") {
    return spec.totalParamsB * PRECISION_MAP[spec.precision].weightBytes;
  }
  if (spec.knownModelFileSizeGb !== null) {
    return spec.knownModelFileSizeGb * spec.gpuResidentFraction;
  }
  // QLoRA freezes an NF4 4-bit base regardless of the selected inference
  // precision, so its weights track the 4-bit tier, not spec.precision.
  const precisionKey =
    spec.executionMode === "QLoRA fine-tuning" ? "4-bit" : spec.precision;
  const precision = PRECISION_MAP[precisionKey];
  return (
    spec.residentParamsB * precision.weightBytes * precision.weightOverhead
  );
}

/**
 
@param spec
*/
export function trainingActivationGb(spec: Readonly<CalculationSpec>): number {
  const factor = spec.gradientCheckpointing ? 3 : 8;
  return (
    (factor *
      spec.workloadSize *
      trainingTokenCount(spec.state) *
      spec.architecture.layers *
      spec.architecture.hidden *
      2) /
    BYTES_PER_GB
  );
}

/**
 
@param spec
*/
export function trainingStateGb(spec: Readonly<CalculationSpec>): number {
  if (spec.executionMode === "Inference") {
    return 0;
  }
  if (spec.executionMode === "Full training") {
    return spec.totalParamsB * (4 + 2 + spec.optimizerBytes);
  }
  const adapterParameters =
    spec.totalParamsB * (spec.loraTrainablePercent / 100);
  return adapterParameters * (2 + 2 + spec.optimizerBytes);
}
