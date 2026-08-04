import { roundUpTo } from "./calculator-core";
import type { GpuCard, HardwareRecommendation } from "./types";

export interface HardwareTier {
  readonly vramGb: number;
  readonly label: string;
  readonly examples: readonly GpuCard[];
  readonly bandwidthGbps: number;
  readonly requiresSharding: boolean;
}

export const GPU_LINKS = {
  rtx4060:
    "https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4060-4060ti/",
  rtx3060: "https://www.nvidia.com/en-us/geforce/graphics-cards/30-series/",
  rx9070Gre:
    "https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9070-gre.html",
  rx6700Xt: "https://www.amd.com/en/products/graphics/amd-radeon-rx-6700-xt",
  rtx4070: "https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/",
  rtx4080:
    "https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4080-family/",
  rtx5000Ada: "https://www.nvidia.com/en-us/design-visualization/rtx-5000/",
  rx7800Xt:
    "https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/amd-radeon-rx-7800-xt.html",
  rx7900Xt:
    "https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/amd-radeon-rx-7900xt.html",
  rtx4090:
    "https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/",
  rtx3090:
    "https://www.nvidia.com/en-us/geforce/graphics-cards/30-series/rtx-3090-3090ti/",
  rtx5090:
    "https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/",
  w7800:
    "https://www.amd.com/en/products/graphics/workstations/radeon-pro/w7800.html",
  l4: "https://www.nvidia.com/en-us/data-center/l4/",
  rtxA6000: "https://www.nvidia.com/en-us/design-visualization/rtx-a6000/",
  rtx6000Ada: "https://www.nvidia.com/en-us/design-visualization/rtx-6000/",
  l40s: "https://www.nvidia.com/en-us/data-center/l40s/",
  macMiniSpecs: "https://www.apple.com/mac-mini/specs/",
  macMiniM4Pro48:
    "https://www.apple.com/us-edu/shop/buy-mac/mac-mini/m4-pro-chip-14-core-cpu-20-core-gpu-48gb-memory-1tb-storage",
  macStudioSpecs: "https://www.apple.com/mac-studio/specs/",
  mi210:
    "https://www.amd.com/en/products/accelerators/instinct/mi200/mi210.html",
  mi300x:
    "https://www.amd.com/en/products/accelerators/instinct/mi300/mi300x.html",
  inf2: "https://aws.amazon.com/ec2/instance-types/inf2/",
  rtxPro6000Blackwell:
    "https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000/",
  tpuV4: "https://docs.cloud.google.com/tpu/docs/v4",
  tpuV5e: "https://docs.cloud.google.com/tpu/docs/v5e",
  tpuV5p: "https://docs.cloud.google.com/tpu/docs/v5p",
  tpuV6e: "https://docs.cloud.google.com/tpu/docs/v6e",
  tpu7x: "https://docs.cloud.google.com/tpu/docs/tpu7x",
  a100: "https://www.nvidia.com/en-us/data-center/a100/",
  h100: "https://www.nvidia.com/en-us/data-center/h100/",
  h200: "https://www.nvidia.com/en-us/data-center/h200/",
  b200: "https://www.nvidia.com/en-us/data-center/dgx-b200/",
} as const;

const card = (name: string, link: keyof typeof GPU_LINKS): GpuCard => ({
  name,
  url: GPU_LINKS[link],
});

const nameOnly = (name: string): GpuCard => ({ name });

const hardwareTier = (
  vramGb: number,
  label: string,
  examples: readonly GpuCard[],
  bandwidthGbps: number,
): HardwareTier => ({
  vramGb,
  label,
  examples,
  bandwidthGbps,
  requiresSharding: false,
});

const shardedTier = (
  gpuCount: number,
  bandwidthGbps: number,
): HardwareTier => ({
  vramGb: gpuCount * 80,
  label: `${(gpuCount * 80).toString()} GB sharded datacenter class`,
  examples: [
    {
      name: `${gpuCount.toString()}x 80 GB GPUs with tensor/model parallelism`,
    },
  ],
  bandwidthGbps,
  requiresSharding: true,
});

const TOP_TIER = shardedTier(4, 8156);

