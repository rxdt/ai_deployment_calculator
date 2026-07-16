import { describe, expect, test } from "vitest";
import { buildReport } from "./report";
import { defaultState } from "./state";
import { fitMeter, whyText } from "./result-format";
import type { FormState, HardwareRecommendation } from "./types";

/**
Build a form state that preserves production defaults while narrowing each test
to the fields that create the recommendation under inspection.
@param overrides - fields to override from the default calculator state
@returns a complete form state
*/
function state(overrides: Partial<FormState> = {}): FormState {
  return { ...defaultState(), ...overrides };
}

describe("whyText", () => {
  test("describes sharded recommendations as an aggregate GPU pool", () => {
    const report = buildReport(
      state({
        totalParams: "62",
        precision: "16-bit",
        runtimeProfile: "Local / Edge",
        memoryShardingEnabled: true,
      }),
    );

    const why = whyText(report);

    expect(why).toContain("requires a sharded GPU pool");
    expect(why).toContain("aggregate advertised VRAM");
    expect(why).toContain("The next common sharded class is 160 GB.");
    expect(why).not.toContain("requires a GPU with");
  });

  test("keeps single-accelerator recommendations hardware-neutral", () => {
    const report = buildReport(state({ totalParams: "8" }));

    expect(whyText(report)).toBe(
      "At an 85% usable memory target, 21.0 GB requires hardware with at least 24.7 GB accelerator memory. The hardware tier has capacity 32 GB.",
    );
  });

  test("notes the Local / Edge OS reserve so the higher advertised need reads", () => {
    const report = buildReport(state({ runtimeProfile: "Local / Edge" }));

    expect(whyText(report, "Local / Edge")).toContain(
      "local GPU memory stays reserved",
    );
    expect(whyText(report, "Server / Cloud")).not.toContain(
      "local GPU memory stays reserved",
    );
  });
});

describe("fitMeter", () => {
  test("measures usage against the class's usable VRAM and names that budget", () => {
    const report = buildReport(state());
    const meter = fitMeter(report.recommendedHardware);

    if (meter === null) {
      throw new Error("Expected a fit meter for the default workload");
    }
    expect(meter.capacity).toBe("20.4 GB usable of 24 GB");
    expect(meter.fillPercent).toBe(92);
    // 92% is under the 95% tight threshold: the padded estimate fitting its
    // usable budget reads as a comfortable fit, not a warning.
    expect(meter.isTight).toBe(false);
    expect(meter.summary).toBe(
      "Fits on one 24 GB card: 18.8 GB uses 92% of its 20.4 GB usable VRAM.",
    );
  });

  test("flags a near-budget fit as tight and leads the caption with it", () => {
    // 16B at 16-bit needs 38.8 GB and the smallest fitting class offers 40.8 GB
    // usable, consuming 95% of the budget with 2.0 GB spare.
    const report = buildReport(state({ totalParams: "16" }));
    const meter = fitMeter(report.recommendedHardware);

    if (meter === null) {
      throw new Error("Expected a fit meter for a near-budget workload");
    }
    expect(meter.fillPercent).toBe(95);
    expect(meter.isTight).toBe(true);
    expect(meter.summary).toBe(
      "Tight fit on one 48 GB card: 38.9 GB uses 95% of its 40.8 GB usable VRAM.",
    );
  });

  test("keeps the meter fill within the recommended class budget", () => {
    const report = buildReport(state({ totalParams: "8" }));
    const meter = fitMeter(report.recommendedHardware);

    if (meter === null) {
      throw new Error("Expected a fit meter for an 8B workload");
    }
    // The recommended class is always at least the required budget, so the bar
    // never overflows and its spare complement stays non-negative.
    expect(meter.fillPercent).toBeGreaterThan(0);
    expect(meter.fillPercent).toBeLessThanOrEqual(100);
    expect(meter.summary).toContain("32 GB card");
    expect(meter.summary).toContain("usable VRAM.");
  });

  test("names a sharded pool instead of a single card when sharding fits", () => {
    const report = buildReport(
      state({
        totalParams: "62",
        precision: "16-bit",
        runtimeProfile: "Local / Edge",
        memoryShardingEnabled: true,
      }),
    );
    const meter = fitMeter(report.recommendedHardware);

    if (meter === null) {
      throw new Error("Expected a fit meter for a sharded recommendation");
    }
    expect(meter.summary).toContain("sharded pool");
    expect(meter.summary).not.toContain(" card");
    // The scale row still frames the pool's usable share of its aggregate.
    expect(meter.capacity).toMatch(/^\d+(?:\.\d)? GB usable of \d+ GB$/u);
  });

  test("names an Apple-only tier as a system, not a card", () => {
    const meter = fitMeter({
      requiredMemory: "30.0 GB",
      usableVramTarget: "85%",
      usableVramOnClass: "30.6 GB",
      fitHeadroom: "0.6 GB usable margin",
      minimumRawVram: "35.3 GB",
      recommendedTier:
        "36 GB Apple Silicon class, e.g. Mac Studio M4 Max 36 GB",
      exampleCards: [{ name: "Mac Studio M4 Max 36 GB" }],
      math: "",
    } satisfies HardwareRecommendation);

    if (meter === null) {
      throw new Error("Expected a fit meter for an Apple Silicon tier");
    }
    expect(meter.summary).toBe(
      "Tight fit on one 36 GB system: 30.0 GB uses 98% of its 30.6 GB usable VRAM.",
    );
  });

  test("has no meter to show without an estimate at all", () => {
    expect(
      fitMeter(buildReport(state({ totalParams: "0" })).recommendedHardware),
    ).toBeNull();
  });

  test("pegs the meter full and red when no single class fits", () => {
    const meter = fitMeter(
      buildReport(state({ totalParams: "400" })).recommendedHardware,
    );

    if (meter === null) {
      throw new Error("Expected an overflow meter for a 400B workload");
    }
    expect(meter.isOverflow).toBe(true);
    expect(meter.fillPercent).toBe(100);
    expect(meter.isTight).toBe(false);
    // No single-class capacity exists to label the scale row with.
    expect(meter.capacity).toBe("");
    expect(meter.summary).toMatch(
      /^\+100% usage\. The workload needs .* usable VRAM\.$/u,
    );
  });
});
