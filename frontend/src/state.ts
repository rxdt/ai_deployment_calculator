import * as z from "zod";
import type { FormState } from "./types";

const workloadSchema = z.enum([
  "text_generation",
  "text_encoder",
  "encoder_decoder",
  "vision",
  "vision_language",
  "image_diffusion",
  "video_generation",
  "audio",
  "tabular",
  "custom",
]);
const precisionSchema = z.enum([
  "4-bit",
  "5-bit GGUF",
  "6-bit GGUF",
  "8-bit",
  "16-bit",
  "32-bit",
]);
const kvPrecisionSchema = z.enum(["8-bit / FP8", "16-bit", "32-bit"]);
const executionSchema = z.enum([
  "Inference",
  "LoRA fine-tuning",
  "QLoRA fine-tuning",
  "Full training",
]);
const runtimeSchema = z.enum(["Local / Edge", "Server / Cloud"]);
const unitSchema = z.enum(["B", "M"]);
const optimizerSchema = z.enum(["AdamW", "8-bit Adam", "SGD-like"]);
const resolutionSchema = z.enum(["720p", "1080p"]);

const DEFAULT_STATE: FormState = {
  workloadFamily: "text_generation",
  totalParams: "7",
  parameterUnit: "B",
  precision: "16-bit",
  executionMode: "Inference",
  runtimeProfile: "Server / Cloud",
  workloadSize: "1",
  contextTokens: "8000",
  sequenceTokens: "512",
  inputTokens: "1024",
  outputTokens: "256",
  imageWidth: "1024",
  imageHeight: "1024",
  textContextTokens: "4000",
  imageCount: "1",
  videoResolution: "720p",
  videoFrames: "81",
  audioSeconds: "30",
  rowsPerBatch: "10000",
  features: "100",
  inputSizeMultiplier: "1",
  moeEnabled: false,
  activeParams: "1.3",
  knownModelFileSizeGb: "",
  gpuResidentFraction: "1",
  kvCachePrecision: "16-bit",
  loraTrainablePercent: "0.5",
  optimizer: "AdamW",
  gradientCheckpointing: true,
  memoryShardingEnabled: false,
};

const CHECKED_VALUES = new Set(["1", "true", "on", "yes"]);
const MAX_NUMERIC_VALUE = 999_999;

