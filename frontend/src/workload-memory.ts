import {
  PRECISION_MAP,
  roundUpTo,
  roundTo,
  trainingActivationGb,
  trainingStateGb,
  weightsGb,
  type CalculationSpec,
  type MemoryBreakdown,
} from "./calculator-core";
import { decoderKvGb } from "./attention-cache";
import { fp16DecoderActivationScratchGb } from "./decoder-scratch";
import { estimateSpeed, type HardwareTier } from "./hardware";
import type { WorkloadFamily } from "./types";
import {
  contextField,
  imageTokens,
  nonNegativeField,
  videoSize,
} from "./workload-sizing";
import { hasMoeControl } from "./workload-visibility";

const BYTES_PER_GB = 1_000_000_000;
const DEFAULT_LATENT_DOWNSAMPLE = 8;
const DEFAULT_LATENT_CHANNELS = 4;
const DEFAULT_TEMPORAL_DOWNSAMPLE = 4;
const DEFAULT_AUDIO_TOKENS_PER_SECOND = 50;
const DEFAULT_FEATURE_BYTES = 4;
const DEFAULT_ACTIVATION_BYTES = 2;
const ZERO_SPEED_ESTIMATES: ReadonlyMap<WorkloadFamily, string> = new Map([
  ["audio", "0.0 audio tokens/second"],
  ["image_diffusion", "0.0 images/minute"],
  ["tabular", "0 rows/second"],
  ["video_generation", "0.0 clips/minute"],
]);
// Whole tokens/sec only: the estimate is a bandwidth ÷ weight-bytes heuristic,
// so a tenths digit (66.9) implies a precision the model does not have.
const TOKEN_SPEED_STYLE: SpeedStyle = {
  decimals: 0,
  scale: 1,
  unit: "tokens/second",
};
const SPEED_STYLES: ReadonlyMap<WorkloadFamily, SpeedStyle> = new Map([
  ["audio", { decimals: 1, scale: 1, unit: "audio tokens/second" }],
  ["image_diffusion", { decimals: 1, scale: 1 / 20, unit: "images/minute" }],
  ["tabular", { decimals: 0, scale: 1000, unit: "rows/second" }],
  ["video_generation", { decimals: 1, scale: 1 / 80, unit: "clips/minute" }],
]);

interface WorkingMemory {
  readonly kvCacheGb: number;
  readonly inputActivationGb: number;
}

interface SpeedStyle {
  readonly decimals: number;
  readonly scale: number;
  readonly unit: string;
}

type WorkingMemoryBuilder = (
  spec: Readonly<CalculationSpec>,
  weights: number,
) => WorkingMemory;

const activationGb = (
  spec: Readonly<CalculationSpec>,
  tokens: number,
  layers: number,
  hidden: number,
): number => {
  const elements = 2 * spec.workloadSize * tokens * layers * hidden;
  return (elements * DEFAULT_ACTIVATION_BYTES) / BYTES_PER_GB;
};

const encoderActivationGb = (
  spec: Readonly<CalculationSpec>,
  tokens: number,
): number =>
  activationGb(
    spec,
    tokens,
    spec.architecture.layers,
    spec.architecture.hidden,
  );

const pixelProxyGb = (
  spec: Readonly<CalculationSpec>,
  width: number,
  height: number,
): number => {
  const elements = spec.workloadSize * width * height * 4 * 8;
  return (elements * DEFAULT_ACTIVATION_BYTES) / BYTES_PER_GB;
};

const visionActivationGb = (
  spec: Readonly<CalculationSpec>,
  tokens: number,
): number => {
  const arch = spec.visionArchitecture;
  if (arch !== null) {
    return activationGb(spec, tokens, arch.layers, arch.hidden);
  }
  return pixelProxyGb(
    spec,
    nonNegativeField(spec.state.imageWidth, 1024),
    nonNegativeField(spec.state.imageHeight, 1024),
  );
};

const textGenerationMemory: WorkingMemoryBuilder = (spec) => {
  const tokens = contextField(spec.state.contextTokens, 8000);
  return {
    kvCacheGb: decoderKvGb(spec, tokens),
    inputActivationGb: fp16DecoderActivationScratchGb(
      spec.residentParamsB,
      tokens,
    ),
  };
};

