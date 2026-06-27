import type {
  Accuracy,
  ExecutionMode,
  FormState,
  KvPrecision,
  ParameterUnit,
  Precision,
  RuntimeProfile,
  WorkloadFamily,
} from "./types";

const BYTES_PER_GB = 1_000_000_000;
const DEFAULT_PATCH_SIZE = 16;
const DEFAULT_LATENT_DOWNSAMPLE = 8;
const DEFAULT_LATENT_CHANNELS = 4;
const DEFAULT_TEMPORAL_DOWNSAMPLE = 4;
const DEFAULT_AUDIO_TOKENS_PER_SECOND = 50;
const DEFAULT_FEATURE_BYTES = 4;
const DEFAULT_MEMORY_BANDWIDTH_GBPS = 936;

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
  K: 0.000_001,
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

function totalParamsB(state: FormState): number {
  return (
    positive(state.total_params, 7) * UNIT_MULTIPLIERS[state.parameter_unit]
  );
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function architectureFor(paramsB: number): TransformerArchitecture {
  if (paramsB <= 1) {
    return {
      layers: 16,
      hidden: 2048,
      attentionHeads: 32,
      kvHeads: 8,
      headDim: 64,
    };
  }
  if (paramsB <= 4) {
    return {
      layers: 28,
      hidden: 3072,
      attentionHeads: 24,
      kvHeads: 8,
      headDim: 128,
    };
  }
  if (paramsB <= 10) {
    return {
      layers: 32,
      hidden: 4096,
      attentionHeads: 32,
      kvHeads: 8,
      headDim: 128,
    };
  }
  if (paramsB <= 20) {
    return {
      layers: 40,
      hidden: 5120,
      attentionHeads: 40,
      kvHeads: 8,
      headDim: 128,
    };
  }
  if (paramsB <= 40) {
    return {
      layers: 48,
      hidden: 6144,
      attentionHeads: 48,
      kvHeads: 8,
      headDim: 128,
    };
  }
  if (paramsB <= 80) {
    return {
      layers: 80,
      hidden: 8192,
      attentionHeads: 64,
      kvHeads: 8,
      headDim: 128,
    };
  }
  if (paramsB <= 160) {
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
  _usesLocalFile: boolean,
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
  const total = totalParamsB(state);
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
    runtime: runtimeAssumptions(
      state.execution_mode,
      state.runtime_profile,
      knownFile !== null,
    ),
    workloadSize: positive(state.workload_size, 1),
    kvBytes: KV_BYTES[state.kv_cache_precision],
    architecture: architectureFor(total),
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
  if (
    spec.executionMode === "Inference" &&
    spec.runtimeProfile === "Local / Edge"
  ) {
    return spec.residentParamsB * precision.weightBytes;
  }
  return (
    spec.residentParamsB * precision.weightBytes * precision.weightOverhead
  );
}

function decoderKvGb(spec: CalculationSpec, tokens: number): number {
  const arch = spec.architecture;
  return (
    (spec.workloadSize *
      tokens *
      2 *
      arch.layers *
      arch.kvHeads *
      arch.headDim *
      spec.kvBytes) /
    BYTES_PER_GB
  );
}

function encoderActivationGb(spec: CalculationSpec, tokens: number): number {
  const arch = spec.architecture;
  return (
    (2 * spec.workloadSize * tokens * arch.layers * arch.hidden * 2) /
    BYTES_PER_GB
  );
}

function imageTokens(width: number, height: number): number {
  return (
    Math.ceil(width / DEFAULT_PATCH_SIZE) *
      Math.ceil(height / DEFAULT_PATCH_SIZE) +
    1
  );
}

function videoSize(resolution: FormState["video_resolution"]): {
  width: number;
  height: number;
} {
  return resolution === "1080p"
    ? { width: 1920, height: 1080 }
    : { width: 1280, height: 720 };
}

export function inferenceWorkingMemoryGb(
  spec: CalculationSpec,
  currentWeightsGb: number,
): {
  kvCacheGb: number;
  inputActivationGb: number;
} {
  const state = spec.state;
  if (spec.family === "text_generation") {
    return {
      kvCacheGb: decoderKvGb(spec, positive(state.context_tokens, 8000)),
      inputActivationGb: 0,
    };
  }
  if (spec.family === "text_encoder") {
    return {
      kvCacheGb: 0,
      inputActivationGb: encoderActivationGb(
        spec,
        positive(state.sequence_tokens, 512),
      ),
    };
  }
  if (spec.family === "encoder_decoder") {
    const input = encoderActivationGb(spec, positive(state.input_tokens, 1024));
    const kv = decoderKvGb(spec, positive(state.output_tokens, 256));
    return {
      kvCacheGb: kv,
      inputActivationGb: input + currentWeightsGb * 0.05,
    };
  }
  if (spec.family === "vision") {
    const width = positive(state.image_width, 1024);
    const height = positive(state.image_height, 1024);
    const tokens = imageTokens(width, height);
    const transformer = encoderActivationGb(spec, tokens);
    const pixels =
      (spec.workloadSize * width * height * 4 * 2 * 8) / BYTES_PER_GB;
    return { kvCacheGb: 0, inputActivationGb: Math.max(transformer, pixels) };
  }
  if (spec.family === "vision_language") {
    const imageTokenCount =
      positive(state.image_count, 1) *
      (imageTokens(
        positive(state.image_width, 1024),
        positive(state.image_height, 1024),
      ) -
        1);
    const kv = decoderKvGb(
      spec,
      positive(state.text_context_tokens, 4000) + imageTokenCount,
    );
    const vision = encoderActivationGb(spec, imageTokenCount);
    return {
      kvCacheGb: kv,
      inputActivationGb: vision + currentWeightsGb * 0.02,
    };
  }
  if (spec.family === "image_diffusion") {
    const latentHeight = Math.ceil(
      positive(state.image_height, 1024) / DEFAULT_LATENT_DOWNSAMPLE,
    );
    const latentWidth = Math.ceil(
      positive(state.image_width, 1024) / DEFAULT_LATENT_DOWNSAMPLE,
    );
    const latent =
      (spec.workloadSize *
        latentHeight *
        latentWidth *
        DEFAULT_LATENT_CHANNELS *
        2) /
      BYTES_PER_GB;
    return {
      kvCacheGb: 0,
      inputActivationGb: Math.max(latent * 64, currentWeightsGb * 0.35),
    };
  }
  if (spec.family === "video_generation") {
    const size = videoSize(state.video_resolution);
    const latentFrames = Math.ceil(
      positive(state.video_frames, 81) / DEFAULT_TEMPORAL_DOWNSAMPLE,
    );
    const latentHeight = Math.ceil(size.height / DEFAULT_LATENT_DOWNSAMPLE);
    const latentWidth = Math.ceil(size.width / DEFAULT_LATENT_DOWNSAMPLE);
    const latent =
      (spec.workloadSize *
        latentFrames *
        latentHeight *
        latentWidth *
        DEFAULT_LATENT_CHANNELS *
        2) /
      BYTES_PER_GB;
    return {
      kvCacheGb: 0,
      inputActivationGb: Math.max(latent * 96, currentWeightsGb * 0.5),
    };
  }
  if (spec.family === "audio") {
    const tokens =
      positive(state.audio_seconds, 30) * DEFAULT_AUDIO_TOKENS_PER_SECOND;
    return {
      kvCacheGb: 0,
      inputActivationGb: encoderActivationGb(spec, tokens),
    };
  }
  if (spec.family === "tabular") {
    const tabular =
      (positive(state.rows_per_batch, 10_000) *
        positive(state.features, 100) *
        DEFAULT_FEATURE_BYTES) /
      BYTES_PER_GB;
    return { kvCacheGb: 0, inputActivationGb: tabular * 4 };
  }
  return {
    kvCacheGb: 0,
    inputActivationGb:
      currentWeightsGb * 0.25 * positive(state.input_size_multiplier, 1),
  };
}

function sequenceForTraining(spec: CalculationSpec): number {
  const state = spec.state;
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
  if (spec.totalParamsB < 0.001) {
    return spec.totalParamsB * 200;
  }
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
  const adapterParams = spec.totalParamsB * (spec.loraTrainablePercent / 100);
  return adapterParams * (2 + 2 + spec.optimizerBytes);
}

export function memoryBreakdown(spec: CalculationSpec): MemoryBreakdown {
  const weights = weightsGb(spec);
  const working =
    spec.executionMode === "Inference"
      ? inferenceWorkingMemoryGb(spec, weights)
      : { kvCacheGb: 0, inputActivationGb: trainingActivationGb(spec) };
  const trainingState = trainingStateGb(spec);
  const subtotal =
    weights +
    working.kvCacheGb +
    working.inputActivationGb +
    trainingState +
    spec.runtime.overheadGb;
  const required = subtotal * spec.runtime.buffer;
  return {
    weightsGb: weights,
    kvCacheGb: working.kvCacheGb,
    inputActivationGb: working.inputActivationGb,
    trainingStateGb: trainingState,
    runtimeOverheadGb: spec.runtime.overheadGb,
    safetyBufferGb: required - subtotal,
    requiredGb: roundTo(required, 1),
  };
}

export function accuracyFor(spec: CalculationSpec): Accuracy {
  if (spec.knownModelFileSizeGb !== null) {
    return "File-size based";
  }
  if (
    spec.family === "image_diffusion" ||
    spec.family === "video_generation" ||
    spec.family === "custom"
  ) {
    return "Rough";
  }
  if (spec.family === "tabular") {
    return "Estimated";
  }
  if (spec.exactArchitecture) {
    return "Advanced override";
  }
  if (spec.family === "vision_language") {
    return "Component-based";
  }
  return "Estimated";
}

export function speedEstimate(
  spec: CalculationSpec,
  currentWeightsGb: number,
): string {
  const precision = PRECISION_MAP[spec.precision];
  const computeWeightGb = spec.state.moe_enabled
    ? spec.activeParamsB * precision.weightBytes * precision.weightOverhead
    : currentWeightsGb;
  const tokens = Math.max(
    0.1,
    DEFAULT_MEMORY_BANDWIDTH_GBPS / Math.max(computeWeightGb, 0.1),
  );
  if (spec.family === "image_diffusion") {
    return `${roundTo(tokens / 20, 1).toFixed(1)} images/minute`;
  }
  if (spec.family === "video_generation") {
    return `${roundTo(tokens / 80, 1).toFixed(1)} clips/minute`;
  }
  if (spec.family === "tabular") {
    return `${roundTo(tokens * 1000, 0).toFixed(0)} rows/second`;
  }
  if (spec.family === "audio") {
    return `${roundTo(tokens, 1).toFixed(1)} audio tokens/second`;
  }
  return `${roundTo(tokens, 1).toFixed(1)} tokens/second`;
}
