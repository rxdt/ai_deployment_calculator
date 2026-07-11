import type { GpuCard, HardwareRecommendation } from "./types";

export interface HardwareTier {
  readonly vramGb: number;
  readonly label: string;
  readonly examples: readonly GpuCard[];
  readonly bandwidthGbps: number;
  readonly kind: "single_gpu" | "aggregate_sharded";
  readonly gpuCount: number;
  readonly requiresSharding: boolean;
}

// GPU product pages. Deep links come from the design bundle where it named them;
// the rest point at NVIDIA's stable series / data-center landing pages so the
// links resist SKU-page churn. Cards with no canonical page render as muted
// text (generic descriptors, sharded pools, or SKUs without a product page).
const NV = "https://www.nvidia.com/en-us";
const GEFORCE_30 = `${NV}/geforce/graphics-cards/30-series/`;
const GEFORCE_40 = `${NV}/geforce/graphics-cards/40-series/`;

// Sharded tiers are several cards, not one product, so they carry a single
// name-only descriptor rather than a linked SKU.
const shardedPool = (gpuCount: number): readonly GpuCard[] => [
  { name: `${gpuCount.toString()}x 80 GB GPUs with tensor/model parallelism` },
];

// Largest tier; the speed-bandwidth basis when a workload overflows the table.
const TOP_TIER: HardwareTier = {
  vramGb: 320,
  label: "320 GB sharded datacenter class",
  examples: shardedPool(4),
  bandwidthGbps: 8156,
  kind: "aggregate_sharded",
  gpuCount: 4,
  requiresSharding: true,
};

