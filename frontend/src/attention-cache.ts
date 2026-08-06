import type { CalculationSpec } from "./calculator-core";
import type { AttentionType } from "./types";

const BYTES_PER_GB = 1_000_000_000;

// Short-convolution kernel width of a KDA (Kimi Delta Attention) layer; its
// per-head conv state holds this many token slots regardless of context length.
const KDA_CONV_KERNEL = 4;

// Elements cached per token, summed over every layer that keeps a growing
// per-token cache. A standard (grouped-query) layer stores separate K and V for
// each KV head; an MLA layer stores only its compressed KV latent plus the RoPE
// tail (one vector, so no K/V doubling); a KDA layer stores nothing per token.
// A hybrid stack partitions its layers into MLA and KDA, and any remainder keeps
// a conventional cache so the split never silently drops layers.
const tokenCachedElements = (spec: Readonly<CalculationSpec>): number => {
  const arch = spec.architecture;
  const { type, mlaLayers, kdaLayers, kvLoraRank, ropeHeadDim } =
    spec.attention;
  const standardPerLayer = 2 * arch.kvHeads * arch.headDim;
  const mlaPerLayer = kvLoraRank + ropeHeadDim;
  const remainder = Math.max(0, arch.layers - mlaLayers - kdaLayers);
  const byType: Record<AttentionType, number> = {
    standard: arch.layers * standardPerLayer,
    mla: arch.layers * mlaPerLayer,
    kda: 0,
    "hybrid-kda-mla": mlaLayers * mlaPerLayer + remainder * standardPerLayer,
  };
  return byType[type];
};

// How many layers hold a fixed KDA recurrent state: all of them for a pure KDA
// model, just the KDA slice of a hybrid stack, and none otherwise.
const recurrentStateLayers = (spec: Readonly<CalculationSpec>): number => {
  const byType: Record<AttentionType, number> = {
    standard: 0,
    mla: 0,
    kda: spec.architecture.layers,
    "hybrid-kda-mla": spec.attention.kdaLayers,
  };
  return byType[spec.attention.type];
};

// Fixed recurrent-state elements a KDA model holds independent of context: a
// per-head delta-rule state matrix (head_dim x head_dim) plus the short-conv
// window. This is why a KDA/hybrid model's cache barely grows with sequence
// length where a conventional cache would explode at long context.
const recurrentStateElements = (spec: Readonly<CalculationSpec>): number => {
  const arch = spec.architecture;
  const perLayer =
    arch.attentionHeads * arch.headDim * (arch.headDim + KDA_CONV_KERNEL);
  return recurrentStateLayers(spec) * perLayer;
};

/**
Decoder KV / recurrent-state memory (GB) for the spec's attention model.
@param spec Calculation request.
@param tokens Context length in tokens.
@returns cache memory in GB
*/
export function decoderKvGb(
  spec: Readonly<CalculationSpec>,
  tokens: number,
): number {
  const perToken = tokenCachedElements(spec) * spec.workloadSize * tokens;
  const fixed = recurrentStateElements(spec) * spec.workloadSize;
  return ((perToken + fixed) * spec.kvBytes) / BYTES_PER_GB;
}
