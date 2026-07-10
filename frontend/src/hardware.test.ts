import { describe, expect, test } from "vitest";
import {
  HARDWARE_TIERS,
  describeOverflow,
  estimateSpeed,
  formatGb,
  hardware,
  hardwareRecommendation,
  minimumRawVramGb,
  speedLabel,
  speedTierFor,
  type HardwareTier,
} from "./hardware";

const tier = (vramGb: number): HardwareTier => {
  const match = HARDWARE_TIERS.find((candidate) => candidate.vramGb === vramGb);
  if (match === undefined) {
    throw new Error(`no tier ${vramGb.toString()}`);
  }
  return match;
};

describe("canonical hardware table", () => {
  test("exposes one ascending VRAM ladder with H200 and B200 rows", () => {
    expect(HARDWARE_TIERS.map((row) => row.vramGb)).toEqual([
      8, 12, 16, 24, 48, 80, 141, 160, 180, 320,
    ]);
    expect(tier(141).examples).toBe("H200 class");
    expect(tier(180).examples).toBe("B200 class");
  });

  test("only the 160 and 320 aggregate tiers require sharding", () => {
    expect(
      HARDWARE_TIERS.filter((row) => row.requiresSharding).map(
        (row) => row.vramGb,
      ),
    ).toEqual([160, 320]);
    expect(tier(141).kind).toBe("single_gpu");
    expect(tier(180).kind).toBe("single_gpu");
    expect(tier(160).kind).toBe("aggregate_sharded");
    expect(tier(160).gpuCount).toBe(2);
    expect(tier(320).gpuCount).toBe(4);
  });

  test("computes minimum raw VRAM from the usable utilization target", () => {
    expect(minimumRawVramGb(20.4, 0.85)).toBeCloseTo(24);
    expect(formatGb(24)).toBe("24.0 GB");
  });
});

describe("matching required VRAM to a hardware tier", () => {
  test("picks the smallest single-GPU tier when sharding is off", () => {
    expect(hardware(24, { allowSharding: false })).toBe(tier(24));
    expect(hardware(24.1, { allowSharding: false })).toBe(tier(48));
    expect(hardware(92.9, { allowSharding: false })).toBe(tier(141));
    // 150 GB raw skips the 160 sharded tier and lands on the 180 B200.
    expect(hardware(150, { allowSharding: false })).toBe(tier(180));
  });

  test("never recommends sharded tiers when sharding is off", () => {
    // Between 180 and 320 the only fits are sharded, so it overflows.
    expect(hardware(200, { allowSharding: false })).toBe("overflow");
    expect(hardware(321, { allowSharding: false })).toBe("overflow");
  });

  test("allows sharded aggregate tiers when sharding is on", () => {
    expect(hardware(150, { allowSharding: true })).toBe(tier(160));
    expect(hardware(200, { allowSharding: true })).toBe(tier(320));
    expect(hardware(321, { allowSharding: true })).toBe("overflow");
  });

  test("describes overflow distinctly for sharding-off vs beyond-table", () => {
    expect(describeOverflow(200)).toBe(
      "No single-GPU fit. Enable memory sharding or use offload.",
    );
    expect(describeOverflow(321)).toBe(
      "> 320 GB: distributed multi-node, larger GPU pool, or heavy offload",
    );
  });

  test("names the fitting sharded tier when one is supplied", () => {
    expect(describeOverflow(200, tier(320))).toBe(
      "No single-GPU fit. Enable memory sharding to fit a 320 GB sharded datacenter class (4x 80 GB GPUs with tensor/model parallelism), or use offload.",
    );
    // Beyond the whole table, no sharded tier helps, so the hint is ignored.
    expect(describeOverflow(321, tier(320))).toBe(
      "> 320 GB: distributed multi-node, larger GPU pool, or heavy offload",
    );
  });
});

