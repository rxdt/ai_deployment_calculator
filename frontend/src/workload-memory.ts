import {
  PRECISION_MAP,
  roundTo,
  trainingActivationGb,
  trainingStateGb,
  weightsGb,
  type CalculationSpec,
  type MemoryBreakdown,
} from "./calculator-core";
import { estimateSpeed, type HardwareTier } from "./hardware";
import type { WorkloadFamily } from "./types";

const BYTES_PER_GB = 1_000_000_000;
const DEFAULT_PATCH_SIZE = 16;
const DEFAULT_LATENT_DOWNSAMPLE = 8;
const DEFAULT_LATENT_CHANNELS = 4;
const DEFAULT_TEMPORAL_DOWNSAMPLE = 4;
const DEFAULT_AUDIO_TOKENS_PER_SECOND = 50;
const DEFAULT_FEATURE_BYTES = 4;
const DEFAULT_ACTIVATION_BYTES = 2;

interface WorkingMemory {
  readonly kvCacheGb: number;
  readonly inputActivationGb: number;
}

type WorkingMemoryBuilder = (
  spec: Readonly<CalculationSpec>,
  weights: number,
) => WorkingMemory;

/**
 
@param value
@param fallback
*/
function nonNegative(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 
@param spec
@param tokens
*/
function decoderKvGb(spec: Readonly<CalculationSpec>, tokens: number): number {
  const arch = spec.architecture;
  const elements =
    spec.workloadSize * tokens * 2 * arch.layers * arch.kvHeads * arch.headDim;
  return (elements * spec.kvBytes) / BYTES_PER_GB;
}

/**
 
@param spec
@param tokens
@param layers
@param hidden
*/
function activationGb(
  spec: Readonly<CalculationSpec>,
  tokens: number,
  layers: number,
  hidden: number,
): number {
  const elements = 2 * spec.workloadSize * tokens * layers * hidden;
  return (elements * DEFAULT_ACTIVATION_BYTES) / BYTES_PER_GB;
}

/**
 
@param spec
@param tokens
*/
function encoderActivationGb(
  spec: Readonly<CalculationSpec>,
  tokens: number,
): number {
  const arch = spec.architecture;
  return activationGb(spec, tokens, arch.layers, arch.hidden);
}

/**
 
@param spec
@param width
@param height
@param imageCount
*/
function pixelProxyGb(
  spec: Readonly<CalculationSpec>,
  width: number,
  height: number,
  imageCount: number,
): number {
  const elements = spec.workloadSize * imageCount * width * height * 4 * 8;
  return (elements * DEFAULT_ACTIVATION_BYTES) / BYTES_PER_GB;
}

/**
 
@param spec
@param tokens
*/
function visionActivationGb(
  spec: Readonly<CalculationSpec>,
  tokens: number,
): number {
  const arch = spec.visionArchitecture;
  if (arch !== null) {
    return activationGb(spec, tokens, arch.layers, arch.hidden);
  }
  return pixelProxyGb(
    spec,
    nonNegative(spec.state.imageWidth, 1024),
    nonNegative(spec.state.imageHeight, 1024),
    nonNegative(spec.state.imageCount, 1),
  );
}

/**
 
@param width
@param height
*/
function imageTokens(width: number, height: number): number {
  const patches =
    Math.ceil(width / DEFAULT_PATCH_SIZE) *
    Math.ceil(height / DEFAULT_PATCH_SIZE);
  return patches + 1;
}

/**
 
@param resolution
*/
function videoSize(resolution: "720p" | "1080p"): {
  width: number;
  height: number;
} {
  return resolution === "1080p"
    ? { width: 1920, height: 1080 }
    : { width: 1280, height: 720 };
}

/**
 
@param spec
@param currentWeightsGb
*/
function textGenerationMemory(
  spec: Readonly<CalculationSpec>,
  currentWeightsGb: number,
): WorkingMemory {
  const scratchRatio = spec.runtimeProfile === "Local / Edge" ? 0.03 : 0.05;
  return {
    kvCacheGb: decoderKvGb(spec, nonNegative(spec.state.contextTokens, 8000)),
    inputActivationGb: currentWeightsGb * scratchRatio,
  };
}

/**
 
@param spec
*/
function textEncoderMemory(spec: Readonly<CalculationSpec>): WorkingMemory {
  return {
    kvCacheGb: 0,
    inputActivationGb: encoderActivationGb(
      spec,
      nonNegative(spec.state.sequenceTokens, 512),
    ),
  };
}

/**
 
@param spec
@param currentWeightsGb
*/
function encoderDecoderMemory(
  spec: Readonly<CalculationSpec>,
  currentWeightsGb: number,
): WorkingMemory {
  const input = encoderActivationGb(
    spec,
    nonNegative(spec.state.inputTokens, 1024),
  );
  const kv = decoderKvGb(spec, nonNegative(spec.state.outputTokens, 256));
  return {
    kvCacheGb: kv,
    inputActivationGb: input + currentWeightsGb * 0.05,
  };
}

/**
 
@param spec
*/
function visionMemory(spec: Readonly<CalculationSpec>): WorkingMemory {
  const width = nonNegative(spec.state.imageWidth, 1024);
  const height = nonNegative(spec.state.imageHeight, 1024);
  const tokens = imageTokens(width, height);
  const transformer = encoderActivationGb(spec, tokens);
  const pixels = pixelProxyGb(spec, width, height, 1);
  return { kvCacheGb: 0, inputActivationGb: Math.max(transformer, pixels) };
}

/**
 
@param spec
@param currentWeightsGb
*/
function visionLanguageMemory(
  spec: Readonly<CalculationSpec>,
  currentWeightsGb: number,
): WorkingMemory {
  const width = nonNegative(spec.state.imageWidth, 1024);
  const height = nonNegative(spec.state.imageHeight, 1024);
  const imageTokenCount =
    nonNegative(spec.state.imageCount, 1) * (imageTokens(width, height) - 1);
  const kv = decoderKvGb(
    spec,
    nonNegative(spec.state.textContextTokens, 4000) + imageTokenCount,
  );
  const vision = visionActivationGb(spec, imageTokenCount);
  return {
    kvCacheGb: kv,
    inputActivationGb: vision + currentWeightsGb * 0.02,
  };
}

/**
 
@param spec
@param currentWeightsGb
*/
function imageDiffusionMemory(
  spec: Readonly<CalculationSpec>,
  currentWeightsGb: number,
): WorkingMemory {
  const latentHeight = Math.ceil(
    nonNegative(spec.state.imageHeight, 1024) / DEFAULT_LATENT_DOWNSAMPLE,
  );
  const latentWidth = Math.ceil(
    nonNegative(spec.state.imageWidth, 1024) / DEFAULT_LATENT_DOWNSAMPLE,
  );
  const elements =
    spec.workloadSize * latentHeight * latentWidth * DEFAULT_LATENT_CHANNELS;
  const latent = (elements * DEFAULT_ACTIVATION_BYTES) / BYTES_PER_GB;
  return {
    kvCacheGb: 0,
    inputActivationGb: Math.max(latent * 64, currentWeightsGb * 0.35),
  };
}

/**
 
@param spec
@param currentWeightsGb
*/
function videoMemory(
  spec: Readonly<CalculationSpec>,
  currentWeightsGb: number,
): WorkingMemory {
  const size = videoSize(spec.state.videoResolution);
  const latentFrames = Math.ceil(
    nonNegative(spec.state.videoFrames, 81) / DEFAULT_TEMPORAL_DOWNSAMPLE,
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
}

/**
 
@param spec
*/
function audioMemory(spec: Readonly<CalculationSpec>): WorkingMemory {
  const tokens =
    nonNegative(spec.state.audioSeconds, 30) * DEFAULT_AUDIO_TOKENS_PER_SECOND;
  return {
    kvCacheGb: 0,
    inputActivationGb: encoderActivationGb(spec, tokens),
  };
}

/**
 
@param spec
*/
function tabularMemory(spec: Readonly<CalculationSpec>): WorkingMemory {
  const tabular =
    (nonNegative(spec.state.rowsPerBatch, 10_000) *
      nonNegative(spec.state.features, 100) *
      DEFAULT_FEATURE_BYTES) /
    BYTES_PER_GB;
  return { kvCacheGb: 0, inputActivationGb: tabular * 4 };
}

/**
 
@param spec
@param currentWeightsGb
*/
function customMemory(
  spec: Readonly<CalculationSpec>,
  currentWeightsGb: number,
): WorkingMemory {
  return {
    kvCacheGb: 0,
    inputActivationGb:
      currentWeightsGb * 0.25 * nonNegative(spec.state.inputSizeMultiplier, 1),
  };
}

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
 
@param spec
@param currentWeightsGb
*/
export function inferenceWorkingMemoryGb(
  spec: Readonly<CalculationSpec>,
  currentWeightsGb: number,
): WorkingMemory {
  const buildMemory = WORKING_MEMORY_BUILDERS.get(spec.family) ?? customMemory;
  return buildMemory(spec, currentWeightsGb);
}

/**
 
@param spec
*/
export function memoryBreakdown(
  spec: Readonly<CalculationSpec>,
): MemoryBreakdown {
  const weights = weightsGb(spec);
  const runtimeOverhead = spec.totalParamsB === 0 ? 0 : spec.runtime.overheadGb;
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
    runtimeOverhead;
  const required = subtotal * spec.runtime.buffer;
  return {
    weightsGb: weights,
    kvCacheGb: working.kvCacheGb,
    inputActivationGb: working.inputActivationGb,
    trainingStateGb: trainingState,
    runtimeOverheadGb: runtimeOverhead,
    safetyBufferGb: required - subtotal,
    requiredGb: roundTo(required, 1),
  };
}

/**
 
@param family
*/
function zeroSpeedEstimate(family: WorkloadFamily): string {
  const estimates = new Map<WorkloadFamily, string>([
    ["audio", "0.0 audio tokens/second"],
    ["image_diffusion", "0.0 images/minute"],
    ["tabular", "0 rows/second"],
    ["video_generation", "0.0 clips/minute"],
  ]);
  return estimates.get(family) ?? "0.0 tokens/second";
}

/**
 
@param spec
@param currentWeightsGb
@param recommendedTier
*/
export function speedEstimate(
  spec: Readonly<CalculationSpec>,
  currentWeightsGb: number,
  recommendedTier: Readonly<HardwareTier>,
): string {
  if (spec.totalParamsB === 0) {
    return zeroSpeedEstimate(spec.family);
  }
  const precision = PRECISION_MAP[spec.precision];
  const computeWeightGb = spec.state.moeEnabled
    ? spec.activeParamsB * precision.weightBytes * precision.weightOverhead
    : currentWeightsGb;
  const tokens = Math.max(
    0.1,
    estimateSpeed({
      computeWeightGb: Math.max(computeWeightGb, 0.1),
      recommendedTier,
    }),
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
