import type { WorkloadFamily } from "./types";

// Pipeline-specific or open-ended families whose memory is a coarser guess.
// Diffusion/video are pipeline-specific; custom/unknown has no fixed model.
const ROUGH_FAMILIES = new Set<WorkloadFamily>([
  "image_diffusion",
  "video_generation",
  "custom",
]);

/**
Returns the always-visible confidence label for a workload family.
Diffusion, video, and custom workloads report `Rough`; architecture-based
families report `Estimated`.
@param family - selected workload family
*/
export function confidenceLabel(family: WorkloadFamily): string {
  return ROUGH_FAMILIES.has(family) ? "Rough" : "Estimated";
}
