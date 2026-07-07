import type { FormState, WorkloadFamily } from "./types";

const DECODER_KV_FAMILIES = new Set<WorkloadFamily>([
  "text_generation",
  "encoder_decoder",
  "vision_language",
]);

const MOE_FAMILIES = new Set<WorkloadFamily>([
  "text_generation",
  "text_encoder",
  "encoder_decoder",
  "vision_language",
  "custom",
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

/**
Returns whether the current workload exposes MoE controls.
@param family - selected workload family
*/
export function hasMoeControl(family: WorkloadFamily): boolean {
  return MOE_FAMILIES.has(family);
}