describe("speed bandwidth comes from the matched tier", () => {
  test("estimateSpeed divides tier bandwidth by compute weight", () => {
    expect(
      estimateSpeed({ computeWeightGb: 16, recommendedTier: tier(24) }),
    ).toBe(936 / 16);
    expect(
      estimateSpeed({ computeWeightGb: 6.9, recommendedTier: tier(141) }),
    ).toBeCloseTo(4800 / 6.9);
    expect(
      estimateSpeed({ computeWeightGb: 0, recommendedTier: tier(24) }),
    ).toBe(0);
  });

  test("speedTierFor falls back to the top tier on overflow", () => {
    expect(speedTierFor("overflow").vramGb).toBe(320);
    expect(speedTierFor(tier(80))).toBe(tier(80));
  });

  test("speedLabel flags the sharding assumption only for sharded tiers", () => {
    expect(speedLabel(tier(160))).toContain("sharded");
    expect(speedLabel(tier(80))).not.toContain("sharded");
  });
});

describe("hardwareRecommendation display", () => {
  test("formats a single-GPU recommendation with generic label plus examples", () => {
    expect(
      hardwareRecommendation(20.4, 0.85, { allowSharding: false }),
    ).toEqual({
      requiredMemory: "20.4 GB",
      usableVramTarget: "85%",
      usableVramOnClass: "20.4 GB",
      fitHeadroom: "0.0 GB usable margin",
      minimumRawVram: "24.0 GB",
      recommendedTier:
        "24 GB high-end consumer class, e.g. RTX 3090 / RTX 4090 class",
      math: "Estimated workload memory is 20.4 GB. With a 85% usable VRAM target, use a GPU with at least 24.0 GB of physical VRAM so the workload does not consume the entire card.",
    });
  });

  test("reports usable VRAM and positive fit headroom on the recommended class", () => {
    // 8B server default: required 21.3, tier 48, usable 48 * 0.85 = 40.8.
    const recommendation = hardwareRecommendation(21.3, 0.85, {
      allowSharding: false,
    });
    expect(recommendation.recommendedTier).toContain(
      "48 GB workstation / pro inference class",
    );
    expect(recommendation.usableVramOnClass).toBe("40.8 GB");
    expect(recommendation.fitHeadroom).toBe("19.5 GB usable margin");
  });

  test("reports overflow with no usable-class or headroom values", () => {
    const recommendation = hardwareRecommendation(400, 0.8, {
      allowSharding: true,
    });
    expect(recommendation.recommendedTier).toBe(
      "> 320 GB: distributed multi-node, larger GPU pool, or heavy offload",
    );
    expect(recommendation.usableVramOnClass).toBe("n/a");
    expect(recommendation.fitHeadroom).toBe("n/a");
  });

  test("points a sharding-off single-GPU overflow at the tier that would fit", () => {
    // 200 GB required at 80% target -> 250 GB minimum: no single GPU fits, but a
    // sharded tier does, so the guidance names it instead of dead-ending.
    const recommendation = hardwareRecommendation(200, 0.8, {
      allowSharding: false,
    });
    expect(recommendation.minimumRawVram).toBe("250.0 GB");
    expect(recommendation.recommendedTier).toBe(
      "No single-GPU fit. Enable memory sharding to fit a 320 GB sharded datacenter class (4x 80 GB GPUs with tensor/model parallelism), or use offload.",
    );
    expect(recommendation.usableVramOnClass).toBe("n/a");
    expect(recommendation.fitHeadroom).toBe("n/a");
  });

  test("handles the empty workload with a no-model recommendation", () => {
    expect(hardwareRecommendation(0, 0.85, { allowSharding: false })).toEqual({
      requiredMemory: "0.0 GB",
      usableVramTarget: "85%",
      usableVramOnClass: "n/a",
      fitHeadroom: "n/a",
      minimumRawVram: "0.0 GB",
      recommendedTier: "No model loaded",
      math: "Estimated workload memory is 0.0 GB. Enter model and workload inputs above 0 to size GPU VRAM.",
    });
  });
});
