import type { FormState } from "./types";

export interface ModelPreset {
  readonly id: string;
  readonly label: string;
  readonly overrides: Partial<FormState>;
}

/**
 One-click starting points for common text-generation deployments. Each preset
 names a widely deployed open model and carries only the inputs that differ from
 the seed deployment; the calculator applies them over `defaultState()`, so
 unspecified fields (context window, runtime profile, ...) keep their defaults.

 Parameter counts are the models' published totals. Mixtral is a mixture of
 experts, so it also carries the MoE flag and its active-parameter count, which
 drive a materially different estimate than a dense 47B model.
*/
export const MODEL_PRESETS: readonly ModelPreset[] = [
  {
    id: "gemma-2b",
    label: "Gemma 2B",
    overrides: {
      workloadFamily: "text_generation",
      totalParams: "2",
      parameterUnit: "B",
      precision: "16-bit",
    },
  },
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
];
