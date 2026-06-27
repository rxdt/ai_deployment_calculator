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
const unitSchema = z.enum(["B", "M", "K"]);
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
  my_gpu_vram_gb: "",
  cloud_cost_override: "",
};

const CHECKED_VALUES = new Set(["1", "true", "on", "yes"]);

function last(search: URLSearchParams, name: keyof FormState): string | null {
  return search.getAll(name).at(-1) ?? null;
}

function checked(
  search: URLSearchParams,
  name: keyof FormState,
  fallback: boolean,
): boolean {
  const value = last(search, name);
  return value === null ? fallback : CHECKED_VALUES.has(value.toLowerCase());
}

function decimal(value: string | null, fallback: string): string {
  if (value === null || value.trim() === "") {
    return fallback;
  }
  return Number.isFinite(Number(value)) && !/[^\d.e+-]/iu.test(value)
    ? value
    : fallback;
}

function positive(value: string | null, fallback: string): string {
  const normalized = decimal(value, fallback);
  return Number(normalized) > 0 ? normalized : fallback;
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

export function normalizedState(search: URLSearchParams): FormState {
  const defaults = defaultState();
  if (search.size === 0) {
    return defaults;
  }
  return {
    workload_family: schemaValue(
      workloadSchema,
      last(search, "workload_family"),
      defaults.workload_family,
    ),
    total_params: positive(last(search, "total_params"), defaults.total_params),
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
    workload_size: positive(
      last(search, "workload_size"),
      defaults.workload_size,
    ),
    context_tokens: positive(
      last(search, "context_tokens"),
      defaults.context_tokens,
    ),
    sequence_tokens: positive(
      last(search, "sequence_tokens"),
      defaults.sequence_tokens,
    ),
    input_tokens: positive(last(search, "input_tokens"), defaults.input_tokens),
    output_tokens: positive(
      last(search, "output_tokens"),
      defaults.output_tokens,
    ),
    image_width: positive(last(search, "image_width"), defaults.image_width),
    image_height: positive(last(search, "image_height"), defaults.image_height),
    text_context_tokens: positive(
      last(search, "text_context_tokens"),
      defaults.text_context_tokens,
    ),
    image_count: positive(last(search, "image_count"), defaults.image_count),
    video_resolution: schemaValue(
      resolutionSchema,
      last(search, "video_resolution"),
      defaults.video_resolution,
    ),
    video_frames: positive(last(search, "video_frames"), defaults.video_frames),
    audio_seconds: positive(
      last(search, "audio_seconds"),
      defaults.audio_seconds,
    ),
    rows_per_batch: positive(
      last(search, "rows_per_batch"),
      defaults.rows_per_batch,
    ),
    features: positive(last(search, "features"), defaults.features),
    input_size_multiplier: positive(
      last(search, "input_size_multiplier"),
      defaults.input_size_multiplier,
    ),
    moe_enabled: checked(search, "moe_enabled", defaults.moe_enabled),
    active_params: positive(
      last(search, "active_params"),
      defaults.active_params,
    ),
    known_model_file_size_gb: decimal(
      last(search, "known_model_file_size_gb"),
      defaults.known_model_file_size_gb,
    ),
    gpu_resident_fraction: positive(
      last(search, "gpu_resident_fraction"),
      defaults.gpu_resident_fraction,
    ),
    kv_cache_precision: schemaValue(
      kvPrecisionSchema,
      last(search, "kv_cache_precision"),
      defaults.kv_cache_precision,
    ),
    exact_transformer_architecture: checked(
      search,
      "exact_transformer_architecture",
      defaults.exact_transformer_architecture,
    ),
    lora_trainable_percent: positive(
      last(search, "lora_trainable_percent"),
      defaults.lora_trainable_percent,
    ),
    optimizer: schemaValue(
      optimizerSchema,
      last(search, "optimizer"),
      defaults.optimizer,
    ),
    gradient_checkpointing: checked(
      search,
      "gradient_checkpointing",
      defaults.gradient_checkpointing,
    ),
    my_gpu_vram_gb: decimal(
      last(search, "my_gpu_vram_gb"),
      defaults.my_gpu_vram_gb,
    ),
    cloud_cost_override: decimal(
      last(search, "cloud_cost_override"),
      defaults.cloud_cost_override,
    ),
  };
}

export function searchFromState(state: FormState): URLSearchParams {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(state)) {
    if (typeof value === "boolean") {
      if (value) {
        search.set(name, "on");
      }
    } else if (value !== "") {
      search.set(name, value);
    }
  }
  return search;
}
