import { describe, expect, test } from "vitest";
import { confidenceLabel } from "./confidence";
import type { WorkloadFamily } from "./types";

describe("always-visible estimate confidence label", () => {
  test("labels pipeline-specific and open-ended families as Rough", () => {
    // Non-negotiable Research Correction: diffusion/video memory is pipeline-specific and
    // lower confidence by default; custom/unknown has no fixed architecture to estimate from.
    const roughFamilies: readonly WorkloadFamily[] = [
      "image_diffusion",
      "video_generation",
      "custom",
    ];

    for (const family of roughFamilies) {
      expect(confidenceLabel(family)).toBe("Rough");
    }
  });

  test("labels architecture-derived families as Estimated", () => {
    // Every transformer-shaped family sizes from an architecture bucket, so it earns the
    // higher Estimated confidence rather than Rough.
    const estimatedFamilies: readonly WorkloadFamily[] = [
      "text_generation",
      "text_encoder",
      "encoder_decoder",
      "vision",
      "vision_language",
      "audio",
      "tabular",
    ];

    for (const family of estimatedFamilies) {
      expect(confidenceLabel(family)).toBe("Estimated");
    }
  });

  test("returns a non-empty label for every workload family", () => {
    // Acceptance criterion: a confidence label is always visible, so no family may map to an
    // empty or missing string.
    const allFamilies: readonly WorkloadFamily[] = [
      "text_generation",
      "text_encoder",
      "encoder_decoder",
      "vision",
      "vision_language",
      "image_diffusion",
      "video_generation",
      "audio",
      "tabular",
      "custom",
    ];

    for (const family of allFamilies) {
      expect(confidenceLabel(family).length).toBeGreaterThan(0);
    }
  });
});
