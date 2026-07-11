import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  PRECISION_MAP,
  roundTo,
  specFromState,
  weightsGb,
} from "./calculator-core";
import { hardware, hardwareRecommendation } from "./hardware";
import { defaultState } from "./state";
import type { FormState, KvPrecision, Precision } from "./types";
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

// Ordered from fewest to most KV bytes (1, 2, 4). Decoder KV memory must not decrease
// along this order.
const KV_PRECISION_BY_ASCENDING_BYTES: readonly KvPrecision[] = [
  "8-bit / FP8",
  "16-bit",
  "32-bit",
];

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

  test("text-generation required memory does not decrease as context length grows", () => {
    // Guards decoder KV: it scales linearly with context tokens, so a longer context can
    // never lower the estimate.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2_000_000 }),
        fc.integer({ min: 0, max: 2_000_000 }),
        (left, right) => {
          const low = Math.min(left, right);
          const high = Math.max(left, right);

          expect(
            requiredGb({
              workloadFamily: "text_generation",
              contextTokens: high.toString(),
            }),
          ).toBeGreaterThanOrEqual(
            requiredGb({
              workloadFamily: "text_generation",
              contextTokens: low.toString(),
            }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  test("text-generation required memory does not decrease as concurrency grows", () => {
    // Guards decoder KV: it scales linearly with concurrent requests, so more concurrency
    // can never lower the estimate.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1024 }),
        fc.integer({ min: 1, max: 1024 }),
        (left, right) => {
          const low = Math.min(left, right);
          const high = Math.max(left, right);

          expect(
            requiredGb({
              workloadFamily: "text_generation",
              workloadSize: high.toString(),
            }),
          ).toBeGreaterThanOrEqual(
            requiredGb({
              workloadFamily: "text_generation",
              workloadSize: low.toString(),
            }),
          );
        },
      ),
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

        // Strictly increasing == ascending order with no duplicates. Expressed via
        // whole-array comparison to avoid an unchecked index access
        // (noUncheckedIndexedAccess) and the banned reduce/index-loop patterns.
        expect(memories).toStrictEqual([...memories].sort((a, b) => a - b));
        expect(new Set(memories).size).toBe(memories.length);
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

  test("text-generation required memory does not decrease as KV precision keeps more bytes", () => {
    // Non-negotiable Research Correction: the decoder KV cache must scale with KV precision.
    // Wider KV bytes can only raise the estimate, never lower it. Guards the kvBytes factor
    // against sign/scale regressions alongside the context and concurrency guards above.
    fc.assert(
      fc.property(positiveParameterCount, (totalParameters) => {
        const memories = KV_PRECISION_BY_ASCENDING_BYTES.map(
          (kvCachePrecision) =>
            requiredGb({
              workloadFamily: "text_generation",
              totalParams: totalParameters,
              kvCachePrecision,
            }),
        );

        // Non-decreasing == already in ascending order. Whole-array comparison avoids
        // an unchecked index access (noUncheckedIndexedAccess) and the banned
        // reduce/index-loop patterns; ties are allowed (no distinctness check).
        expect(memories).toStrictEqual([...memories].sort((a, b) => a - b));
      }),
      { numRuns: 100 },
    );
  });

  test("text-encoder required memory is identical across every KV precision", () => {
    // Non-negotiable Research Correction: encoder models have no persistent generation KV
    // cache, so KV precision must not move their estimate at all. A nonzero spread here would
    // mean a KV term leaked into an encoder path.
    fc.assert(
      fc.property(positiveParameterCount, (totalParameters) => {
        const memories = KV_PRECISION_BY_ASCENDING_BYTES.map(
          (kvCachePrecision) =>
            requiredGb({
              workloadFamily: "text_encoder",
              totalParams: totalParameters,
              kvCachePrecision,
            }),
        );

        expect(new Set(memories).size).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  test("QLoRA weight memory is the frozen 4-bit base regardless of the precision control", () => {
    // Non-negotiable Research Correction: QLoRA freezes a 4-bit base plus adapters. Weight
    // memory must track the 4-bit base scaled by parameter count, never a flat 4 GB overhead
    // and never the selected inference precision.
    fc.assert(
      fc.property(
        positiveParameterCount,
        anyPrecision,
        (totalParameters, precision) => {
          const expected =
            Number(totalParameters) *
            PRECISION_MAP["4-bit"].weightBytes *
            PRECISION_MAP["4-bit"].weightOverhead;

          expect(
            weightMemoryGb({
              workloadFamily: "text_generation",
              executionMode: "QLoRA fine-tuning",
              totalParams: totalParameters,
              precision,
            }),
          ).toBeCloseTo(expected, 6);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("full training requires strictly more memory than adapter fine-tuning of the same model", () => {
    // Non-negotiable Research Corrections: LoRA/QLoRA train adapters, not all base weights,
    // and full training additionally carries master weights, gradients, and optimizer state
    // over every parameter. Full training must therefore dominate both adapter modes.
    fc.assert(
      fc.property(
        positiveParameterCount,
        anyPrecision,
        (totalParameters, precision) => {
          const base = {
            workloadFamily: "text_generation" as const,
            totalParams: totalParameters,
            precision,
          };
          const full = requiredGb({
            ...base,
            executionMode: "Full training",
          });

          expect(full).toBeGreaterThan(
            requiredGb({ ...base, executionMode: "LoRA fine-tuning" }),
          );
          expect(full).toBeGreaterThan(
            requiredGb({ ...base, executionMode: "QLoRA fine-tuning" }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  test("full training reports a buffered four-part total, never the bare Total_Params_B * 16 shortcut", () => {
    // Non-negotiable Research Correction: `Full_Training_GB = Total_Params_B * 16` is only a
    // rough parameter-state shortcut and "still misses activations, runtime overhead, and
    // buffer". It is the one "Do Not Restore" formula lacking a generalized guard (the 152.9
    // canonical case pins a single 7B/16-bit point). Pin across every precision that full
    // training (a) carries each omitted term as a strictly positive component, (b) reports the
    // buffered sum of exactly those components, and therefore (c) strictly exceeds the shortcut.
    // The optimizer is pinned to AdamW (8 optimizer bytes) so the strict inequality holds even for
    // the thinnest 4-bit weights.
    fc.assert(
      fc.property(
        positiveParameterCount,
        anyPrecision,
        (totalParameters, precision) => {
          const breakdown = memoryBreakdown(
            specFromState({
              ...defaultState(),
              workloadFamily: "text_generation",
              executionMode: "Full training",
              optimizer: "AdamW",
              totalParams: totalParameters,
              precision,
            }),
          );

          // The three terms the shortcut drops are each present, plus the parameter state.
          expect(breakdown.trainingStateGb).toBeGreaterThan(0);
          expect(breakdown.inputActivationGb).toBeGreaterThan(0);
          expect(breakdown.runtimeOverheadGb).toBeGreaterThan(0);
          expect(breakdown.safetyBufferGb).toBeGreaterThan(0);

          // The reported total is the training-buffered (1.25) sum of exactly those components...
          const subtotal =
            breakdown.weightsGb +
            breakdown.kvCacheGb +
            breakdown.inputActivationGb +
            breakdown.trainingStateGb +
            breakdown.runtimeOverheadGb;
          expect(breakdown.requiredGb).toBeCloseTo(
            roundTo(subtotal * 1.25, 1),
            6,
          );

          // ...and therefore strictly above the bare parameter-state shortcut it must not restore.
          expect(breakdown.requiredGb).toBeGreaterThan(
            Number(totalParameters) * 16,
          );
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

  test("the recommended tier always shows non-negative fit headroom, as the spec guarantees by construction", () => {
    // Spec: "For the recommended tier Fit_Headroom_GB >= 0 by construction." The chosen tier is
    // the smallest whose VRAM >= required / utilization, so re-applying that same utilization
    // must still cover the requirement. Guards the end-to-end recommendation path (tier pick +
    // utilization multiply + formatting), including that the margin never renders as "-0.0 GB"
    // from a `(required / u) * u` floating-point undershoot. Utilization is drawn from the only
    // three runtime targets (0.80 / 0.85 / 0.90).
    fc.assert(
      fc.property(
        fc.float({
          min: Math.fround(0.1),
          max: Math.fround(400),
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.constantFrom(0.8, 0.85, 0.9),
        fc.boolean(),
        (estimatedRequiredGb, utilization, allowSharding) => {
          const recommendation = hardwareRecommendation(
            roundTo(estimatedRequiredGb, 1),
            utilization,
            { allowSharding },
          );

          if (recommendation.fitHeadroom === "n/a") {
            return; // Overflow or empty workload: no recommended tier to bound.
          }
          const headroom = Number(recommendation.fitHeadroom.split(" ", 1)[0]);
          expect(headroom).toBeGreaterThanOrEqual(0);
          expect(recommendation.fitHeadroom.startsWith("-")).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
