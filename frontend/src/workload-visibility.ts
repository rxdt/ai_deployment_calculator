import type { FormState, WorkloadFamily } from "./types";

const DECODER_KV_FAMILIES = new Set<WorkloadFamily>([
  "text_generation",
  "encoder_decoder",
  "vision_language",
]);

/**
Returns whether the current workload exposes inference decoder KV cache options.
@param state - normalized form state
*/
export function hasDecoderKvCache(
  state: Pick<FormState, "executionMode" | "workloadFamily">,
): boolean {
  return (
    state.executionMode === "Inference" &&
    DECODER_KV_FAMILIES.has(state.workloadFamily)
  );
}