export const HARDWARE_TIERS: readonly HardwareTier[] = [
  {
    vramGb: 8,
    label: "8 GB consumer class",
    examples: [
      { name: "RTX 4060", url: `${GEFORCE_40}rtx-4060-4060-ti/` },
      { name: "older 8 GB GPUs" },
    ],
    bandwidthGbps: 272,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 12,
    label: "12 GB consumer class",
    examples: [
      { name: "RTX 3060", url: GEFORCE_30 },
      { name: "RTX 4070", url: GEFORCE_40 },
    ],
    bandwidthGbps: 504,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 16,
    label: "16 GB consumer / small workstation class",
    examples: [
      { name: "RTX 4080", url: `${GEFORCE_40}rtx-4080-family/` },
      { name: "RTX 5000 Ada" },
    ],
    bandwidthGbps: 448,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 24,
    label: "24 GB high-end consumer class",
    examples: [
      { name: "RTX 3090", url: GEFORCE_30 },
      { name: "RTX 4090", url: `${GEFORCE_40}rtx-4090/` },
    ],
    bandwidthGbps: 936,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 48,
    label: "48 GB workstation / pro inference class",
    examples: [
      { name: "RTX A6000" },
      { name: "RTX 6000 Ada", url: `${NV}/design-visualization/rtx-6000/` },
      { name: "L40S" },
    ],
    bandwidthGbps: 768,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 80,
    label: "80 GB datacenter class",
    examples: [
      { name: "A100", url: `${NV}/data-center/a100/` },
      { name: "H100", url: `${NV}/data-center/h100/` },
      { name: "H800" },
    ],
    bandwidthGbps: 2039,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 141,
    label: "141 GB datacenter class",
    examples: [{ name: "H200", url: `${NV}/data-center/h200/` }],
    bandwidthGbps: 4800,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 160,
    label: "160 GB sharded datacenter class",
    examples: shardedPool(2),
    bandwidthGbps: 4078,
    kind: "aggregate_sharded",
    gpuCount: 2,
    requiresSharding: true,
  },
  {
    vramGb: 180,
    label: "180 GB datacenter class",
    examples: [{ name: "B200" }],
    bandwidthGbps: 8000,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  TOP_TIER,
];

// Render a card list as plain " / "-joined text for the recommended-tier string
// used in reasoning copy; the hero card renders the same cards as links.
/**
@param cards - the tier's example GPU cards
@returns the card names joined for inline text
*/
function exampleText(cards: readonly GpuCard[]): string {
  return cards.map((card) => card.name).join(" / ");
}

/**
 
@param value
*/
export function formatGb(value: number): string {
  return `${value.toFixed(1)} GB`;
}

/**
 
@param value
*/
function formatPercent(value: number): string {
  return `${value.toString()}%`;
}

/**
 
@param requiredGb
@param utilization
*/
export function minimumRawVramGb(
  requiredGb: number,
  utilization: number,
): number {
  return requiredGb / utilization;
}

/**
 
@param rawVramGb
@param options
@param options.allowSharding
*/
export function hardware(
  rawVramGb: number,
  options: Readonly<{ allowSharding: boolean }>,
): HardwareTier | "overflow" {
  const eligible = HARDWARE_TIERS.filter(
    (tier) => options.allowSharding || !tier.requiresSharding,
  );
  return eligible.find((tier) => tier.vramGb >= rawVramGb) ?? "overflow";
}

/**
 Describe a workload that no eligible tier fits. When a sharded tier would fit
 once sharding is enabled, name it so the guidance is a concrete next step
 instead of a dead end.
@param rawVramGb - minimum raw VRAM the workload needs
@param shardedFit - the sharded tier that fits once sharding is enabled, or null
*/
export function describeOverflow(
  rawVramGb: number,
  shardedFit: Readonly<HardwareTier> | null = null,
): string {
  if (rawVramGb > 320) {
    return "> 320 GB: distributed multi-node, larger GPU pool, or heavy offload";
  }
  if (shardedFit !== null) {
    return `No single-GPU fit. Enable memory sharding to fit a ${shardedFit.label} (${exampleText(shardedFit.examples)}), or use offload.`;
  }
  return "No single-GPU fit. Enable memory sharding or use offload.";
}

/**
 
@param root0
@param root0.computeWeightGb
@param root0.recommendedTier
*/
export function estimateSpeed({
  computeWeightGb,
  recommendedTier,
}: Readonly<{
  computeWeightGb: number;
  recommendedTier: HardwareTier;
}>): number {
  if (computeWeightGb <= 0) {
    return 0;
  }
  return recommendedTier.bandwidthGbps / computeWeightGb;
}

/**
 
@param tier
*/
export function speedLabel(tier: Readonly<HardwareTier>): string {
  if (tier.requiresSharding) {
    return "Rough sharded-tier speed estimate. Assumes memory sharding / model parallelism works.";
  }
  return "Rough speed estimate from the recommended GPU memory class. Real speed depends on the exact GPU and runtime.";
}

/**
 
@param tier
*/
export function speedTierFor(
  tier: Readonly<HardwareTier> | "overflow",
): HardwareTier {
  return tier === "overflow" ? TOP_TIER : tier;
}

/**
 
@param requiredGb
@param utilization
@param options
@param options.allowSharding
*/
export function hardwareRecommendation(
  requiredGb: number,
  utilization: number,
  options: Readonly<{ allowSharding: boolean }>,
): HardwareRecommendation {
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
      math: "Estimated workload memory is 0.0 GB. Enter model and workload inputs above 0 to size GPU VRAM.",
    };
  }
  const minimum = minimumRawVramGb(requiredGb, utilization);
  const tier = hardware(minimum, options);
  if (tier === "overflow") {
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
      ),
      exampleCards: [],
      math: `Estimated workload memory is ${formatGb(requiredGb)}. With a ${usableTarget} usable VRAM target, use a GPU with at least ${formatGb(minimum)} of physical VRAM so the workload does not consume the entire card.`,
    };
  }
  const usableOnClass = tier.vramGb * utilization;
  const headroom = usableOnClass - requiredGb;
  return {
    requiredMemory: formatGb(requiredGb),
    usableVramTarget: usableTarget,
    usableVramOnClass: formatGb(usableOnClass),
    fitHeadroom: `${formatGb(headroom)} usable margin`,
    minimumRawVram: formatGb(minimum),
    recommendedTier: `${tier.label}, e.g. ${exampleText(tier.examples)}`,
    exampleCards: tier.examples,
    math: `Estimated workload memory is ${formatGb(requiredGb)}. With a ${usableTarget} usable VRAM target, use a GPU with at least ${formatGb(minimum)} of physical VRAM so the workload does not consume the entire card.`,
  };
}
