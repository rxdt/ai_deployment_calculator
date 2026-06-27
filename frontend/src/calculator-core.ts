import type {
  ExecutionMode,
  FormState,
  KvPrecision,
  ParameterUnit,
  Precision,
  RuntimeProfile,
  WorkloadFamily,
} from "./types";

const BYTES_PER_GB = 1_000_000_000;

export const STANDARD_HEURISTIC_WARNING =
  "This is a planning estimate, not a vendor guarantee. Validate with the exact model, runtime, batch shape, and hardware before buying or reserving GPUs.";

export const PRECISION_MAP: Record<
  Precision,
  { weightBytes: number; weightOverhead: number }
> = {
  "4-bit": { weightBytes: 0.5, weightOverhead: 1.15 },
  "5-bit GGUF": { weightBytes: 0.625, weightOverhead: 1.12 },
  "6-bit GGUF": { weightBytes: 0.75, weightOverhead: 1.1 },
  "8-bit": { weightBytes: 1, weightOverhead: 1.05 },
  "16-bit": { weightBytes: 2, weightOverhead: 1 },
  "32-bit": { weightBytes: 4, weightOverhead: 1 },
};

const UNIT_MULTIPLIERS: Record<ParameterUnit, number> = {
  B: 1,
  M: 0.001,
  K: 0.000001,
};

const KV_BYTES: Record<KvPrecision, number> = {
  "8-bit / FP8": 1,
  "16-bit": 2,
  "32-bit": 4,
};

export interface RuntimeAssumptions {
  overheadGb: number;
  buffer: number;
  utilization: number;
}

export interface TransformerArchitecture {
  layers: number;
  hidden: number;
  attentionHeads: number;
  kvHeads: number;
  headDim: number;
}

interface VisionArchitecture {
  layers: number;
  hidden: number;
}

export interface CalculationSpec {
  family: WorkloadFamily;
  totalParamsB: number;
  residentParamsB: number;
  activeParamsB: number;
  precision: Precision;
  executionMode: ExecutionMode;
  runtimeProfile: RuntimeProfile;
  runtime: RuntimeAssumptions;
  workloadSize: number;
  kvBytes: number;
  architecture: TransformerArchitecture;
  visionArchitecture: VisionArchitecture | null;
  knownModelFileSizeGb: number | null;
  gpuResidentFraction: number;
  loraTrainablePercent: number;
  optimizerBytes: number;
  gradientCheckpointing: boolean;
  exactArchitecture: boolean;
  state: FormState;
}

export interface MemoryBreakdown {
  weightsGb: number;
  kvCacheGb: number;
  inputActivationGb: number;
  trainingStateGb: number;
  runtimeOverheadGb: number;
  safetyBufferGb: number;
  requiredGb: number;
}

function decimal(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positive(value: string, fallback: number): number {
  const parsed = decimal(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function totalParametersB(state: FormState): number {
  return (
    positive(state.total_params, 7) * UNIT_MULTIPLIERS[state.parameter_unit]
  );
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function architectureFor(parametersB: number): TransformerArchitecture {
  if (parametersB <= 1) {
    return {
      layers: 16,
      hidden: 2048,
      attentionHeads: 32,
      kvHeads: 8,
      headDim: 64,
    };
  }
  if (parametersB <= 4) {
    return {
      layers: 28,
      hidden: 3072,
      attentionHeads: 24,
      kvHeads: 8,
      headDim: 128,
    };
  }
  if (parametersB <= 10) {
    return {
      layers: 32,
      hidden: 4096,
      attentionHeads: 32,
      kvHeads: 8,
      headDim: 128,
    };
  }
  if (parametersB <= 20) {
    return {
      layers: 40,
      hidden: 5120,
      attentionHeads: 40,
      kvHeads: 8,
      headDim: 128,
    };
  }
  if (parametersB <= 40) {
    return {
      layers: 48,
      hidden: 6144,
      attentionHeads: 48,
      kvHeads: 8,
      headDim: 128,
    };
  }
  if (parametersB <= 80) {
    return {
      layers: 80,
      hidden: 8192,
      attentionHeads: 64,
      kvHeads: 8,
      headDim: 128,
    };
  }
  if (parametersB <= 160) {
    return {
      layers: 96,
      hidden: 10_240,
      attentionHeads: 80,
      kvHeads: 8,
      headDim: 128,
    };
  }
  return {
    layers: 120,
    hidden: 12_288,
    attentionHeads: 96,
    kvHeads: 8,
    headDim: 128,
  };
}

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

function optimizerBytes(name: FormState["optimizer"]): number {
  if (name === "8-bit Adam") {
    return 2;
  }
  if (name === "SGD-like") {
    return 4;
  }
  return 8;
}

export function specFromState(state: FormState): CalculationSpec {
  const total = totalParametersB(state);
  const knownFile = state.known_model_file_size_gb.trim()
    ? positive(state.known_model_file_size_gb, 0)
    : null;
  return {
    family: state.workload_family,
    totalParamsB: total,
    residentParamsB: total,
    activeParamsB: state.moe_enabled
      ? positive(state.active_params, total)
      : total,
    precision: state.precision,
    executionMode: state.execution_mode,
    runtimeProfile: state.runtime_profile,
    runtime: runtimeAssumptions(state.execution_mode, state.runtime_profile),
    workloadSize: positive(state.workload_size, 1),
    kvBytes: KV_BYTES[state.kv_cache_precision],
    architecture: architectureFor(total),
    visionArchitecture: null,
    knownModelFileSizeGb: knownFile,
    gpuResidentFraction: positive(state.gpu_resident_fraction, 1),
    loraTrainablePercent: positive(state.lora_trainable_percent, 0.5),
    optimizerBytes: optimizerBytes(state.optimizer),
    gradientCheckpointing: state.gradient_checkpointing,
    exactArchitecture: state.exact_transformer_architecture,
    state,
  };
}

export function weightsGb(spec: CalculationSpec): number {
  if (spec.executionMode === "QLoRA fine-tuning") {
    return (
      spec.residentParamsB *
      PRECISION_MAP["4-bit"].weightBytes *
      PRECISION_MAP["4-bit"].weightOverhead
    );
  }
  if (spec.executionMode === "Full training") {
    return spec.totalParamsB * PRECISION_MAP[spec.precision].weightBytes;
  }
  if (spec.knownModelFileSizeGb !== null) {
    return spec.knownModelFileSizeGb * spec.gpuResidentFraction;
  }
  const precision = PRECISION_MAP[spec.precision];
  return (
    spec.residentParamsB * precision.weightBytes * precision.weightOverhead
  );
}

function sequenceForTraining(spec: CalculationSpec): number {
  const { state } = spec;
  if (spec.family === "encoder_decoder") {
    return (
      positive(state.input_tokens, 1024) + positive(state.output_tokens, 256)
    );
  }
  if (spec.family === "text_encoder") {
    return positive(state.sequence_tokens, 512);
  }
  return positive(state.context_tokens, 8000);
}

export function trainingActivationGb(spec: CalculationSpec): number {
  const factor = spec.gradientCheckpointing ? 3 : 8;
  return (
    (factor *
      spec.workloadSize *
      sequenceForTraining(spec) *
      spec.architecture.layers *
      spec.architecture.hidden *
      2) /
    BYTES_PER_GB
  );
}

export function trainingStateGb(spec: CalculationSpec): number {
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
