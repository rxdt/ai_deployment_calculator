const BYTES_PER_GB = 1_000_000_000;
const INFERENCE_ACTIVATION_FLOOR_GB = 0.5;
const REFERENCE_PARAMS_B = 70;
const mibToGb = (mib: number): number => (mib * 1024 * 1024) / BYTES_PER_GB;

// llama.cpp logs: #7804 reports 1104 MiB on each of two Vulkan GPUs for
// 70B@8k; #10003 reports a 4224 MiB Metal compute buffer for 70B@32k.
const ANCHORS = [
  { tokens: 8192, gb: mibToGb(1104 * 2) },
  { tokens: 32_768, gb: mibToGb(4224) },
] as const;

const referenceGb = (tokens: number): number => {
  const [low, high] = ANCHORS;
  if (tokens <= low.tokens) {
    return low.gb;
  }
  if (tokens >= high.tokens) {
    return high.gb;
  }
  const position = (tokens - low.tokens) / (high.tokens - low.tokens);
  return low.gb + position * (high.gb - low.gb);
};

export const fp16DecoderActivationScratchGb = (
  residentParametersB: number,
  tokens: number,
): number => {
  return Math.max(
    INFERENCE_ACTIVATION_FLOOR_GB,
    referenceGb(tokens) * (residentParametersB / REFERENCE_PARAMS_B),
  );
};
