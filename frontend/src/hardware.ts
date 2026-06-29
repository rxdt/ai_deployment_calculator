import type { HardwareRecommendation } from "./types";

export interface HardwareTier {
  vramGb: number;
  label: string;
  examples: string;
  bandwidthGbps: number;
  kind: "single_gpu" | "aggregate_sharded";
  gpuCount: number;
  requiresSharding: boolean;
}

// Largest tier; the speed-bandwidth basis when a workload overflows the table.
const TOP_TIER: HardwareTier = {
  vramGb: 320,
  label: "320 GB sharded datacenter class",
  examples: "4x 80 GB GPUs with tensor/model parallelism",
  bandwidthGbps: 8156,
  kind: "aggregate_sharded",
  gpuCount: 4,
  requiresSharding: true,
};

export const HARDWARE_TIERS: readonly HardwareTier[] = [
  {
    vramGb: 8,
    label: "8 GB consumer class",
    examples: "RTX 4060 / older 8 GB GPUs",
    bandwidthGbps: 272,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 12,
    label: "12 GB consumer class",
    examples: "RTX 3060 / RTX 4070 class",
    bandwidthGbps: 504,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 16,
    label: "16 GB consumer / small workstation class",
    examples: "RTX 4080 / RTX 5000 Ada class",
    bandwidthGbps: 448,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 24,
    label: "24 GB high-end consumer class",
    examples: "RTX 3090 / RTX 4090 class",
    bandwidthGbps: 936,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 48,
    label: "48 GB workstation / pro inference class",
    examples: "RTX A6000 / RTX 6000 Ada / L40S class",
    bandwidthGbps: 768,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 80,
    label: "80 GB datacenter class",
    examples: "A100 / H100 / H800 class",
    bandwidthGbps: 2039,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 141,
    label: "141 GB datacenter class",
    examples: "H200 class",
    bandwidthGbps: 4800,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  {
    vramGb: 160,
    label: "160 GB sharded datacenter class",
    examples: "2x 80 GB GPUs with tensor/model parallelism",
    bandwidthGbps: 4078,
    kind: "aggregate_sharded",
    gpuCount: 2,
    requiresSharding: true,
  },
  {
    vramGb: 180,
    label: "180 GB datacenter class",
    examples: "B200 class",
    bandwidthGbps: 8000,
    kind: "single_gpu",
    gpuCount: 1,
    requiresSharding: false,
  },
  TOP_TIER,
];

export function formatGb(value: number): string {
  return `${value.toFixed(1)} GB`;
}

function formatPercent(value: number): string {
  return `${value.toString()}%`;
}

export function minimumRawVramGb(
  requiredGb: number,
  utilization: number,
): number {
  return requiredGb / utilization;
}

export function hardware(
  rawVramGb: number,
  options: { allowSharding: boolean },
): HardwareTier | "overflow" {
  const eligible = HARDWARE_TIERS.filter(
    (tier) => options.allowSharding || !tier.requiresSharding,
  );
  return eligible.find((tier) => tier.vramGb >= rawVramGb) ?? "overflow";
}

export function describeOverflow(rawVramGb: number): string {
  if (rawVramGb > 320) {
    return "> 320 GB: distributed multi-node, larger GPU pool, or heavy offload";
  }
  return "No single-GPU fit. Enable memory sharding or use offload.";
}

export function estimateSpeed({
  computeWeightGb,
  recommendedTier,
}: {
  computeWeightGb: number;
  recommendedTier: HardwareTier;
}): number {
  if (computeWeightGb <= 0) {
    return 0;
  }
  return recommendedTier.bandwidthGbps / computeWeightGb;
}

export function speedLabel(tier: HardwareTier): string {
  if (tier.requiresSharding) {
    return "Rough sharded-tier speed estimate. Assumes memory sharding / model parallelism works.";
  }
  return "Rough speed estimate from the recommended GPU memory class. Real speed depends on the exact GPU and runtime.";
}

export function speedTierFor(tier: HardwareTier | "overflow"): HardwareTier {
  return tier === "overflow" ? TOP_TIER : tier;
}

export function hardwareRecommendation(
  requiredGb: number,
  utilization: number,
  options: { allowSharding: boolean },
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
      math: "Estimated workload memory is 0.0 GB. Enter model and workload inputs above 0 to size GPU VRAM.",
    };
  }
  const minimum = minimumRawVramGb(requiredGb, utilization);
  const tier = hardware(minimum, options);
  if (tier === "overflow") {
    return {
      requiredMemory: formatGb(requiredGb),
      usableVramTarget: usableTarget,
      usableVramOnClass: "n/a",
      fitHeadroom: "n/a",
      minimumRawVram: formatGb(minimum),
      recommendedTier: describeOverflow(minimum),
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
    recommendedTier: `${tier.label}, e.g. ${tier.examples}`,
    math: `Estimated workload memory is ${formatGb(requiredGb)}. With a ${usableTarget} usable VRAM target, use a GPU with at least ${formatGb(minimum)} of physical VRAM so the workload does not consume the entire card.`,
  };
}
