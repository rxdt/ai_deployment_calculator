import { describe, expect, test } from "vitest";
import {
  GPU_TIERS,
  cloudCost,
  formatGb,
  hardwareRecommendation,
  minimumRawVramGb,
  recommendedTier,
} from "./hardware";

describe("hardware recommendation math", () => {
  test("computes minimum raw VRAM from usable utilization target", () => {
    expect(minimumRawVramGb(20.4, 0.85)).toBeCloseTo(24);
    expect(formatGb(24)).toBe("24.0 GB");
  });

  test("chooses the smallest tier that satisfies raw VRAM", () => {
    expect(recommendedTier(24)?.vramGb).toBe(24);
    expect(recommendedTier(24.1)?.vramGb).toBe(48);
    expect(recommendedTier(321)).toBeNull();
    expect(GPU_TIERS.map((tier) => tier.vramGb)).toEqual([
      8, 12, 16, 24, 48, 80, 160, 320,
    ]);
  });

  test("formats the full recommendation with required memory and math", () => {
    expect(hardwareRecommendation(20.4, 0.85)).toEqual({
      requiredMemory: "20.4 GB",
      usableVramTarget: "85%",
      minimumRawVram: "24.0 GB",
      recommendedTier:
        "24 GB: High-end consumer GPU class, e.g. RTX 3090 / RTX 4090",
      math: "20.4 GB / 85% = 24.0 GB raw VRAM",
    });
  });

  test("labels deployments beyond the tier table and prices cloud estimates", () => {
    expect(hardwareRecommendation(400, 0.8).recommendedTier).toBe(
      "> 320 GB: Distributed multi-node or heavy offload",
    );
    expect(cloudCost(20.4, 0.85, "")).toContain("$1.00/hr static estimate");
    expect(cloudCost(20.4, 0.85, "3.5")).toContain("$3.50/hr static estimate");
    expect(cloudCost(400, 0.8, "bad")).toContain("$20.00/hr static estimate");
  });
});
