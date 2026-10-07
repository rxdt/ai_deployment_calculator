import type { AttentionType } from "./types";

export interface TransformerArchitecture {
  readonly layers: number;
  readonly hidden: number;
  readonly attentionHeads: number;
  readonly kvHeads: number;
  readonly headDim: number;
}

// How the decoder caches attention state, resolved from the form's attention
// controls. Layer counts and the MLA latent widths drive workload-memory's
// cache math; for a hybrid model mlaLayers + kdaLayers partition the stack, and
// any remainder falls back to a conventional per-token KV cache.
export interface AttentionMemory {
  readonly type: AttentionType;
  readonly mlaLayers: number;
  readonly kdaLayers: number;
  readonly kvLoraRank: number;
  readonly ropeHeadDim: number;
}

// Transformer shape by parameter count (billions). Ordered ascending by the inclusive upper bound;
// the last entry (Infinity) is the fallback for the largest models.
interface ArchitectureBucket {
  readonly maxB: number;
  readonly architecture: TransformerArchitecture;
}

const ARCHITECTURE_BUCKETS: readonly [
  ArchitectureBucket,
  ...ArchitectureBucket[],
] = [
  {
    maxB: 1,
    architecture: {
      layers: 16,
      hidden: 2048,
      attentionHeads: 32,
      kvHeads: 8,
      headDim: 64,
    },
  },
  {
    maxB: 4,
    architecture: {
      layers: 28,
      hidden: 3072,
      attentionHeads: 24,
      kvHeads: 8,
      headDim: 128,
    },
  },
  {
    maxB: 10,
    architecture: {
      layers: 32,
      hidden: 4096,
      attentionHeads: 32,
      kvHeads: 8,
      headDim: 128,
    },
  },
  {
    maxB: 20,
    architecture: {
      layers: 40,
      hidden: 5120,
      attentionHeads: 40,
      kvHeads: 8,
      headDim: 128,
    },
  },
  {
    maxB: 40,
    architecture: {
      layers: 48,
      hidden: 6144,
      attentionHeads: 48,
      kvHeads: 8,
      headDim: 128,
    },
  },
  {
    maxB: 80,
    architecture: {
      layers: 80,
      hidden: 8192,
      attentionHeads: 64,
      kvHeads: 8,
      headDim: 128,
    },
  },
  {
    maxB: 160,
    architecture: {
      layers: 96,
      hidden: 10_240,
      attentionHeads: 80,
      kvHeads: 8,
      headDim: 128,
    },
  },
  {
    maxB: Infinity,
    architecture: {
      layers: 120,
      hidden: 12_288,
      attentionHeads: 96,
      kvHeads: 8,
      headDim: 128,
    },
  },
];

// The final bucket has maxB: Infinity, so it matches every finite input. Only NaN matches
// nothing (all comparisons are false); it then falls back to the first (smallest) bucket.
/**
@param parametersB
*/
export function architectureFor(parametersB: number): TransformerArchitecture {
  const bucket = ARCHITECTURE_BUCKETS.find(({ maxB }) => parametersB <= maxB);
  return (bucket ?? ARCHITECTURE_BUCKETS[0]).architecture;
}
