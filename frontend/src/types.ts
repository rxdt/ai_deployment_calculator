export type WorkloadFamily =
  | "text_generation"
  | "text_encoder"
  | "encoder_decoder"
  | "vision"
  | "vision_language"
  | "image_diffusion"
  | "video_generation"
  | "audio"
  | "tabular"
  | "custom";

export type Precision =
  | "4-bit"
  | "5-bit GGUF"
  | "6-bit GGUF"
  | "8-bit"
  | "16-bit"
  | "32-bit";
export type KvPrecision = "8-bit / FP8" | "16-bit" | "32-bit";
export type ExecutionMode =
  | "Inference"
  | "LoRA fine-tuning"
  | "QLoRA fine-tuning"
  | "Full training";
export type RuntimeProfile = "Local / Edge" | "Server / Cloud";
export type ParameterUnit = "B" | "M" | "K";
export type Accuracy =
  | "File-size based"
  | "Component-based"
  | "Advanced override"
  | "Estimated"
  | "Rough";

export interface DisplayRow {
  label: string;
  value: string;
}

export interface HardwareRecommendation {
  requiredMemory: string;
  usableVramTarget: string;
  minimumRawVram: string;
  recommendedTier: string;
  math: string;
}

export interface ReportPayload {
  totalRequiredMemory: string;
  recommendedHardware: HardwareRecommendation;
  minimumRawVramNeeded: string;
  speed: string;
  cloudCost: string | null;
  accuracy: Accuracy;
  breakdown: DisplayRow[];
  assumptions: DisplayRow[];
  warnings: string[];
  calculation: string;
}

export interface FormState {
  workload_family: WorkloadFamily;
  total_params: string;
  parameter_unit: ParameterUnit;
  precision: Precision;
  execution_mode: ExecutionMode;
  runtime_profile: RuntimeProfile;
  workload_size: string;
  context_tokens: string;
  sequence_tokens: string;
  input_tokens: string;
  output_tokens: string;
  image_width: string;
  image_height: string;
  text_context_tokens: string;
  image_count: string;
  video_resolution: "720p" | "1080p";
  video_frames: string;
  audio_seconds: string;
  rows_per_batch: string;
  features: string;
  input_size_multiplier: string;
  moe_enabled: boolean;
  active_params: string;
  known_model_file_size_gb: string;
  gpu_resident_fraction: string;
  kv_cache_precision: KvPrecision;
  exact_transformer_architecture: boolean;
  lora_trainable_percent: string;
  optimizer: "AdamW" | "8-bit Adam" | "SGD-like";
  gradient_checkpointing: boolean;
  my_gpu_vram_gb: string;
  cloud_cost_override: string;
}

export interface BrowserRuntime {
  history: Pick<History, "replaceState">;
  location: Pick<Location, "search">;
}
