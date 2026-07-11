import { describe, expect, test } from "vitest";
import {
  GPU_LINKS,
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
      8, 12, 16, 20, 24, 32, 36, 48, 64, 80, 95, 96, 141, 160, 180, 192, 320,
    ]);
    expect(tier(32).examples).toEqual([
      { name: "RTX 5090", url: GPU_LINKS.rtx5090 },
      { name: "Radeon PRO W7800", url: GPU_LINKS.w7800 },
      { name: "AWS Inferentia2", url: GPU_LINKS.inf2 },
      { name: "Cloud TPU v6e", url: GPU_LINKS.tpuV6e },
      { name: "Cloud TPU v4", url: GPU_LINKS.tpuV4 },
    ]);
    expect(tier(95).examples).toEqual([
      { name: "Cloud TPU v5p", url: GPU_LINKS.tpuV5p },
    ]);
    expect(tier(96).examples).toEqual([
      { name: "Mac Studio M3 Ultra 96 GB", url: GPU_LINKS.macStudioSpecs },
      {
        name: "NVIDIA RTX PRO 6000 Blackwell",
        url: GPU_LINKS.rtxPro6000Blackwell,
      },
    ]);
    expect(tier(141).examples).toEqual([{ name: "H200", url: GPU_LINKS.h200 }]);
    expect(tier(180).examples).toEqual([{ name: "B200", url: GPU_LINKS.b200 }]);
    expect(tier(192).examples).toEqual([
      { name: "Cloud TPU7x", url: GPU_LINKS.tpu7x },
    ]);
  });

  test("marks example cards linkable only when they have a product page", () => {
    // The 8 GB tier mixes both: the RTX 4060 links to its product page, while
    // the generic "older 8 GB GPUs" descriptor stays name-only for the muted,
    // unlinked render.
    expect(tier(8).examples).toEqual([
      { name: "RTX 4060", url: GPU_LINKS.rtx4060 },
      { name: "older 8 GB GPUs" },
    ]);
    expect(tier(12).examples).toEqual([
      { name: "RTX 3060", url: GPU_LINKS.rtx3060 },
      { name: "RTX 4070", url: GPU_LINKS.rtx4070 },
      { name: "RX 9070 GRE", url: GPU_LINKS.rx9070Gre },
      { name: "RX 6700 XT", url: GPU_LINKS.rx6700Xt },
    ]);
    expect(tier(20).examples).toEqual([
      { name: "RX 7900 XT", url: GPU_LINKS.rx7900Xt },
    ]);
    expect(tier(16).examples).toContainEqual({
      name: "Mac mini M4 16 GB",
      url: GPU_LINKS.macMiniSpecs,
    });
    expect(tier(16).examples).toContainEqual({
      name: "Cloud TPU v5e",
      url: GPU_LINKS.tpuV5e,
    });
    expect(tier(24).examples).toEqual([
      { name: "RTX 4090", url: GPU_LINKS.rtx4090 },
      { name: "RTX 3090", url: GPU_LINKS.rtx3090 },
      { name: "L4", url: GPU_LINKS.l4 },
      { name: "Mac mini M4 24 GB", url: GPU_LINKS.macMiniSpecs },
      { name: "Mac mini M4 Pro 24 GB", url: GPU_LINKS.macMiniSpecs },
    ]);
    // Every 48 GB example now carries a verified product page, so the whole set
    // renders as links.
    expect(tier(48).examples).toEqual([
      { name: "RTX A6000", url: GPU_LINKS.rtxA6000 },
      { name: "RTX 6000 Ada", url: GPU_LINKS.rtx6000Ada },
      { name: "L40S", url: GPU_LINKS.l40s },
      { name: "Mac mini M4 Pro 48 GB", url: GPU_LINKS.macMiniM4Pro48 },
    ]);
    expect(tier(36).examples).toEqual([
      { name: "Mac Studio M4 Max 36 GB", url: GPU_LINKS.macStudioSpecs },
    ]);
    expect(tier(64).examples).toEqual([
      { name: "Mac Studio M4 Max 64 GB", url: GPU_LINKS.macStudioSpecs },
      { name: "AMD Instinct MI210", url: GPU_LINKS.mi210 },
    ]);
    expect(tier(96).examples).toEqual([
      { name: "Mac Studio M3 Ultra 96 GB", url: GPU_LINKS.macStudioSpecs },
      {
        name: "NVIDIA RTX PRO 6000 Blackwell",
        url: GPU_LINKS.rtxPro6000Blackwell,
      },
    ]);
    // Sharded aggregate tiers are several GPUs, not one SKU, so they stay
    // name-only rather than linking a card that does not exist.
    expect(tier(160).examples).toEqual([
      { name: "2x 80 GB GPUs with tensor/model parallelism" },
    ]);
  });

  test("links every named data-center SKU to an NVIDIA reference page", () => {
    // The B200 links to the DGX B200 system page; the H800 is a
    // region-specific Hopper variant, so it links to the H100 reference page.
    expect(tier(180).examples).toEqual([{ name: "B200", url: GPU_LINKS.b200 }]);
    expect(tier(80).examples).toContainEqual({
      name: "H800",
      url: GPU_LINKS.h100,
    });
  });

  test("only the 160 and 320 aggregate tiers require sharding", () => {
    expect(
      HARDWARE_TIERS.filter((row) => row.requiresSharding).map(
        (row) => row.vramGb,
      ),
    ).toEqual([160, 320]);
    expect(tier(141).requiresSharding).toBe(false);
    expect(tier(180).requiresSharding).toBe(false);
  });

  test("computes minimum raw VRAM from the usable utilization target", () => {
    expect(minimumRawVramGb(20.4, 0.85)).toBeCloseTo(24);
    expect(formatGb(24)).toBe("24.0 GB");
  });
});

