import { describe, expect, test } from "vitest";
import { buildReport } from "./report";
import { defaultState } from "./state";
import { whyText } from "./result-format";
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
