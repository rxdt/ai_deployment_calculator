import { defaultState, normalizedState, searchFromState } from "./state";
import type { FormState } from "./types";

export interface ModelPreset {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly overrides: Partial<FormState>;
}

/**
 One-click starting points for widely deployed open models, in the order the
 design's preset row lists them. Each preset names a real model and carries only
 the inputs that differ from the seed deployment; the calculator applies them
 over `defaultState()`, so unspecified fields (context window, runtime profile,
 ...) keep their defaults.

 Parameter counts are the models' published totals. Kimi K3 is the mixture-of-
 experts entry: it carries the MoE flag and active-parameter count plus its exact
 architecture (93 layers split 24 gated-MLA / 69 KDA, hidden 7168, 96 heads) and
 MXFP4 weights, so the estimate reflects a hybrid-attention model at 1M context
 instead of a generic bucket. SDXL is an image-diffusion model, so it switches the
 workload family away from text-generation and drives the image-generation branch.
*/
export const MODEL_PRESETS: readonly ModelPreset[] = [
  {
    id: "llama-8b",
    label: "Llama 8B",
    url: "https://huggingface.co/meta-llama/Llama-3.1-8B",
    overrides: {
      workloadFamily: "text_generation",
      totalParams: "8",
      parameterUnit: "B",
      precision: "16-bit",
    },
  },
  {
    id: "llama-70b",
    label: "Llama 70B",
    url: "https://huggingface.co/meta-llama/Llama-3.1-70B",
    overrides: {
      workloadFamily: "text_generation",
      totalParams: "70",
      parameterUnit: "B",
      precision: "16-bit",
    },
  },
  {
    id: "kimi-k3",
    label: "Kimi K3",
    url: "https://huggingface.co/moonshotai",
    overrides: {
      workloadFamily: "text_generation",
      totalParams: "2780",
      parameterUnit: "B",
      precision: "MXFP4",
      moeEnabled: true,
      activeParams: "104",
      contextTokens: "1048576",
      memoryShardingEnabled: true,
      attentionType: "hybrid-kda-mla",
      layers: "93",
      hiddenSize: "7168",
      attentionHeads: "96",
      headDim: "128",
      mlaLayers: "24",
      kdaLayers: "69",
      kvLoraRank: "512",
      ropeHeadDim: "64",
    },
  },
  {
    id: "gemma-9b",
    label: "Gemma",
    url: "https://huggingface.co/google/gemma-2-9b",
    overrides: {
      workloadFamily: "text_generation",
      totalParams: "9",
      parameterUnit: "B",
      precision: "16-bit",
    },
  },
  {
    id: "sdxl",
    label: "SDXL",
    url: "https://stablediffusionxl.com/",
    overrides: {
      workloadFamily: "image_diffusion",
      totalParams: "3.5",
      parameterUnit: "B",
      precision: "16-bit",
    },
  },
  {
    // DistilBERT MNLI classifier in its ONNX int8 export — the catalog's tiny
    // end: a 67M-parameter encoder at 8-bit, the smallest published file
    // (67.5 MB; the repo's q4 keeps fp32 layers and is larger at 124.6 MB).
    id: "onnx-distilbert",
    label: "ONNX",
    url: "https://huggingface.co/onnx-community/distilbert-base-uncased-mnli-ONNX",
    overrides: {
      workloadFamily: "text_encoder",
      totalParams: "67",
      parameterUnit: "M",
      precision: "8-bit",
    },
  },
];

/**
 Find the preset the current deployment still exactly matches, if any. A preset
 loads `defaultState()` plus its overrides, so it stays "active" — driving the
 highlighted chip and the header model link — only until any input diverges
 from that loaded deployment.
@param state - normalized calculator state
@returns the matching preset, or undefined when no preset matches
*/
export function activePreset(
  state: Readonly<FormState>,
): ModelPreset | undefined {
  return MODEL_PRESETS.find((preset) => {
    const applied = normalizedState(
      searchFromState({ ...defaultState(), ...preset.overrides }),
    );
    const appliedValues = new Map<string, string | boolean>(
      Object.entries(applied),
    );
    return Object.entries(state).every(([key, live]) => {
      const value = appliedValues.get(key);
      // An unset numeric has two spellings: searchFromState drops the empty
      // default (normalizing to ""), while the live form submits the empty
      // input, which normalizes to "0". Both mean "not provided".
      return live === value || (live === "0" && value === "");
    });
  });
}
