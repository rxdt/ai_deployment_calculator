import type { HardwareRecommendation } from "./types";

export interface GpuTier {
  vramGb: number;
  label: string;
  hourlyRate: number;
}

export const GPU_TIERS: readonly GpuTier[] = [
  { vramGb: 8, label: "Entry local GPU class", hourlyRate: 0.25 },
  { vramGb: 12, label: "Mid-range consumer GPU class", hourlyRate: 0.4 },
  {
    vramGb: 16,
    label: "Larger consumer / small workstation class",
    hourlyRate: 0.6,
  },
  {
    vramGb: 24,
    label: "High-end consumer GPU class, e.g. RTX 3090 / RTX 4090",
    hourlyRate: 1,
  },
  {
    vramGb: 48,
    label: "Workstation GPU class or sharded multi-GPU",
    hourlyRate: 1.5,
  },
  {
    vramGb: 80,
    label: "Datacenter GPU class, e.g. A100/H100 80GB",
    hourlyRate: 2.5,
  },
  { vramGb: 160, label: "2x 80GB GPUs with memory sharding", hourlyRate: 5 },
  { vramGb: 320, label: "4x 80GB GPUs with memory sharding", hourlyRate: 10 },
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
      ? "> 320 GB: Distributed multi-node or heavy offload"
      : `${tier.vramGb} GB: ${tier.label}`;
  return {
    requiredMemory: formatGb(requiredGb),
    usableVramTarget: `${Math.round(utilization * 100)}%`,
    minimumRawVram: formatGb(minimum),
    recommendedTier: recommendedTierText,
    math: `${formatGb(requiredGb)} / ${Math.round(utilization * 100)}% = ${formatGb(minimum)} raw VRAM`,
  };
}

export function cloudCost(
  requiredGb: number,
  utilization: number,
  override: string,
): string {
  const parsedOverride = Number(override);
  const minimum = minimumRawVramGb(requiredGb, utilization);
  const tier = recommendedTier(minimum);
  const [fallbackTier] = GPU_TIERS.slice(-1);
  const gpuCount = tier === null ? Math.ceil(minimum / fallbackTier.vramGb) : 1;
  const hourlyRate =
    Number.isFinite(parsedOverride) && parsedOverride > 0
      ? parsedOverride
      : (tier ?? fallbackTier).hourlyRate;
  const rate = gpuCount * hourlyRate;
  return `$${rate.toFixed(2)}/hr static estimate. Actual pricing varies by provider, region, GPU model, commitment, and availability.`;
}
