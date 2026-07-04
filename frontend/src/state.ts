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

const NUMERIC_KEYS = [
  "totalParams",
  "workloadSize",
  "contextTokens",
  "sequenceTokens",
  "inputTokens",
  "outputTokens",
  "imageWidth",
  "imageHeight",
  "textContextTokens",
  "imageCount",
  "videoFrames",
  "audioSeconds",
  "rowsPerBatch",
  "features",
  "inputSizeMultiplier",
  "activeParams",
  "knownModelFileSizeGb",
  "gpuResidentFraction",
  "loraTrainablePercent",
] as const satisfies readonly (keyof FormState)[];

type ChoiceState = Pick<
  FormState,
  | "workloadFamily"
  | "parameterUnit"
  | "precision"
  | "executionMode"
  | "runtimeProfile"
  | "videoResolution"
  | "kvCachePrecision"
  | "optimizer"
>;

type NumericKey = (typeof NUMERIC_KEYS)[number];
type NumericState = Pick<FormState, NumericKey>;

type BooleanState = Pick<
  FormState,
  "moeEnabled" | "gradientCheckpointing" | "memoryShardingEnabled"
>;

/**
@returns numeric zero overrides for the reset action
*/
function zeroNumericState(): Partial<NumericState> {
  return Object.fromEntries(NUMERIC_KEYS.map((key) => [key, "0"]));
}

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
function isPlainDecimal(value: string): boolean {
  const parts = value.split(".");
  if (parts.length > 2) {
    return false;
  }
  const digits = parts.join("");
  if (digits.length === 0) {
    return false;
  }
  for (const char of digits) {
    if (char < "0" || char > "9") {
      return false;
    }
  }
  return true;
}

/**
 
@param value
@param fallback
*/
function decimal(value: string | null, fallback: string): string {
  if (value === null || value.trim() === "" || !isPlainDecimal(value)) {
    return fallback;
  }
  return Number(value) <= MAX_NUMERIC_VALUE ? value : String(MAX_NUMERIC_VALUE);
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
    ...DEFAULT_STATE,
    ...zeroNumericState(),
    gradientCheckpointing: false,
  };
}

/**
 
@param search
@param defaults
*/
function normalizedChoiceState(
  search: URLSearchParams,
  defaults: FormState,
): ChoiceState {
  return {
    workloadFamily: schemaValue(
      workloadSchema,
      last(search, "workloadFamily"),
      defaults.workloadFamily,
    ),
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
    videoResolution: schemaValue(
      resolutionSchema,
      last(search, "videoResolution"),
      defaults.videoResolution,
    ),
    kvCachePrecision: schemaValue(
      kvPrecisionSchema,
      last(search, "kvCachePrecision"),
      defaults.kvCachePrecision,
    ),
    optimizer: schemaValue(
      optimizerSchema,
      last(search, "optimizer"),
      defaults.optimizer,
    ),
  };
}

/**
 
@param search
@param defaults
*/
function normalizedAdvancedState(
  search: URLSearchParams,
  defaults: FormState,
): BooleanState {
  return {
    moeEnabled: isChecked(search, "moeEnabled", defaults.moeEnabled),
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
}

/**
 
@param search
@param defaults
*/
function normalizedNumericState(
  search: URLSearchParams,
  defaults: FormState,
): NumericState {
  const normalized: Record<NumericKey, string> = {
    totalParams: defaults.totalParams,
    workloadSize: defaults.workloadSize,
    contextTokens: defaults.contextTokens,
    sequenceTokens: defaults.sequenceTokens,
    inputTokens: defaults.inputTokens,
    outputTokens: defaults.outputTokens,
    imageWidth: defaults.imageWidth,
    imageHeight: defaults.imageHeight,
    textContextTokens: defaults.textContextTokens,
    imageCount: defaults.imageCount,
    videoFrames: defaults.videoFrames,
    audioSeconds: defaults.audioSeconds,
    rowsPerBatch: defaults.rowsPerBatch,
    features: defaults.features,
    inputSizeMultiplier: defaults.inputSizeMultiplier,
    activeParams: defaults.activeParams,
    knownModelFileSizeGb: defaults.knownModelFileSizeGb,
    gpuResidentFraction: defaults.gpuResidentFraction,
    loraTrainablePercent: defaults.loraTrainablePercent,
  };
  for (const key of NUMERIC_KEYS) {
    normalized[key] = decimal(last(search, key), defaults[key]);
  }
  normalized.knownModelFileSizeGb = decimal(
    last(search, "knownModelFileSizeGb"),
    defaults.knownModelFileSizeGb,
  );
  return normalized;
}

/**
 
@param state
*/
function withModeConstraints(state: FormState): FormState {
  if (state.executionMode !== "QLoRA fine-tuning") {
    return state;
  }
  return {
    ...state,
    precision: "4-bit",
    runtimeProfile: "Local / Edge",
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
  return withModeConstraints({
    ...normalizedChoiceState(search, defaults),
    ...normalizedNumericState(search, defaults),
    ...normalizedAdvancedState(search, defaults),
  });
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
