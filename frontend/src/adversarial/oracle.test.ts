import { describe, expect, test } from "vitest";
import { specFromState, weightsGb } from "../calculator-core";
import { defaultState, normalizedState, searchFromState } from "../state";
import type {
  FormState,
  KvPrecision,
  Precision,
  WorkloadFamily,
} from "../types";
import { memoryBreakdown } from "../workload-memory";

interface PublishedWeightAnchor {
  readonly precision: Precision;
  readonly expectedGb: number;
}

interface ExtremeQuery {
  readonly scenario: string;
  readonly query: string;
}

const PUBLISHED_WEIGHT_ANCHORS: readonly PublishedWeightAnchor[] = [
  { precision: "IQ2_XXS", expectedGb: 1.8025 },
  { precision: "Q4_K_M", expectedGb: 4.24375 },
  { precision: "Q6_K", expectedGb: 5.76625 },
  { precision: "Q8_0", expectedGb: 7.4375 },
  { precision: "16-bit", expectedGb: 14 },
  { precision: "32-bit", expectedGb: 28 },
];

// vLLM's paged-attention KV math for Llama-3-8B (32 transformer layers, 8 GQA
// KV heads, head_dim 128, fp16 KV) footprints one token of context at
// 2 (K+V) * 32 * 8 * 128 * 2 bytes = 131072 bytes = 0.125 MiB. This is an
// EXTERNAL, published per-token figure — not our formula restated — so pinning
// it catches any regression in the 8B architecture bucket's layer/kv-head/
// head-dim geometry or its 16-bit KV byte width, absolutely rather than by
// ordering. MiB is 1024^2 bytes; the calculator reports decimal GB (1e9 bytes).
const LLAMA3_8B_KV_GB_PER_TOKEN = (0.125 * 1024 * 1024) / 1_000_000_000;

const NO_PERSISTENT_KV_FAMILIES: readonly WorkloadFamily[] = [
  "text_encoder",
  "vision",
  "image_diffusion",
  "video_generation",
  "audio",
  "tabular",
  "custom",
];

const KV_PRECISIONS: readonly KvPrecision[] = [
  "8-bit / FP8",
  "16-bit",
  "32-bit",
];

const EXTREME_QUERIES: readonly ExtremeQuery[] = [
  {
    scenario: "small model with million-token context",
    query: "total-params=0.001&context-tokens=1000000&workload-size=2",
  },
  {
    scenario: "global parameter cap with long context",
    query: "total-params=99999999.9&context-tokens=1000000&precision=IQ1_S",
  },
  {
    scenario: "hundred-percent adapter path",
    query:
      "execution-mode=QLoRA+fine-tuning&total-params=70&lora-trainable-percent=100&workload-size=8",
  },
];

/**
Build a form state using the production defaults plus targeted overrides.
@param overrides - fields to change from the default form state
@returns a complete form state
*/
function state(overrides: Partial<FormState> = {}): FormState {
  return { ...defaultState(), ...overrides };
}

/**
Calculate the app's reported required memory for a targeted scenario.
@param overrides - fields to change from the default form state
@returns required memory in decimal GB
*/
function requiredGb(overrides: Partial<FormState>): number {
  return memoryBreakdown(specFromState(state(overrides))).requiredGb;
}

/**
Calculate 8B text-generation KV cache memory for a given context.
@param contextTokens - context window length in tokens
@returns KV cache memory in decimal GB
*/
function llama3EightBTextGenerationKvGb(contextTokens: string): number {
  return memoryBreakdown(
    specFromState(
      state({
        workloadFamily: "text_generation",
        totalParams: "8",
        kvCachePrecision: "16-bit",
        workloadSize: "1",
        contextTokens,
      }),
    ),
  ).kvCacheGb;
}

/**
Normalize a URL query string through the production parser.
@param query - raw URL query without a leading question mark
@returns normalized form state
*/
function stateFromQuery(query: string): FormState {
  return normalizedState(new URLSearchParams(query));
}

/**
Assert a numeric memory component is usable by downstream recommendations.
@param value - memory component in decimal GB
*/
function expectFiniteNonNegative(value: number): void {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(0);
}

