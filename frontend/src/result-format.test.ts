import { describe, expect, test } from "vitest";
import { buildReport } from "./report";
import { defaultState } from "./state";
import { fitMeter, whyText } from "./result-format";
import type { FormState } from "./types";

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

  test("keeps single-GPU recommendations worded as one advertised card", () => {
    const report = buildReport(state({ totalParams: "8" }));

    expect(whyText(report)).toBe(
      "At an 85% usable VRAM target, 21.3 GB requires a GPU with at least 25.1 GB advertised VRAM. The next common class is 48 GB.",
    );
  });
});

describe("fitMeter", () => {
  test("measures single-card usage and summarizes usable headroom", () => {
    const report = buildReport(state());
    const meter = fitMeter(report.recommendedHardware);

    if (meter === null) {
      throw new Error("Expected a fit meter for the default workload");
    }
    expect(meter.fillPercent).toBe(93);
    expect(meter.isTight).toBe(false);
    expect(meter.summary).toBe(
      "Fits a 24 GB card with 1.4 GB usable headroom (7% spare).",
    );
  });

  test("flags a near-budget fit as tight and leads the caption with it", () => {
    // 16B at 16-bit needs 40.1 GB and the smallest fitting class offers 40.8 GB
    // usable, consuming 98% of the budget with only 0.7 GB spare.
    const report = buildReport(state({ totalParams: "16" }));
    const meter = fitMeter(report.recommendedHardware);

    if (meter === null) {
      throw new Error("Expected a fit meter for a near-budget workload");
    }
    expect(meter.fillPercent).toBe(98);
    expect(meter.isTight).toBe(true);
    expect(meter.summary).toBe(
      "Tight fit: 0.7 GB usable headroom on a 48 GB card (2% spare).",
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
    expect(meter.summary).toContain("48 GB card");
    expect(meter.summary).toContain("spare)");
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
    expect(meter.summary).not.toContain("card with");
  });

  test("has no meter to show without a concrete single-class fit", () => {
    expect(
      fitMeter(buildReport(state({ totalParams: "0" })).recommendedHardware),
    ).toBeNull();
    expect(
      fitMeter(buildReport(state({ totalParams: "400" })).recommendedHardware),
    ).toBeNull();
  });
});
