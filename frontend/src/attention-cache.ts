import type { CalculationSpec } from "./calculator-core";
import type { AttentionType } from "./types";

const BYTES_PER_GB = 1_000_000_000;

// Short-convolution kernel width of a KDA (Kimi Delta Attention) layer; its
// per-head conv state holds this many token slots regardless of context length.
const KDA_CONV_KERNEL = 4;

// A KDA layer keeps three short-convolution states, one each for q, k, and v
// (Moonshot's modeling_kimi_linear.py holds conv_state_q/k/v per layer).
const KDA_CONV_STATES = 3;

// The delta-rule recurrent state is kept in float32 by the reference kernels
// (flash-linear-attention's KDA ops assert an fp32 initial_state), so it does
// not follow the KV cache's selectable precision the way the per-token cache
// does.
const KDA_STATE_BYTES = 4;

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
    arch.attentionHeads *
    arch.headDim *
    (arch.headDim + KDA_CONV_KERNEL * KDA_CONV_STATES);
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
  const perTokenBytes =
    tokenCachedElements(spec) * spec.workloadSize * tokens * spec.kvBytes;
  const fixedBytes =
    recurrentStateElements(spec) * spec.workloadSize * KDA_STATE_BYTES;
  return (perTokenBytes + fixedBytes) / BYTES_PER_GB;
}
