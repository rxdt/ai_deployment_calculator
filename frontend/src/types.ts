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
  | "MXFP4"
  | "MXFP8"
  | "5-bit GGUF"
  | "6-bit GGUF"
  | "8-bit"
  | "16-bit"
  | "32-bit"
  | "IQ1_S"
  | "IQ2_XXS"
  | "IQ3_XXS"
  | "Q4_K_M"
  | "Q5_K_M"
  | "Q6_K"
  | "Q8_0"
  | "INT2"
  | "INT3";

export type KvPrecision = "8-bit / FP8" | "16-bit" | "32-bit";

export type ExecutionMode =
  "Inference" | "LoRA fine-tuning" | "QLoRA fine-tuning" | "Full training";

export type RuntimeProfile = "Local / Edge" | "Server / Cloud";

export type ParameterUnit = "B" | "M";

// Attention memory model. "standard" is conventional (grouped-query) KV; "mla"
// is DeepSeek-style multi-head latent attention (a compressed KV latent + RoPE
// tail cached per token); "kda" is Kimi Delta Attention, a linear/recurrent
// layer with a fixed state instead of a growing per-token cache; "hybrid-kda-mla"
// interleaves MLA and KDA layers as Kimi K3 does (24 gated MLA + 69 KDA).
export type AttentionType = "standard" | "mla" | "kda" | "hybrid-kda-mla";

type Optimizer =
  "AdamW" | "8-bit Adam" | "Paged 8-bit AdamW" | "Adafactor" | "SGD-like";

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
  // Attention memory model plus optional exact-architecture overrides. Every
  // override is a numeric string that falls back to the parameter-count bucket
  // when blank, so a model's real shape (Kimi K3's 93 layers, 96 heads, hybrid
  // MLA/KDA split) can drive the cache math instead of a generic estimate.
  readonly attentionType: AttentionType;
  readonly layers: string;
  readonly hiddenSize: string;
  readonly attentionHeads: string;
  readonly kvHeads: string;
  readonly headDim: string;
  readonly mlaLayers: string;
  readonly kdaLayers: string;
  readonly kvLoraRank: string;
  readonly ropeHeadDim: string;
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

// One actionable multi-GPU parallelism strategy: a framework name plus its
// canonical docs. Surfaced only when a workload cannot fit a single GPU, so the
// answer names concrete next steps for sharding it across cards.
export interface ParallelismStrategy {
  readonly label: string;
  readonly url: string;
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
  readonly calculationRows: readonly DisplayRow[];
  readonly assumptions: readonly DisplayRow[];
  readonly warnings: readonly string[];
  readonly parallelismStrategies: readonly ParallelismStrategy[];
  readonly calculation: string;
  readonly calculationNumbers: string;
}
