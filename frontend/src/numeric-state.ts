import type { FormState } from "./types";

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

type NumericKey = (typeof NUMERIC_KEYS)[number];
type NumericState = Record<NumericKey, string>;

/**
 Convert a camelCase state key to the kebab-case query key.
@param key - camelCase FormState key
@returns the kebab-case query key
*/
function toWireKey(key: string): string {
  return key.replaceAll(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`);
}

/**
 Read the final submitted value for a numeric state key.
@param search - URL query parameters
@param name - FormState key to read
@returns the last submitted value, if present
*/
function last(search: URLSearchParams, name: keyof FormState): string | null {
  return search.getAll(toWireKey(name)).at(-1) ?? null;
}

/**
@returns numeric zero overrides for the reset action
*/
export function zeroNumericState(): Partial<NumericState> {
  return Object.fromEntries(NUMERIC_KEYS.map((key) => [key, "0"]));
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
@param maximum
*/
function decimal(
  value: string | null,
  fallback: string,
  maximum = MAX_NUMERIC_VALUE,
): string {
  if (value === null || value.trim() === "" || !isPlainDecimal(value)) {
    return fallback;
  }
  return Number(value) <= maximum ? value : String(maximum);
}

/**
@param search
@param defaults
*/
export function normalizedNumericState(
  search: URLSearchParams,
  defaults: FormState,
): NumericState {
  const normalized: NumericState = {
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
  normalized.gpuResidentFraction = decimal(
    last(search, "gpuResidentFraction"),
    defaults.gpuResidentFraction,
    1,
  );
  normalized.loraTrainablePercent = decimal(
    last(search, "loraTrainablePercent"),
    defaults.loraTrainablePercent,
    100,
  );
  return normalized;
}
