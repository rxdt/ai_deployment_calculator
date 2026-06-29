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
  "4-bit" | "5-bit GGUF" | "6-bit GGUF" | "8-bit" | "16-bit" | "32-bit";

export type KvPrecision = "8-bit / FP8" | "16-bit" | "32-bit";

export type ExecutionMode =
  "Inference" | "LoRA fine-tuning" | "QLoRA fine-tuning" | "Full training";

export type RuntimeProfile = "Local / Edge" | "Server / Cloud";

export type ParameterUnit = "B" | "M";

type Optimizer = "AdamW" | "8-bit Adam" | "SGD-like";

type VideoResolution = "720p" | "1080p";

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
  video_resolution: VideoResolution;
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
  lora_trainable_percent: string;
  optimizer: Optimizer;
  gradient_checkpointing: boolean;
  memory_sharding_enabled: boolean;
}

export interface DisplayRow {
  label: string;
  value: string;
}

export interface HardwareRecommendation {
  requiredMemory: string;
  usableVramTarget: string;
  usableVramOnClass: string;
  fitHeadroom: string;
  minimumRawVram: string;
  recommendedTier: string;
  math: string;
}

export interface ReportPayload {
  totalRequiredMemory: string;
  recommendedHardware: HardwareRecommendation;
  minimumRawVramNeeded: string;
  speed: string;
  breakdown: DisplayRow[];
  assumptions: DisplayRow[];
  warnings: string[];
  calculation: string;
}
