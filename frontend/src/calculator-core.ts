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

export interface TransformerArchitecture {
  readonly layers: number;
  readonly hidden: number;
  readonly attentionHeads: number;
  readonly kvHeads: number;
  readonly headDim: number;
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
  readonly precision: Precision;
  readonly executionMode: ExecutionMode;
  readonly runtimeProfile: RuntimeProfile;
  readonly runtime: RuntimeAssumptions;
  readonly workloadSize: number;
  readonly kvBytes: number;
  readonly architecture: TransformerArchitecture;
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

// Transformer shape by parameter count (billions). Ordered ascending by the inclusive upper bound;
// the last entry (Infinity) is the fallback for the largest models.
interface ArchitectureBucket {
  readonly maxB: number;
  readonly architecture: TransformerArchitecture;
}

const ARCHITECTURE_BUCKETS: readonly [
  ArchitectureBucket,
  ...ArchitectureBucket[],
] = [
  {
    maxB: 1,
    architecture: {
      layers: 16,
      hidden: 2048,
      attentionHeads: 32,
      kvHeads: 8,
      headDim: 64,
    },
  },
  {
    maxB: 4,
    architecture: {
      layers: 28,
      hidden: 3072,
      attentionHeads: 24,
      kvHeads: 8,
      headDim: 128,
    },
  },
  {
    maxB: 10,
    architecture: {
      layers: 32,
      hidden: 4096,
      attentionHeads: 32,
      kvHeads: 8,
      headDim: 128,
    },
  },
  {
    maxB: 20,
    architecture: {
      layers: 40,
      hidden: 5120,
      attentionHeads: 40,
      kvHeads: 8,
      headDim: 128,
    },
  },
  {
    maxB: 40,
    architecture: {
      layers: 48,
      hidden: 6144,
      attentionHeads: 48,
      kvHeads: 8,
      headDim: 128,
    },
  },
  {
    maxB: 80,
    architecture: {
      layers: 80,
      hidden: 8192,
      attentionHeads: 64,
      kvHeads: 8,
      headDim: 128,
    },
  },
  {
    maxB: 160,
    architecture: {
      layers: 96,
      hidden: 10_240,
      attentionHeads: 80,
      kvHeads: 8,
      headDim: 128,
    },
  },
  {
    maxB: Infinity,
    architecture: {
      layers: 120,
      hidden: 12_288,
      attentionHeads: 96,
      kvHeads: 8,
      headDim: 128,
    },
  },
];

// The final bucket has maxB: Infinity, so it matches every finite input. Only NaN matches
// nothing (all comparisons are false); it then falls back to the first (smallest) bucket.
/**

@param parametersB
*/
export function architectureFor(parametersB: number): TransformerArchitecture {
  const bucket = ARCHITECTURE_BUCKETS.find(({ maxB }) => parametersB <= maxB);
  return (bucket ?? ARCHITECTURE_BUCKETS[0]).architecture;
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
  const knownFile = state.knownModelFileSizeGb.trim()
    ? positive(state.knownModelFileSizeGb, 0) || null
    : null;
  const isMoeEnabled = hasMoeControl(state.workloadFamily) && state.moeEnabled;
  return {
    family: state.workloadFamily,
    totalParamsB: total,
    residentParamsB: total,
    activeParamsB: isMoeEnabled
      ? Math.min(positive(state.activeParams, total), total)
      : total,
    precision: state.precision,
    executionMode: state.executionMode,
    runtimeProfile: state.runtimeProfile,
    runtime: runtimeAssumptions(state.executionMode, state.runtimeProfile),
    workloadSize: positive(state.workloadSize, 1),
    kvBytes: KV_BYTES[state.kvCachePrecision],
    architecture: architectureFor(total),
    visionArchitecture: null,
    knownModelFileSizeGb: knownFile,
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
