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
  workload_family: "text_generation",
  total_params: "7",
  parameter_unit: "B",
  precision: "16-bit",
  execution_mode: "Inference",
  runtime_profile: "Server / Cloud",
  workload_size: "1",
  context_tokens: "8000",
  sequence_tokens: "512",
  input_tokens: "1024",
  output_tokens: "256",
  image_width: "1024",
  image_height: "1024",
  text_context_tokens: "4000",
  image_count: "1",
  video_resolution: "720p",
  video_frames: "81",
  audio_seconds: "30",
  rows_per_batch: "10000",
  features: "100",
  input_size_multiplier: "1",
  moe_enabled: false,
  active_params: "1.3",
  known_model_file_size_gb: "",
  gpu_resident_fraction: "1",
  kv_cache_precision: "16-bit",
  exact_transformer_architecture: false,
  lora_trainable_percent: "0.5",
  optimizer: "AdamW",
  gradient_checkpointing: true,
  memory_sharding_enabled: false,
  my_gpu_vram_gb: "",
};

const CHECKED_VALUES = new Set(["1", "true", "on", "yes"]);
const MAX_NUMERIC_VALUE = 999_999;

function last(search: URLSearchParams, name: keyof FormState): string | null {
  return search.getAll(name).at(-1) ?? null;
}

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

function decimal(value: string | null, fallback: string): string {
  if (value === null || value.trim() === "") {
    return fallback;
  }
  if (!isPlainDecimal(value)) {
    return fallback;
  }
  return Number(value) <= MAX_NUMERIC_VALUE ? value : String(MAX_NUMERIC_VALUE);
}

function nonNegative(value: string | null, fallback: string): string {
  return decimal(value, fallback);
}

function schemaValue<T extends z.ZodType>(
  schema: T,
  value: string | null,
  fallback: z.infer<T>,
): z.infer<T> {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

export function defaultState(): FormState {
  return { ...DEFAULT_STATE };
}

export function zeroState(): FormState {
  return {
    workload_family: "text_generation",
    total_params: "0",
    parameter_unit: "B",
    precision: "16-bit",
    execution_mode: "Inference",
    runtime_profile: "Server / Cloud",
    workload_size: "0",
    context_tokens: "0",
    sequence_tokens: "0",
    input_tokens: "0",
    output_tokens: "0",
    image_width: "0",
    image_height: "0",
    text_context_tokens: "0",
    image_count: "0",
    video_resolution: "720p",
    video_frames: "0",
    audio_seconds: "0",
    rows_per_batch: "0",
    features: "0",
    input_size_multiplier: "0",
    moe_enabled: false,
    active_params: "0",
    known_model_file_size_gb: "0",
    gpu_resident_fraction: "0",
    kv_cache_precision: "16-bit",
    exact_transformer_architecture: false,
    lora_trainable_percent: "0",
    optimizer: "AdamW",
    gradient_checkpointing: false,
    memory_sharding_enabled: false,
    my_gpu_vram_gb: "0",
  };
}

export function normalizedState(search: URLSearchParams): FormState {
  const defaults = defaultState();
  if (search.size === 0) {
    return defaults;
  }
  const normalized: FormState = {
    workload_family: schemaValue(
      workloadSchema,
      last(search, "workload_family"),
      defaults.workload_family,
    ),
    total_params: nonNegative(
      last(search, "total_params"),
      defaults.total_params,
    ),
    parameter_unit: schemaValue(
      unitSchema,
      last(search, "parameter_unit"),
      defaults.parameter_unit,
    ),
    precision: schemaValue(
      precisionSchema,
      last(search, "precision"),
      defaults.precision,
    ),
    execution_mode: schemaValue(
      executionSchema,
      last(search, "execution_mode"),
      defaults.execution_mode,
    ),
    runtime_profile: schemaValue(
      runtimeSchema,
      last(search, "runtime_profile"),
      defaults.runtime_profile,
    ),
    workload_size: nonNegative(
      last(search, "workload_size"),
      defaults.workload_size,
    ),
    context_tokens: nonNegative(
      last(search, "context_tokens"),
      defaults.context_tokens,
    ),
    sequence_tokens: nonNegative(
      last(search, "sequence_tokens"),
      defaults.sequence_tokens,
    ),
    input_tokens: nonNegative(
      last(search, "input_tokens"),
      defaults.input_tokens,
    ),
    output_tokens: nonNegative(
      last(search, "output_tokens"),
      defaults.output_tokens,
    ),
    image_width: nonNegative(last(search, "image_width"), defaults.image_width),
    image_height: nonNegative(
      last(search, "image_height"),
      defaults.image_height,
    ),
    text_context_tokens: nonNegative(
      last(search, "text_context_tokens"),
      defaults.text_context_tokens,
    ),
    image_count: nonNegative(last(search, "image_count"), defaults.image_count),
    video_resolution: schemaValue(
      resolutionSchema,
      last(search, "video_resolution"),
      defaults.video_resolution,
    ),
    video_frames: nonNegative(
      last(search, "video_frames"),
      defaults.video_frames,
    ),
    audio_seconds: nonNegative(
      last(search, "audio_seconds"),
      defaults.audio_seconds,
    ),
    rows_per_batch: nonNegative(
      last(search, "rows_per_batch"),
      defaults.rows_per_batch,
    ),
    features: nonNegative(last(search, "features"), defaults.features),
    input_size_multiplier: nonNegative(
      last(search, "input_size_multiplier"),
      defaults.input_size_multiplier,
    ),
    moe_enabled: isChecked(search, "moe_enabled", defaults.moe_enabled),
    active_params: nonNegative(
      last(search, "active_params"),
      defaults.active_params,
    ),
    known_model_file_size_gb: decimal(
      last(search, "known_model_file_size_gb"),
      defaults.known_model_file_size_gb,
    ),
    gpu_resident_fraction: nonNegative(
      last(search, "gpu_resident_fraction"),
      defaults.gpu_resident_fraction,
    ),
    kv_cache_precision: schemaValue(
      kvPrecisionSchema,
      last(search, "kv_cache_precision"),
      defaults.kv_cache_precision,
    ),
    exact_transformer_architecture: isChecked(
      search,
      "exact_transformer_architecture",
      defaults.exact_transformer_architecture,
    ),
    lora_trainable_percent: nonNegative(
      last(search, "lora_trainable_percent"),
      defaults.lora_trainable_percent,
    ),
    optimizer: schemaValue(
      optimizerSchema,
      last(search, "optimizer"),
      defaults.optimizer,
    ),
    gradient_checkpointing: isChecked(
      search,
      "gradient_checkpointing",
      defaults.gradient_checkpointing,
    ),
    memory_sharding_enabled: isChecked(
      search,
      "memory_sharding_enabled",
      defaults.memory_sharding_enabled,
    ),
    my_gpu_vram_gb: decimal(
      last(search, "my_gpu_vram_gb"),
      defaults.my_gpu_vram_gb,
    ),
  };
  if (normalized.execution_mode === "QLoRA fine-tuning") {
    return {
      ...normalized,
      precision: "4-bit",
      runtime_profile: "Local / Edge",
    };
  }
  return normalized;
}

export function searchFromState(state: FormState): URLSearchParams {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(state)) {
    if (typeof value === "boolean") {
      if (value) {
        search.set(name, "on");
      }
    } else if (typeof value === "string" && value !== "") {
      search.set(name, value);
    }
  }
  return search;
}
