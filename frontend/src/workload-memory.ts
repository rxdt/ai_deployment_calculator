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
  kvCacheGb: number;
  inputActivationGb: number;
}

type WorkingMemoryBuilder = (
  spec: CalculationSpec,
  weights: number,
) => WorkingMemory;

function nonNegative(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function decoderKvGb(spec: CalculationSpec, tokens: number): number {
  const arch = spec.architecture;
  const elements =
    spec.workloadSize * tokens * 2 * arch.layers * arch.kvHeads * arch.headDim;
  return (elements * spec.kvBytes) / BYTES_PER_GB;
}

function activationGb(
  spec: CalculationSpec,
  tokens: number,
  layers: number,
  hidden: number,
): number {
  const elements = 2 * spec.workloadSize * tokens * layers * hidden;
  return (elements * DEFAULT_ACTIVATION_BYTES) / BYTES_PER_GB;
}

function encoderActivationGb(spec: CalculationSpec, tokens: number): number {
  const arch = spec.architecture;
  return activationGb(spec, tokens, arch.layers, arch.hidden);
}

function pixelProxyGb(
  spec: CalculationSpec,
  width: number,
  height: number,
  imageCount: number,
): number {
  const elements = spec.workloadSize * imageCount * width * height * 4 * 8;
  return (elements * DEFAULT_ACTIVATION_BYTES) / BYTES_PER_GB;
}

function visionActivationGb(spec: CalculationSpec, tokens: number): number {
  const arch = spec.visionArchitecture;
  if (arch !== null) {
    return activationGb(spec, tokens, arch.layers, arch.hidden);
  }
  return pixelProxyGb(
    spec,
    nonNegative(spec.state.image_width, 1024),
    nonNegative(spec.state.image_height, 1024),
    nonNegative(spec.state.image_count, 1),
  );
}

function imageTokens(width: number, height: number): number {
  const patches =
    Math.ceil(width / DEFAULT_PATCH_SIZE) *
    Math.ceil(height / DEFAULT_PATCH_SIZE);
  return patches + 1;
}

function videoSize(resolution: "720p" | "1080p") {
  return resolution === "1080p"
    ? { width: 1920, height: 1080 }
    : { width: 1280, height: 720 };
}

function textGenerationMemory(
  spec: CalculationSpec,
  currentWeightsGb: number,
): WorkingMemory {
  const scratchRatio = spec.runtimeProfile === "Local / Edge" ? 0.03 : 0.05;
  return {
    kvCacheGb: decoderKvGb(spec, nonNegative(spec.state.context_tokens, 8000)),
    inputActivationGb: currentWeightsGb * scratchRatio,
  };
}

function textEncoderMemory(spec: CalculationSpec): WorkingMemory {
  return {
    kvCacheGb: 0,
    inputActivationGb: encoderActivationGb(
      spec,
      nonNegative(spec.state.sequence_tokens, 512),
    ),
  };
}

function encoderDecoderMemory(
  spec: CalculationSpec,
  currentWeightsGb: number,
): WorkingMemory {
  const input = encoderActivationGb(
    spec,
    nonNegative(spec.state.input_tokens, 1024),
  );
  const kv = decoderKvGb(spec, nonNegative(spec.state.output_tokens, 256));
  return {
    kvCacheGb: kv,
    inputActivationGb: input + currentWeightsGb * 0.05,
  };
}

function visionMemory(spec: CalculationSpec): WorkingMemory {
  const width = nonNegative(spec.state.image_width, 1024);
  const height = nonNegative(spec.state.image_height, 1024);
  const tokens = imageTokens(width, height);
  const transformer = encoderActivationGb(spec, tokens);
  const pixels = pixelProxyGb(spec, width, height, 1);
  return { kvCacheGb: 0, inputActivationGb: Math.max(transformer, pixels) };
}

function visionLanguageMemory(
  spec: CalculationSpec,
  currentWeightsGb: number,
): WorkingMemory {
  const width = nonNegative(spec.state.image_width, 1024);
  const height = nonNegative(spec.state.image_height, 1024);
  const imageTokenCount =
    nonNegative(spec.state.image_count, 1) * (imageTokens(width, height) - 1);
  const kv = decoderKvGb(
    spec,
    nonNegative(spec.state.text_context_tokens, 4000) + imageTokenCount,
  );
  const vision = visionActivationGb(spec, imageTokenCount);
  return {
    kvCacheGb: kv,
    inputActivationGb: vision + currentWeightsGb * 0.02,
  };
}

function imageDiffusionMemory(
  spec: CalculationSpec,
  currentWeightsGb: number,
): WorkingMemory {
  const latentHeight = Math.ceil(
    nonNegative(spec.state.image_height, 1024) / DEFAULT_LATENT_DOWNSAMPLE,
  );
  const latentWidth = Math.ceil(
    nonNegative(spec.state.image_width, 1024) / DEFAULT_LATENT_DOWNSAMPLE,
  );
  const elements =
    spec.workloadSize * latentHeight * latentWidth * DEFAULT_LATENT_CHANNELS;
  const latent = (elements * DEFAULT_ACTIVATION_BYTES) / BYTES_PER_GB;
  return {
    kvCacheGb: 0,
    inputActivationGb: Math.max(latent * 64, currentWeightsGb * 0.35),
  };
}

function videoMemory(
  spec: CalculationSpec,
  currentWeightsGb: number,
): WorkingMemory {
  const size = videoSize(spec.state.video_resolution);
  const latentFrames = Math.ceil(
    nonNegative(spec.state.video_frames, 81) / DEFAULT_TEMPORAL_DOWNSAMPLE,
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

function audioMemory(spec: CalculationSpec): WorkingMemory {
  const tokens =
    nonNegative(spec.state.audio_seconds, 30) * DEFAULT_AUDIO_TOKENS_PER_SECOND;
  return {
    kvCacheGb: 0,
    inputActivationGb: encoderActivationGb(spec, tokens),
  };
}

function tabularMemory(spec: CalculationSpec): WorkingMemory {
  const tabular =
    (nonNegative(spec.state.rows_per_batch, 10_000) *
      nonNegative(spec.state.features, 100) *
      DEFAULT_FEATURE_BYTES) /
    BYTES_PER_GB;
  return { kvCacheGb: 0, inputActivationGb: tabular * 4 };
}

function customMemory(
  spec: CalculationSpec,
  currentWeightsGb: number,
): WorkingMemory {
  return {
    kvCacheGb: 0,
    inputActivationGb:
      currentWeightsGb *
      0.25 *
      nonNegative(spec.state.input_size_multiplier, 1),
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

export function inferenceWorkingMemoryGb(
  spec: CalculationSpec,
  currentWeightsGb: number,
): WorkingMemory {
  const buildMemory = WORKING_MEMORY_BUILDERS.get(spec.family) ?? customMemory;
  return buildMemory(spec, currentWeightsGb);
}

export function memoryBreakdown(spec: CalculationSpec): MemoryBreakdown {
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

function zeroSpeedEstimate(family: WorkloadFamily): string {
  const estimates: Partial<Record<WorkloadFamily, string>> = {
    audio: "0.0 audio tokens/second",
    image_diffusion: "0.0 images/minute",
    tabular: "0 rows/second",
    video_generation: "0.0 clips/minute",
  };
  return estimates[family] ?? "0.0 tokens/second";
}

export function speedEstimate(
  spec: CalculationSpec,
  currentWeightsGb: number,
  recommendedTier: HardwareTier,
): string {
  if (spec.totalParamsB === 0) {
    return zeroSpeedEstimate(spec.family);
  }
  const precision = PRECISION_MAP[spec.precision];
  const computeWeightGb = spec.state.moe_enabled
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
