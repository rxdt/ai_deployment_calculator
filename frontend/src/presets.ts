import type { FormState } from "./types";

export interface ModelPreset {
  readonly id: string;
  readonly label: string;
  readonly overrides: Partial<FormState>;
}

/**
 One-click starting points for widely deployed open models, in the order the
 design's preset row lists them. Each preset names a real model and carries only
 the inputs that differ from the seed deployment; the calculator applies them
 over `defaultState()`, so unspecified fields (context window, runtime profile,
 ...) keep their defaults.

 Parameter counts are the models' published totals. Mixtral is a mixture of
 experts, so it also carries the MoE flag and its active-parameter count, which
 drive a materially different estimate than a dense 47B model. SDXL is an
 image-diffusion model, so it switches the workload family away from
 text-generation and drives the image-generation branch of the estimate.
*/
export const MODEL_PRESETS: readonly ModelPreset[] = [
  {
    id: "llama-8b",
    label: "Llama 8B",
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
    overrides: {
      workloadFamily: "text_generation",
      totalParams: "70",
      parameterUnit: "B",
      precision: "16-bit",
    },
  },
  {
    id: "mixtral-8x7b",
    label: "Mixtral",
    overrides: {
      workloadFamily: "text_generation",
      totalParams: "46.7",
      parameterUnit: "B",
      precision: "16-bit",
      moeEnabled: true,
      activeParams: "12.9",
    },
  },
  {
    id: "gemma-9b",
    label: "Gemma",
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
    overrides: {
      workloadFamily: "image_diffusion",
      totalParams: "3.5",
      parameterUnit: "B",
      precision: "16-bit",
    },
  },
];