/**
List every numeric component in a calculator breakdown.
@param result - memory breakdown from the calculator
@returns memory components in decimal GB
*/
function memoryValues(
  result: ReturnType<typeof memoryBreakdown>,
): readonly number[] {
  return [
    result.weightsGb,
    result.kvCacheGb,
    result.inputActivationGb,
    result.trainingStateGb,
    result.runtimeOverheadGb,
    result.safetyBufferGb,
    result.requiredGb,
  ];
}

describe("adversarial oracle suite", () => {
  test("keeps the confirmed PB-scale URL attack finite and explicit", () => {
    const normalized = stateFromQuery(
      "total-params=2&workload-size=99999999&context-tokens=0",
    );
    const roundTripped = normalizedState(searchFromState(normalized));
    const result = memoryBreakdown(specFromState(roundTripped));

    expect(roundTripped.contextTokens).toBe("0");
    for (const value of memoryValues(result)) {
      expectFiniteNonNegative(value);
    }
    expect(result.kvCacheGb).toBeGreaterThan(2_900_000);
    expect(result.kvCacheGb).toBeLessThan(3_000_000);
    expect(result.requiredGb).toBeGreaterThan(result.kvCacheGb);
  });

  test("matches published resident-weight anchors for real byte-per-weight tiers", () => {
    const observed = PUBLISHED_WEIGHT_ANCHORS.map(({ precision }) =>
      weightsGb(specFromState(state({ totalParams: "7", precision }))),
    );

    for (const [index, anchor] of PUBLISHED_WEIGHT_ANCHORS.entries()) {
      expect(observed[index]).toBeCloseTo(anchor.expectedGb, 6);
    }
    expect(observed).toStrictEqual([...observed].sort((a, b) => a - b));
  });

  test("reproduces vLLM's 0.125 MiB/token KV footprint for Llama-3-8B at 16-bit KV", () => {
    const kv8k = llama3EightBTextGenerationKvGb("8000");
    const kv16k = llama3EightBTextGenerationKvGb("16000");

    // The KV term has zero intercept, so resident KV at 8k equals the anchored
    // per-token cost times the token count...
    expect(kv8k).toBeCloseTo(8000 * LLAMA3_8B_KV_GB_PER_TOKEN, 6);
    // ...and the marginal cost of each extra context token equals the vLLM
    // published anchor exactly, isolated from the constant weight/activation rows.
    expect((kv16k - kv8k) / 8000).toBeCloseTo(LLAMA3_8B_KV_GB_PER_TOKEN, 9);
  });

  test("keeps adapter and full-training modes in physical memory order", () => {
    const base = {
      totalParams: "8",
      loraTrainablePercent: "2",
      optimizer: "AdamW",
      precision: "16-bit",
    } satisfies Partial<FormState>;

    const qlora = requiredGb({
      ...base,
      executionMode: "QLoRA fine-tuning",
    });
    const lora = requiredGb({ ...base, executionMode: "LoRA fine-tuning" });
    const full = requiredGb({ ...base, executionMode: "Full training" });

    expect(qlora).toBeLessThan(lora);
    expect(lora).toBeLessThan(full);
    expect(full).toBeGreaterThan(8 * 16);
  });

  test.each(NO_PERSISTENT_KV_FAMILIES)(
    "does not charge persistent decoder KV for %s workloads",
    (workloadFamily) => {
      for (const kvCachePrecision of KV_PRECISIONS) {
        const result = memoryBreakdown(
          specFromState(
            state({
              workloadFamily,
              contextTokens: "128000",
              kvCachePrecision,
              workloadSize: "3",
            }),
          ),
        );

        expect(result.kvCacheGb).toBe(0);
        expectFiniteNonNegative(result.requiredGb);
      }
    },
  );

  test.each(EXTREME_QUERIES)(
    "keeps normalizer-emittable extremes finite: $scenario",
    ({ query }) => {
      const normalized = stateFromQuery(query);
      const roundTripped = normalizedState(searchFromState(normalized));
      const result = memoryBreakdown(specFromState(roundTripped));

      expect(roundTripped).toEqual(normalized);
      for (const value of memoryValues(result)) {
        expectFiniteNonNegative(value);
      }
    },
  );
});