const TIER_EXAMPLES = {
  8: [card("RTX 4060", "rtx4060"), nameOnly("older 8 GB GPUs")],
  12: [
    card("RTX 3060", "rtx3060"),
    card("RTX 4070", "rtx4070"),
    card("RX 9070 GRE", "rx9070Gre"),
    card("RX 6700 XT", "rx6700Xt"),
  ],
  16: [
    card("RTX 4080", "rtx4080"),
    card("RX 7800 XT", "rx7800Xt"),
    card("RTX 5000 Ada", "rtx5000Ada"),
    card("Mac mini M4 16 GB", "macMiniSpecs"),
    card("Cloud TPU v5e", "tpuV5e"),
  ],
  20: [card("RX 7900 XT", "rx7900Xt")],
  24: [
    card("RTX 4090", "rtx4090"),
    card("RTX 3090", "rtx3090"),
    card("L4", "l4"),
    card("Mac mini M4 24 GB", "macMiniSpecs"),
    card("Mac mini M4 Pro 24 GB", "macMiniSpecs"),
  ],
  32: [
    card("RTX 5090", "rtx5090"),
    card("Radeon PRO W7800", "w7800"),
    card("AWS Inferentia2", "inf2"),
    card("Cloud TPU v6e", "tpuV6e"),
    card("Cloud TPU v4", "tpuV4"),
  ],
  36: [card("Mac Studio M4 Max 36 GB", "macStudioSpecs")],
  48: [
    card("RTX A6000", "rtxA6000"),
    card("RTX 6000 Ada", "rtx6000Ada"),
    card("L40S", "l40s"),
    card("Mac mini M4 Pro 48 GB", "macMiniM4Pro48"),
  ],
  64: [
    card("Mac Studio M4 Max 64 GB", "macStudioSpecs"),
    card("AMD Instinct MI210", "mi210"),
  ],
  80: [card("A100", "a100"), card("H100", "h100"), card("H800", "h100")],
  95: [card("Cloud TPU v5p", "tpuV5p")],
  96: [
    card("Mac Studio M3 Ultra 96 GB", "macStudioSpecs"),
    card("NVIDIA RTX PRO 6000 Blackwell", "rtxPro6000Blackwell"),
  ],
  141: [card("H200", "h200")],
  180: [card("B200", "b200")],
  192: [card("Cloud TPU7x", "tpu7x"), card("AMD Instinct MI300X", "mi300x")],
} as const;

export const HARDWARE_TIERS: readonly HardwareTier[] = [
  hardwareTier(8, "8 GB consumer class", TIER_EXAMPLES[8], 272),
  hardwareTier(12, "12 GB consumer class", TIER_EXAMPLES[12], 504),
  hardwareTier(
    16,
    "16 GB consumer / small workstation class",
    TIER_EXAMPLES[16],
    448,
  ),
  hardwareTier(20, "20 GB consumer class", TIER_EXAMPLES[20], 800),
  hardwareTier(24, "24 GB high-end consumer class", TIER_EXAMPLES[24], 936),
  hardwareTier(32, "32 GB high-end consumer class", TIER_EXAMPLES[32], 1792),
  hardwareTier(36, "36 GB Apple Silicon class", TIER_EXAMPLES[36], 410),
  hardwareTier(
    48,
    "48 GB workstation / pro inference class",
    TIER_EXAMPLES[48],
    768,
  ),
  hardwareTier(64, "64 GB Apple Silicon class", TIER_EXAMPLES[64], 546),
  hardwareTier(80, "80 GB datacenter class", TIER_EXAMPLES[80], 2039),
  hardwareTier(95, "95 GB Cloud TPU class", TIER_EXAMPLES[95], 2765),
  hardwareTier(96, "96 GB Apple Silicon class", TIER_EXAMPLES[96], 819),
  hardwareTier(141, "141 GB datacenter class", TIER_EXAMPLES[141], 4800),
  shardedTier(2, 4078),
  hardwareTier(180, "180 GB datacenter class", TIER_EXAMPLES[180], 8000),
  hardwareTier(192, "192 GB Cloud TPU class", TIER_EXAMPLES[192], 7370),
  TOP_TIER,
];

const exampleText = (cards: readonly GpuCard[]): string =>
  cards.map((gpu) => gpu.name).join(" / ");

export const formatGb = (value: number): string =>
  `${roundUpTo(value, 1).toFixed(1)} GB`;

const formatPercent = (value: number): string => `${value.toString()}%`;

export const minimumRawVramGb = (
  requiredGb: number,
  utilization: number,
): number => requiredGb / utilization;

export const hardware = (
  rawVramGb: number,
  options: Readonly<{ allowSharding: boolean }>,
): HardwareTier | "overflow" => {
  const eligible = HARDWARE_TIERS.filter(
    (tier) => options.allowSharding || !tier.requiresSharding,
  );
  return eligible.find((tier) => tier.vramGb >= rawVramGb) ?? "overflow";
};

// Above the largest modeled pool the ladder has no rung to name, so size the
// deployment from the estimate itself: how many 80 GB accelerators it takes to
// hold the minimum raw memory. Stopping at "> 320 GB" reads as though 320 GB
// were the answer, which for a multi-terabyte model it is not.
const POOL_GPU_GB = 80;

const distributedPool = (rawVramGb: number): string =>
  `${Math.ceil(rawVramGb / POOL_GPU_GB).toString()}x ${POOL_GPU_GB.toString()} GB GPUs`;

