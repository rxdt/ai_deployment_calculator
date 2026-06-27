// Hardware recommendation and deployment plan: map a deployment's VRAM need onto real GPUs, classify each fit, pick a primary card, and surface one optimization.

import type { DeploymentSpec } from "./calculator";
import { totalVramGb } from "./calculator";

export interface Gpu {
  name: string;
  vram_gb: number;
}

// Common deployment targets, ordered from least to most VRAM per card.
export const GPU_CATALOG: readonly Gpu[] = [
  { name: "T4 16GB", vram_gb: 16 },
  { name: "RTX 4090", vram_gb: 24 },
  { name: "L4 24GB", vram_gb: 24 },
  { name: "A100 40GB", vram_gb: 40 },
  { name: "A100 80GB", vram_gb: 80 },
  { name: "H100 80GB", vram_gb: 80 },
  { name: "B200 192GB", vram_gb: 192 },
];
export const HOST_RAM_FLOOR_GB = 32;
export const HOST_RAM_STEP_GB = 16;
const MAX_TENSOR_PARALLEL_CARDS = 4; // Past this a single deployment is an awkward large shard.
const LOWEST_WEIGHT_BITS = 4; // Weights are already at the lowest supported precision.
const FP8_KV_BITS = 8; // KV cache can drop to 8-bit (FP8) before precision loss bites.

export const OPTIMIZE_WEIGHTS =
  "Lower weight precision (8-bit or 4-bit) to shrink the model weights first.";
export const OPTIMIZE_KV_CACHE =
  "Use an FP8 KV cache to shrink long-context memory that weight quantization can't.";
export const OPTIMIZE_SHARDING =
  "Reduce the context window or move to larger-memory GPUs to avoid tensor parallelism.";
export const OPTIMIZE_NONE =
  "No memory optimization needed; the deployment already fits a single card.";

export type FitLabel = "single_gpu" | "tensor_parallel" | "large_shard";

export interface HardwareOption {
  gpu: Gpu;
  gpu_count: number;
  tensor_parallel: boolean;
}

interface PlanOption {
  option: HardwareOption;
  fit: FitLabel;
}

export interface DeploymentPlan {
  options: PlanOption[];
  primary: PlanOption;
  optimization: string;
}

export function gpusNeeded(requiredGb: number, gpuVramGb: number): number {
  return Math.ceil(requiredGb / gpuVramGb);
}

export function recommendedHostRamGb(spec: DeploymentSpec): number {
  const roundedVram =
    Math.ceil(totalVramGb(spec) / HOST_RAM_STEP_GB) * HOST_RAM_STEP_GB;
  return Math.max(HOST_RAM_FLOOR_GB, roundedVram);
}

export function fitLabel(option: HardwareOption): FitLabel {
  if (option.gpu_count === 1) {
    return "single_gpu";
  }
  if (option.gpu_count <= MAX_TENSOR_PARALLEL_CARDS) {
    return "tensor_parallel";
  }
  return "large_shard";
}

interface IndexedPlan {
  plan: PlanOption;
  index: number;
}

// Sort precedence matching the spec: fewest cards, then catalog order. `tensor_parallel`
// is fully determined by `gpu_count`, so comparing card count then index suffices.
function isHigherPriority(candidate: IndexedPlan, best: IndexedPlan): boolean {
  if (candidate.plan.option.gpu_count !== best.plan.option.gpu_count) {
    return candidate.plan.option.gpu_count < best.plan.option.gpu_count;
  }
  return candidate.index < best.index;
}

function optimizationNote(spec: DeploymentSpec, primary: PlanOption): string {
  if (spec.weight_bits > LOWEST_WEIGHT_BITS) {
    return OPTIMIZE_WEIGHTS;
  }
  if (spec.kv_cache_bits > FP8_KV_BITS && spec.context_tokens > 0) {
    return OPTIMIZE_KV_CACHE;
  }
  if (primary.option.tensor_parallel) {
    return OPTIMIZE_SHARDING;
  }
  return OPTIMIZE_NONE;
}

export function deploymentPlan(spec: DeploymentSpec): DeploymentPlan {
  const required = totalVramGb(spec);
  const options = GPU_CATALOG.map((gpu) => {
    const count = gpusNeeded(required, gpu.vram_gb);
    const option: HardwareOption = {
      gpu,
      gpu_count: count,
      tensor_parallel: count > 1,
    };
    return { option, fit: fitLabel(option) };
  });
  let best: IndexedPlan = { plan: options[0], index: 0 };
  for (const [index, plan] of options.entries()) {
    const candidate: IndexedPlan = { plan, index };
    if (isHigherPriority(candidate, best)) {
      best = candidate;
    }
  }
  const primary = best.plan;
  return {
    options,
    primary,
    optimization: optimizationNote(spec, primary),
  };
}
