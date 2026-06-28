import type { HardwareRecommendation } from "./types";

export interface GpuTier {
  vramGb: number;
  label: string;
}

export const GPU_TIERS: readonly GpuTier[] = [
  { vramGb: 8, label: "RTX 4060 Ti or RTX 3070" },
  { vramGb: 12, label: "RTX 3060 or RTX 4070" },
  { vramGb: 16, label: "RTX 4080 or RTX 5000 Ada" },
  { vramGb: 24, label: "RTX 3090, RTX 4090, or RTX 4500 Ada" },
  { vramGb: 48, label: "RTX 6000 Ada, L40S, RTX A6000, or A40" },
  { vramGb: 80, label: "A100, H100, or H800" },
  { vramGb: 141, label: "H200" },
  { vramGb: 160, label: "2x 80GB GPUs with model/tensor parallelism" },
  { vramGb: 180, label: "B200" },
  { vramGb: 320, label: "4x 80GB GPUs with model/tensor parallelism" },
];

export function minimumRawVramGb(
  requiredGb: number,
  utilization: number,
): number {
  return requiredGb / utilization;
}

export function recommendedTier(rawVramGb: number): GpuTier | null {
  return GPU_TIERS.find((tier) => tier.vramGb >= rawVramGb) ?? null;
}

export function formatGb(value: number): string {
  return `${value.toFixed(1)} GB`;
}

export function hardwareRecommendation(
  requiredGb: number,
  utilization: number,
): HardwareRecommendation {
  const minimum = minimumRawVramGb(requiredGb, utilization);
  const tier = recommendedTier(minimum);
  const recommendedTierText =
    tier === null
      ? "> 320 GB physical VRAM: multi-node, larger GPU pool, or heavy offload"
      : `${tier.vramGb} GB physical VRAM: ${tier.label}`;
  const usablePercent = Math.round(utilization * 100);
  return {
    requiredMemory: formatGb(requiredGb),
    usableVramTarget: `${usablePercent}%`,
    minimumRawVram: formatGb(minimum),
    recommendedTier: recommendedTierText,
    math: `Estimated workload memory is ${formatGb(requiredGb)}. With a ${usablePercent}% usable VRAM target, use a GPU with at least ${formatGb(minimum)} of physical VRAM so the workload does not consume the entire card.`,
  };
}
