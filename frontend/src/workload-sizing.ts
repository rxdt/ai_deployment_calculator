import type { FormState, WorkloadFamily } from "./types";

const DEFAULT_PATCH_SIZE = 16;
const DEFAULT_TEMPORAL_DOWNSAMPLE = 4;
const DEFAULT_AUDIO_TOKENS_PER_SECOND = 50;

// Smallest context worth pricing: a real prompt is at least a couple of
// sentences, so a below-floor value (blank, 0, or a stale URL) would give a
// meaningless KV cache of ~0 rather than the field's honest default.
const MIN_CONTEXT_TOKENS = 256;

/**
@param value raw numeric field value
@param fallback value used for malformed direct state
@returns non-negative numeric value
*/
export function nonNegativeField(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
@param value raw context-length field value
@param fallback value used for malformed direct state
@returns context length held at or above the minimum floor
*/
export function contextField(value: string, fallback: number): number {
  return Math.max(nonNegativeField(value, fallback), MIN_CONTEXT_TOKENS);
}

/**
@param width image width in pixels
@param height image height in pixels
@returns patch-token proxy for image-like workloads
*/
export function imageTokens(width: number, height: number): number {
  const patches =
    Math.ceil(width / DEFAULT_PATCH_SIZE) *
    Math.ceil(height / DEFAULT_PATCH_SIZE);
  return patches + 1;
}

/**
@param resolution selected video resolution
@returns width and height in pixels
*/
export function videoSize(resolution: FormState["videoResolution"]): {
  readonly width: number;
  readonly height: number;
} {
  return resolution === "1080p"
    ? { width: 1920, height: 1080 }
    : { width: 1280, height: 720 };
}

/**
@param state form state containing video controls
@returns patch-token proxy across temporal steps
*/
function videoPatchTokens(state: Readonly<FormState>): number {
  const size = videoSize(state.videoResolution);
  const frames = Math.ceil(
    nonNegativeField(state.videoFrames, 81) / DEFAULT_TEMPORAL_DOWNSAMPLE,
  );
  return frames * imageTokens(size.width, size.height);
}

type TrainingTokenBuilder = (state: Readonly<FormState>) => number;

const imageTokenCount: TrainingTokenBuilder = (state): number =>
  imageTokens(
    nonNegativeField(state.imageWidth, 1024),
    nonNegativeField(state.imageHeight, 1024),
  );

const TRAINING_TOKEN_BUILDERS: ReadonlyMap<
  WorkloadFamily,
  TrainingTokenBuilder
> = new Map([
  [
    "text_encoder",
    (state): number => nonNegativeField(state.sequenceTokens, 512),
  ],
  [
    "encoder_decoder",
    (state): number =>
      nonNegativeField(state.inputTokens, 1024) +
      nonNegativeField(state.outputTokens, 256),
  ],
  ["vision", imageTokenCount],
  [
    "vision_language",
    (state): number =>
      nonNegativeField(state.textContextTokens, 4000) +
      nonNegativeField(state.imageCount, 1) * (imageTokenCount(state) - 1),
  ],
  ["image_diffusion", imageTokenCount],
  ["video_generation", videoPatchTokens],
  [
    "audio",
    (state): number =>
      nonNegativeField(state.audioSeconds, 30) *
      DEFAULT_AUDIO_TOKENS_PER_SECOND,
  ],
  [
    "tabular",
    (state): number =>
      nonNegativeField(state.rowsPerBatch, 10_000) *
      nonNegativeField(state.features, 100) *
      0.01,
  ],
  [
    "custom",
    (state): number => 8000 * nonNegativeField(state.inputSizeMultiplier, 1),
  ],
]);

/**
@param state form state with the selected workload family
@returns sequence-or-token proxy used by training activation memory
*/
export function trainingTokenCount(state: Readonly<FormState>): number {
  const buildCount = TRAINING_TOKEN_BUILDERS.get(state.workloadFamily);
  if (buildCount !== undefined) {
    return buildCount(state);
  }
  return contextField(state.contextTokens, 8000);
}
