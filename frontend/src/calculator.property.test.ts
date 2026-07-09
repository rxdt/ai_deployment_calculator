import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { specFromState, weightsGb } from "./calculator-core";
import { hardware } from "./hardware";
import { defaultState } from "./state";
import type { FormState, Precision } from "./types";
import { memoryBreakdown } from "./workload-memory";

const finiteParameterCount = fc
  .float({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true })
  .map((value) => value.toString());

const positiveParameterCount = fc
  .float({
    min: Math.fround(0.1),
    max: 500,
    noNaN: true,
    noDefaultInfinity: true,
  })
  .map((value) => value.toString());

// Ordered from fewest to most effective weight bytes (weightBytes * weightOverhead):
// 0.575, 0.7, 0.825, 1.05, 2, 4. Weight memory must not decrease along this order.
const PRECISION_BY_ASCENDING_WEIGHT: readonly Precision[] = [
  "4-bit",
  "5-bit GGUF",
  "6-bit GGUF",
  "8-bit",
  "16-bit",
  "32-bit",
];

const anyPrecision = fc.constantFrom(...PRECISION_BY_ASCENDING_WEIGHT);

/**

@param overrides
*/
function requiredGb(overrides: Partial<FormState>): number {
  return memoryBreakdown(specFromState({ ...defaultState(), ...overrides }))
    .requiredGb;
}

/**

@param overrides
*/
function weightMemoryGb(overrides: Partial<FormState>): number {
  return weightsGb(specFromState({ ...defaultState(), ...overrides }));
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

  test("enabling MoE never changes resident weight memory or required VRAM at inference", () => {
    // Non-negotiable Research Correction: active parameters affect rough speed only, not
    // resident weight memory, unless expert offload/sharding is enabled (off here).
    fc.assert(
      fc.property(
        positiveParameterCount,
        fc.float({
          min: Math.fround(0.001),
          max: 1,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        anyPrecision,
        (totalParameters, activeFraction, precision) => {
          const activeParameters = (
            Number(totalParameters) * activeFraction
          ).toString();
          const dense = {
            workloadFamily: "text_generation" as const,
            totalParams: totalParameters,
            precision,
            moeEnabled: false,
          };
          const moe = {
            ...dense,
            moeEnabled: true,
            activeParams: activeParameters,
          };

          expect(weightMemoryGb(moe)).toBe(weightMemoryGb(dense));
          expect(requiredGb(moe)).toBe(requiredGb(dense));
        },
      ),
      { numRuns: 100 },
    );
  });

  test("weight memory rises monotonically as precision keeps more bytes", () => {
    // Guards PRECISION_MAP: no lower-bit precision may ever cost more resident memory
    // than a higher-bit one for the same model.
    fc.assert(
      fc.property(positiveParameterCount, (totalParameters) => {
        const memories = PRECISION_BY_ASCENDING_WEIGHT.map((precision) =>
          weightMemoryGb({
            workloadFamily: "text_generation",
            totalParams: totalParameters,
            precision,
          }),
        );

        for (let index = 1; index < memories.length; index += 1) {
          expect(memories[index]).toBeGreaterThan(memories[index - 1]);
        }
      }),
      { numRuns: 100 },
    );
  });

  test("a known model file size overrides parameter- and precision-based weights", () => {
    // Non-negotiable Research Correction: an exact resident file size overrides the
    // parameter estimate; only the GPU resident fraction scales it.
    fc.assert(
      fc.property(
        fc.float({
          min: Math.fround(0.1),
          max: 400,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        positiveParameterCount,
        anyPrecision,
        (knownFileGb, residentFraction, totalParameters, precision) => {
          const memory = weightMemoryGb({
            workloadFamily: "text_generation",
            executionMode: "Inference",
            totalParams: totalParameters,
            precision,
            knownModelFileSizeGb: knownFileGb.toString(),
            gpuResidentFraction: residentFraction.toString(),
          });

          expect(memory).toBeCloseTo(knownFileGb * residentFraction, 6);
        },
      ),
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