/**
 Convert a camelCase state key to the kebab-case name used on the wire
 (HTML `name` attributes and URL query parameters).
@param key - camelCase FormState key
@returns the kebab-case wire key
*/
function toWireKey(key: string): string {
  return key.replaceAll(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`);
}

/**
 
@param search
@param name
*/
function last(search: URLSearchParams, name: keyof FormState): string | null {
  return search.getAll(toWireKey(name)).at(-1) ?? null;
}

/**
 
@param search
@param name
@param isFallbackChecked
*/
function isChecked(
  search: URLSearchParams,
  name: keyof FormState,
  isFallbackChecked: boolean,
): boolean {
  const value = last(search, name);
  return value === null
    ? isFallbackChecked
    : CHECKED_VALUES.has(value.toLowerCase());
}

/**
 
@param value
*/
function isDigits(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = Number(value.codePointAt(index));
    if (code < 48 || code > 57) {
      return false;
    }
  }
  return true;
}

/**
 
@param value
*/
function isPlainDecimal(value: string): boolean {
  const parts = value.split(".");
  if (parts.length > 2) {
    return false;
  }
  const [integer = "", fraction = ""] = parts;
  if (parts.length === 1) {
    return isDigits(integer);
  }
  return isDigits(`${integer}${fraction}`);
}

/**
 
@param value
@param fallback
*/
function decimal(value: string | null, fallback: string): string {
  if (value === null || value.trim() === "") {
    return fallback;
  }
  if (!isPlainDecimal(value)) {
    return fallback;
  }
  return Number(value) <= MAX_NUMERIC_VALUE ? value : String(MAX_NUMERIC_VALUE);
}

/**
 
@param value
@param fallback
*/
function nonNegative(value: string | null, fallback: string): string {
  return decimal(value, fallback);
}

/**
 
@param schema
@param value
@param fallback
*/
function schemaValue<T extends z.ZodType>(
  schema: T,
  value: string | null,
  fallback: z.infer<T>,
): z.infer<T> {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

/**
 The seed deployment shown before the user changes any input.
@returns a copy of the default form state
*/
export function defaultState(): FormState {
  return { ...DEFAULT_STATE };
}

/**
 A blank deployment with numeric inputs zeroed, used by the reset action.
@returns a form state with empty/zero inputs
*/
export function zeroState(): FormState {
  return {
    workloadFamily: "text_generation",
    totalParams: "0",
    parameterUnit: "B",
    precision: "16-bit",
    executionMode: "Inference",
    runtimeProfile: "Server / Cloud",
    workloadSize: "0",
    contextTokens: "0",
    sequenceTokens: "0",
    inputTokens: "0",
    outputTokens: "0",
    imageWidth: "0",
    imageHeight: "0",
    textContextTokens: "0",
    imageCount: "0",
    videoResolution: "720p",
    videoFrames: "0",
    audioSeconds: "0",
    rowsPerBatch: "0",
    features: "0",
    inputSizeMultiplier: "0",
    moeEnabled: false,
    activeParams: "0",
    knownModelFileSizeGb: "0",
    gpuResidentFraction: "0",
    kvCachePrecision: "16-bit",
    loraTrainablePercent: "0",
    optimizer: "AdamW",
    gradientCheckpointing: false,
    memoryShardingEnabled: false,
  };
}

/**
 
@param search
*/
export function normalizedState(search: URLSearchParams): FormState {
  const defaults = defaultState();
  if (search.size === 0) {
    return defaults;
  }
  const normalized: FormState = {
    workloadFamily: schemaValue(
      workloadSchema,
      last(search, "workloadFamily"),
      defaults.workloadFamily,
    ),
    totalParams: nonNegative(last(search, "totalParams"), defaults.totalParams),
    parameterUnit: schemaValue(
      unitSchema,
      last(search, "parameterUnit"),
      defaults.parameterUnit,
    ),
    precision: schemaValue(
      precisionSchema,
      last(search, "precision"),
      defaults.precision,
    ),
    executionMode: schemaValue(
      executionSchema,
      last(search, "executionMode"),
      defaults.executionMode,
    ),
    runtimeProfile: schemaValue(
      runtimeSchema,
      last(search, "runtimeProfile"),
      defaults.runtimeProfile,
    ),
    workloadSize: nonNegative(
      last(search, "workloadSize"),
      defaults.workloadSize,
    ),
    contextTokens: nonNegative(
      last(search, "contextTokens"),
      defaults.contextTokens,
    ),
    sequenceTokens: nonNegative(
      last(search, "sequenceTokens"),
      defaults.sequenceTokens,
    ),
    inputTokens: nonNegative(last(search, "inputTokens"), defaults.inputTokens),
    outputTokens: nonNegative(
      last(search, "outputTokens"),
      defaults.outputTokens,
    ),
    imageWidth: nonNegative(last(search, "imageWidth"), defaults.imageWidth),
    imageHeight: nonNegative(last(search, "imageHeight"), defaults.imageHeight),
    textContextTokens: nonNegative(
      last(search, "textContextTokens"),
      defaults.textContextTokens,
    ),
    imageCount: nonNegative(last(search, "imageCount"), defaults.imageCount),
    videoResolution: schemaValue(
      resolutionSchema,
      last(search, "videoResolution"),
      defaults.videoResolution,
    ),
    videoFrames: nonNegative(last(search, "videoFrames"), defaults.videoFrames),
    audioSeconds: nonNegative(
      last(search, "audioSeconds"),
      defaults.audioSeconds,
    ),
    rowsPerBatch: nonNegative(
      last(search, "rowsPerBatch"),
      defaults.rowsPerBatch,
    ),
    features: nonNegative(last(search, "features"), defaults.features),
    inputSizeMultiplier: nonNegative(
      last(search, "inputSizeMultiplier"),
      defaults.inputSizeMultiplier,
    ),
    moeEnabled: isChecked(search, "moeEnabled", defaults.moeEnabled),
    activeParams: nonNegative(
      last(search, "activeParams"),
      defaults.activeParams,
    ),
    knownModelFileSizeGb: decimal(
      last(search, "knownModelFileSizeGb"),
      defaults.knownModelFileSizeGb,
    ),
    gpuResidentFraction: nonNegative(
      last(search, "gpuResidentFraction"),
      defaults.gpuResidentFraction,
    ),
    kvCachePrecision: schemaValue(
      kvPrecisionSchema,
      last(search, "kvCachePrecision"),
      defaults.kvCachePrecision,
    ),
    loraTrainablePercent: nonNegative(
      last(search, "loraTrainablePercent"),
      defaults.loraTrainablePercent,
    ),
    optimizer: schemaValue(
      optimizerSchema,
      last(search, "optimizer"),
      defaults.optimizer,
    ),
    gradientCheckpointing: isChecked(
      search,
      "gradientCheckpointing",
      defaults.gradientCheckpointing,
    ),
    memoryShardingEnabled: isChecked(
      search,
      "memoryShardingEnabled",
      defaults.memoryShardingEnabled,
    ),
  };
  if (normalized.executionMode === "QLoRA fine-tuning") {
    return {
      ...normalized,
      precision: "4-bit",
      runtimeProfile: "Local / Edge",
    };
  }
  return normalized;
}

/**
 
@param state
*/
export function searchFromState(state: FormState): URLSearchParams {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(state)) {
    const wireName = toWireKey(name);
    if (typeof value === "boolean") {
      if (value) {
        search.set(wireName, "on");
      }
    } else if (typeof value === "string" && value !== "") {
      search.set(wireName, value);
    }
  }
  return search;
}
