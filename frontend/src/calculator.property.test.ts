import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { specFromState } from "./calculator-core";
import { hardware } from "./hardware";
import { defaultState } from "./state";
import type { FormState } from "./types";
import { memoryBreakdown } from "./workload-memory";

const finiteParameterCount = fc
  .float({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true })
  .map((value) => value.toString());

/**
 
@param overrides
*/
function requiredGb(overrides: Partial<FormState>): number {
  return memoryBreakdown(specFromState({ ...defaultState(), ...overrides }))
    .requiredGb;
}

describe("calculator properties", () => {
  test("text-generation required memory does not decrease as parameter count increases", () => {
    fc.assert(
      fc.property(finiteParameterCount, finiteParameterCount, (left, right) => {
        const low = Math.min(Number(left), Number(right)).toString();
        const high = Math.max(Number(left), Number(right)).toString();

        expect(
          requiredGb({
            workloadFamily: "text_generation",
            totalParams: high,
          }),
        ).toBeGreaterThanOrEqual(
          requiredGb({
            workloadFamily: "text_generation",
            totalParams: low,
          }),
        );
      }),
      { numRuns: 100 },
    );
  });

  test("recommended hardware tiers are never below the required raw VRAM", () => {
    fc.assert(
      fc.property(
        fc.float({
          min: Math.fround(0.1),
          max: Math.fround(400),
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.boolean(),
        (rawVramGb, allowSharding) => {
          const tier = hardware(rawVramGb, { allowSharding });

          if (tier !== "overflow") {
            expect(tier.vramGb).toBeGreaterThanOrEqual(rawVramGb);
            expect(allowSharding || !tier.requiresSharding).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
