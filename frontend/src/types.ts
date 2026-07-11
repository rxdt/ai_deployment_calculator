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
  readonly workloadFamily: WorkloadFamily;
  readonly totalParams: string;
  readonly parameterUnit: ParameterUnit;
  readonly precision: Precision;
  readonly executionMode: ExecutionMode;
  readonly runtimeProfile: RuntimeProfile;
  readonly workloadSize: string;
  readonly contextTokens: string;
  readonly sequenceTokens: string;
  readonly inputTokens: string;
  readonly outputTokens: string;
  readonly imageWidth: string;
  readonly imageHeight: string;
  readonly textContextTokens: string;
  readonly imageCount: string;
  readonly videoResolution: VideoResolution;
  readonly videoFrames: string;
  readonly audioSeconds: string;
  readonly rowsPerBatch: string;
  readonly features: string;
  readonly inputSizeMultiplier: string;
  readonly moeEnabled: boolean;
  readonly activeParams: string;
  readonly knownModelFileSizeGb: string;
  readonly gpuResidentFraction: string;
  readonly kvCachePrecision: KvPrecision;
  readonly loraTrainablePercent: string;
  readonly optimizer: Optimizer;
  readonly gradientCheckpointing: boolean;
  readonly memoryShardingEnabled: boolean;
}

export interface DisplayRow {
  readonly label: string;
  readonly value: string;
}

// One recommended example GPU. A `url` marks a card whose product page we link;
// name-only cards (generic descriptors, or SKUs without a canonical page) render
// as muted text, matching the design's linked-name / muted-name split.
export interface GpuCard {
  readonly name: string;
  readonly url?: string;
}

export interface HardwareRecommendation {
  readonly requiredMemory: string;
  readonly usableVramTarget: string;
  readonly usableVramOnClass: string;
  readonly fitHeadroom: string;
  readonly minimumRawVram: string;
  readonly recommendedTier: string;
  readonly exampleCards: readonly GpuCard[];
  readonly math: string;
}

export interface ReportPayload {
  readonly totalRequiredMemory: string;
  readonly recommendedHardware: HardwareRecommendation;
  readonly minimumRawVramNeeded: string;
  readonly speed: string;
  readonly statChips: readonly DisplayRow[];
  readonly breakdown: readonly DisplayRow[];
  readonly calculationRows: readonly DisplayRow[];
  readonly assumptions: readonly DisplayRow[];
  readonly warnings: readonly string[];
  readonly calculation: string;
}