export const describeOverflow = (
  rawVramGb: number,
  shardedFit: Readonly<HardwareTier> | null,
  options: Readonly<{ allowSharding: boolean }>,
): string => {
  if (shardedFit !== null) {
    // Name the pool AND why it is that size: pools come in fixed steps, so the
    // smallest one covering the estimate can sit well above the raw need.
    return `No single-accelerator fit. Enable memory sharding to split the model across a ${shardedFit.label} (${exampleText(shardedFit.examples)}), the smallest standard pool that covers this estimate. Slower alternative: offload part of the model to CPU memory.`;
  }
  // Past every modeled pool. Sharding is not optional here, so the two states
  // differ in what they recommend, not in whether they say anything at all.
  if (options.allowSharding) {
    return `Beyond any single modeled pool: distributed multi-node, roughly ${distributedPool(rawVramGb)}, or heavy offload.`;
  }
  return `No single-accelerator fit, and no modeled pool is large enough. Enable memory sharding to plan a distributed deployment (roughly ${distributedPool(rawVramGb)}), or offload part of the model to CPU memory (slower).`;
};

export const estimateSpeed = ({
  computeWeightGb,
  recommendedTier,
}: Readonly<{
  computeWeightGb: number;
  recommendedTier: HardwareTier;
}>): number => {
  if (computeWeightGb <= 0) {
    return 0;
  }
  return recommendedTier.bandwidthGbps / computeWeightGb;
};

export const speedLabel = (tier: Readonly<HardwareTier>): string => {
  if (tier.requiresSharding) {
    return "Rough sharded-tier speed estimate. Assumes memory sharding / model parallelism works.";
  }
  return "Rough speed estimate from the recommended GPU memory class. Real speed depends on the exact GPU and runtime.";
};

// Which tier answers "does this need more than one GPU?". An overflow needs at
// least the largest modeled pool, so it answers yes through TOP_TIER. This is
// deliberately not used to price throughput: quoting TOP_TIER's bandwidth for a
// model that does not fit in TOP_TIER states a speed for hardware that cannot
// run it (see speedEstimate, which reports no number for an overflow).
export const speedTierFor = (
  tier: Readonly<HardwareTier> | "overflow",
): HardwareTier => (tier === "overflow" ? TOP_TIER : tier);

// Both sized outcomes explain the headroom target the same way, so the sentence
// lives once.
const sizingMath = (
  requiredGb: number,
  minimum: number,
  usableTarget: string,
): string =>
  `Estimated workload memory is ${formatGb(requiredGb)}. With a ${usableTarget} usable memory target, use hardware with at least ${formatGb(minimum)} of accelerator memory so the workload does not consume the entire device.`;

// The overflow arm of hardwareRecommendation: no tier fits, so there is no
// usable-class or headroom figure to report, only a route to a larger pool.
const overflowRecommendation = (
  requiredGb: number,
  minimum: number,
  usableTarget: string,
  options: Readonly<{ allowSharding: boolean }>,
): HardwareRecommendation => {
  const shardedFit = hardware(minimum, { allowSharding: true });
  return {
    requiredMemory: formatGb(requiredGb),
    usableVramTarget: usableTarget,
    usableVramOnClass: "n/a",
    fitHeadroom: "n/a",
    minimumRawVram: formatGb(minimum),
    recommendedTier: describeOverflow(
      minimum,
      shardedFit === "overflow" ? null : shardedFit,
      options,
    ),
    exampleCards: [],
    math: sizingMath(requiredGb, minimum, usableTarget),
  };
};

export const hardwareRecommendation = (
  requiredGb: number,
  utilization: number,
  options: Readonly<{ allowSharding: boolean }>,
): HardwareRecommendation => {
  const usablePercent = Math.round(utilization * 100);
  const usableTarget = formatPercent(usablePercent);
  if (requiredGb === 0) {
    return {
      requiredMemory: "0.0 GB",
      usableVramTarget: usableTarget,
      usableVramOnClass: "n/a",
      fitHeadroom: "n/a",
      minimumRawVram: "0.0 GB",
      recommendedTier: "No model loaded",
      exampleCards: [],
      math: "Estimated workload memory is 0.0 GB. Enter model and workload inputs above 0 to size accelerator memory.",
    };
  }
  const minimum = minimumRawVramGb(requiredGb, utilization);
  const tier = hardware(minimum, options);
  if (tier === "overflow") {
    return overflowRecommendation(requiredGb, minimum, usableTarget, options);
  }
  const usableOnClass = tier.vramGb * utilization;
  // The tier is the smallest whose usable share covers the requirement, so the
  // margin is non-negative by construction; clamp the float undershoot that
  // otherwise renders "-0.0 GB" (e.g. 36 x 0.85 = 30.599999999999997 vs 30.6).
  const headroom = Math.max(0, usableOnClass - requiredGb);
  return {
    requiredMemory: formatGb(requiredGb),
    usableVramTarget: usableTarget,
    usableVramOnClass: formatGb(usableOnClass),
    fitHeadroom: `${formatGb(headroom)} usable margin`,
    minimumRawVram: formatGb(minimum),
    recommendedTier: `${tier.label}, e.g. ${exampleText(tier.examples)}`,
    exampleCards: tier.examples,
    math: sizingMath(requiredGb, minimum, usableTarget),
  };
};