describe("matching required VRAM to a hardware tier", () => {
  test("picks the smallest single-GPU tier when sharding is off", () => {
    expect(hardware(24, { allowSharding: false })).toBe(tier(24));
    expect(hardware(16.1, { allowSharding: false })).toBe(tier(20));
    expect(hardware(20.1, { allowSharding: false })).toBe(tier(24));
    expect(hardware(24.1, { allowSharding: false })).toBe(tier(32));
    expect(hardware(32.1, { allowSharding: false })).toBe(tier(36));
    expect(hardware(36.1, { allowSharding: false })).toBe(tier(48));
    expect(hardware(48.1, { allowSharding: false })).toBe(tier(64));
    expect(hardware(64.1, { allowSharding: false })).toBe(tier(80));
    expect(hardware(92.9, { allowSharding: false })).toBe(tier(95));
    expect(hardware(95.1, { allowSharding: false })).toBe(tier(96));
    expect(hardware(96.1, { allowSharding: false })).toBe(tier(141));
    // 150 GB raw skips the 160 sharded tier and lands on the 180 B200.
    expect(hardware(150, { allowSharding: false })).toBe(tier(180));
    expect(hardware(181, { allowSharding: false })).toBe(tier(192));
  });

  test("never recommends sharded tiers when sharding is off", () => {
    // Between 192 and 320 the only fits are sharded, so it overflows.
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
      "No single-accelerator fit. Enable memory sharding to split the model across multiple GPUs, or offload part of it to CPU memory (slower).",
    );
    expect(describeOverflow(321)).toBe(
      "> 320 GB: distributed multi-node, larger GPU pool, or heavy offload",
    );
  });

  test("names the fitting sharded tier when one is supplied", () => {
    expect(describeOverflow(200, tier(320))).toBe(
      "No single-accelerator fit. Enable memory sharding to split the model across a 320 GB sharded datacenter class (4x 80 GB GPUs with tensor/model parallelism), the smallest standard pool that covers this estimate. Slower alternative: offload part of the model to CPU memory.",
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
        "24 GB high-end consumer class, e.g. RTX 4090 / RTX 3090 / L4 / Mac mini M4 24 GB / Mac mini M4 Pro 24 GB",
      exampleCards: [
        {
          name: "RTX 4090",
          url: GPU_LINKS.rtx4090,
        },
        {
          name: "RTX 3090",
          url: GPU_LINKS.rtx3090,
        },
        {
          name: "L4",
          url: GPU_LINKS.l4,
        },
        {
          name: "Mac mini M4 24 GB",
          url: GPU_LINKS.macMiniSpecs,
        },
        {
          name: "Mac mini M4 Pro 24 GB",
          url: GPU_LINKS.macMiniSpecs,
        },
      ],
      math: "Estimated workload memory is 20.4 GB. With a 85% usable memory target, use hardware with at least 24.0 GB of accelerator memory so the workload does not consume the entire device.",
    });
  });

  test("reports usable VRAM and positive fit headroom on the recommended class", () => {
    // 8B server default: required 21.3, tier 32, usable 32 * 0.85 = 27.2.
    const recommendation = hardwareRecommendation(21.3, 0.85, {
      allowSharding: false,
    });
    expect(recommendation.recommendedTier).toContain(
      "32 GB high-end consumer class",
    );
    expect(recommendation.usableVramOnClass).toBe("27.2 GB");
    expect(recommendation.fitHeadroom).toBe("5.9 GB usable margin");
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
      "No single-accelerator fit. Enable memory sharding to split the model across a 320 GB sharded datacenter class (4x 80 GB GPUs with tensor/model parallelism), the smallest standard pool that covers this estimate. Slower alternative: offload part of the model to CPU memory.",
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
      exampleCards: [],
      math: "Estimated workload memory is 0.0 GB. Enter model and workload inputs above 0 to size accelerator memory.",
    });
  });

  test("carries no example cards for an overflow recommendation", () => {
    const recommendation = hardwareRecommendation(400, 0.8, {
      allowSharding: true,
    });
    expect(recommendation.exampleCards).toEqual([]);
  });
});