const textEncoderMemory: WorkingMemoryBuilder = (spec) => ({
  kvCacheGb: 0,
  inputActivationGb: encoderActivationGb(
    spec,
    nonNegativeField(spec.state.sequenceTokens, 512),
  ),
});

const encoderDecoderMemory: WorkingMemoryBuilder = (spec) => {
  const input = encoderActivationGb(
    spec,
    nonNegativeField(spec.state.inputTokens, 1024),
  );
  const outputTokens = nonNegativeField(spec.state.outputTokens, 256);
  const kv = decoderKvGb(spec, outputTokens);
  return {
    kvCacheGb: kv,
    inputActivationGb:
      input +
      fp16DecoderActivationScratchGb(spec.residentParamsB, outputTokens),
  };
};

const visionMemory: WorkingMemoryBuilder = (spec) => {
  const width = nonNegativeField(spec.state.imageWidth, 1024);
  const height = nonNegativeField(spec.state.imageHeight, 1024);
  const tokens = imageTokens(width, height);
  const transformer = encoderActivationGb(spec, tokens);
  const pixels = pixelProxyGb(spec, width, height);
  return { kvCacheGb: 0, inputActivationGb: Math.max(transformer, pixels) };
};

const visionLanguageMemory: WorkingMemoryBuilder = (spec) => {
  const width = nonNegativeField(spec.state.imageWidth, 1024);
  const height = nonNegativeField(spec.state.imageHeight, 1024);
  const imageTokenCount =
    nonNegativeField(spec.state.imageCount, 1) *
    (imageTokens(width, height) - 1);
  const decoderTokens =
    nonNegativeField(spec.state.textContextTokens, 4000) + imageTokenCount;
  const kv = decoderKvGb(spec, decoderTokens);
  const vision = visionActivationGb(spec, imageTokenCount);
  return {
    kvCacheGb: kv,
    inputActivationGb:
      vision +
      fp16DecoderActivationScratchGb(spec.residentParamsB, decoderTokens),
  };
};

const imageDiffusionMemory: WorkingMemoryBuilder = (spec, currentWeightsGb) => {
  const latentHeight = Math.ceil(
    nonNegativeField(spec.state.imageHeight, 1024) / DEFAULT_LATENT_DOWNSAMPLE,
  );
  const latentWidth = Math.ceil(
    nonNegativeField(spec.state.imageWidth, 1024) / DEFAULT_LATENT_DOWNSAMPLE,
  );
  const elements =
    spec.workloadSize * latentHeight * latentWidth * DEFAULT_LATENT_CHANNELS;
  const latent = (elements * DEFAULT_ACTIVATION_BYTES) / BYTES_PER_GB;
  return {
    kvCacheGb: 0,
    inputActivationGb: Math.max(latent * 64, currentWeightsGb * 0.35),
  };
};

const videoMemory: WorkingMemoryBuilder = (spec, currentWeightsGb) => {
  const size = videoSize(spec.state.videoResolution);
  const latentFrames = Math.ceil(
    nonNegativeField(spec.state.videoFrames, 81) / DEFAULT_TEMPORAL_DOWNSAMPLE,
  );
  const latentHeight = Math.ceil(size.height / DEFAULT_LATENT_DOWNSAMPLE);
  const latentWidth = Math.ceil(size.width / DEFAULT_LATENT_DOWNSAMPLE);
  const elements =
    spec.workloadSize *
    latentFrames *
    latentHeight *
    latentWidth *
    DEFAULT_LATENT_CHANNELS;
  const latent = (elements * DEFAULT_ACTIVATION_BYTES) / BYTES_PER_GB;
  return {
    kvCacheGb: 0,
    inputActivationGb: Math.max(latent * 96, currentWeightsGb * 0.5),
  };
};

const audioMemory: WorkingMemoryBuilder = (spec) => ({
  kvCacheGb: 0,
  inputActivationGb: encoderActivationGb(
    spec,
    nonNegativeField(spec.state.audioSeconds, 30) *
      DEFAULT_AUDIO_TOKENS_PER_SECOND,
  ),
});

