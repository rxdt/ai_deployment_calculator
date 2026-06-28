import { describe, expect, test } from "vitest";
import {
  GPU_TIERS,
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
      8, 12, 16, 24, 48, 80, 141, 160, 180, 320,
    ]);
  });

  test("formats the full recommendation with required memory and math", () => {
    expect(hardwareRecommendation(20.4, 0.85)).toEqual({
      requiredMemory: "20.4 GB",
      usableVramTarget: "85%",
      minimumRawVram: "24.0 GB",
      recommendedTier:
        "24 GB physical VRAM: RTX 3090, RTX 4090, or RTX 4500 Ada",
      math: "Estimated workload memory is 20.4 GB. With a 85% usable VRAM target, use a GPU with at least 24.0 GB of physical VRAM so the workload does not consume the entire card.",
    });
  });

  test("labels deployments beyond the hardware table", () => {
    expect(hardwareRecommendation(400, 0.8).recommendedTier).toBe(
      "> 320 GB physical VRAM: multi-node, larger GPU pool, or heavy offload",
    );
  });
});