const tabularMemory: WorkingMemoryBuilder = (spec) => {
  const tabular =
    (nonNegativeField(spec.state.rowsPerBatch, 10_000) *
      nonNegativeField(spec.state.features, 100) *
      DEFAULT_FEATURE_BYTES) /
    BYTES_PER_GB;
  return { kvCacheGb: 0, inputActivationGb: tabular * 4 };
};

const customMemory: WorkingMemoryBuilder = (spec, currentWeightsGb) => ({
  kvCacheGb: 0,
  inputActivationGb:
    currentWeightsGb *
    0.25 *
    nonNegativeField(spec.state.inputSizeMultiplier, 1),
});

const formatSpeed = (tokens: number, family: WorkloadFamily): string => {
  const style = SPEED_STYLES.get(family) ?? TOKEN_SPEED_STYLE;
  const value = roundTo(tokens * style.scale, style.decimals);
  return `${value.toFixed(style.decimals)} ${style.unit}`;
};

const WORKING_MEMORY_BUILDERS: ReadonlyMap<
  WorkloadFamily,
  WorkingMemoryBuilder
> = new Map([
  ["text_generation", textGenerationMemory],
  ["text_encoder", textEncoderMemory],
  ["encoder_decoder", encoderDecoderMemory],
  ["vision", visionMemory],
  ["vision_language", visionLanguageMemory],
  ["image_diffusion", imageDiffusionMemory],
  ["video_generation", videoMemory],
  ["audio", audioMemory],
  ["tabular", tabularMemory],
  ["custom", customMemory],
]);

/**
Estimates inference working memory for the selected workload family.
@param spec Calculation request.
@param currentWeightsGb Current weight memory.
*/
export function inferenceWorkingMemoryGb(
  spec: Readonly<CalculationSpec>,
  currentWeightsGb: number,
): WorkingMemory {
  const buildMemory = WORKING_MEMORY_BUILDERS.get(spec.family) ?? customMemory;
  return buildMemory(spec, currentWeightsGb);
}

/**
Builds the memory breakdown used by the calculator UI.
@param spec Calculation request.
*/
export function memoryBreakdown(
  spec: Readonly<CalculationSpec>,
): MemoryBreakdown {
  const weights = weightsGb(spec);
  const hasModelMemory = weights > 0;
  const runtimeOverhead = hasModelMemory ? spec.runtime.overheadGb : 0;
  let working: WorkingMemory = { kvCacheGb: 0, inputActivationGb: 0 };
  if (hasModelMemory) {
    working =
      spec.executionMode === "Inference"
        ? inferenceWorkingMemoryGb(spec, weights)
        : { kvCacheGb: 0, inputActivationGb: trainingActivationGb(spec) };
  }
  const trainingState = trainingStateGb(spec);
  const subtotal =
    weights +
    working.kvCacheGb +
    working.inputActivationGb +
    trainingState +
    runtimeOverhead;
  const required = subtotal * spec.runtime.buffer;
  return {
    weightsGb: weights,
    kvCacheGb: working.kvCacheGb,
    inputActivationGb: working.inputActivationGb,
    trainingStateGb: trainingState,
    runtimeOverheadGb: runtimeOverhead,
    safetyBufferGb: required - subtotal,
    requiredGb: roundUpTo(required, 1),
  };
}

/**
Estimates throughput for a workload on the recommended hardware tier.
@param spec Calculation request.
@param currentWeightsGb Current weight memory.
@param recommendedTier Hardware tier selected for the workload.
*/
export function speedEstimate(
  spec: Readonly<CalculationSpec>,
  currentWeightsGb: number,
  recommendedTier: Readonly<HardwareTier>,
): string {
  if (currentWeightsGb === 0) {
    return ZERO_SPEED_ESTIMATES.get(spec.family) ?? "0 tokens/second";
  }
  const precision = PRECISION_MAP[spec.precision];
  const computeWeightGb =
    hasMoeControl(spec.family) && spec.state.moeEnabled
      ? spec.activeParamsB * precision.weightBytes * precision.weightOverhead
      : currentWeightsGb;
  const computeWeight = Math.max(computeWeightGb, 0.1);
  const tokens = Math.max(
    0.1,
    estimateSpeed({ computeWeightGb: computeWeight, recommendedTier }),
  );
  return formatSpeed(tokens, spec.family);
}
