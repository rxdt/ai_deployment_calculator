import { describe, expect, test } from "vitest";
import type { CalculationSpec } from "./calculator-core";
import {
  PRECISION_MAP,
  architectureFor,
  roundTo,
  runtimeAssumptions,
  specFromState,
  trainingActivationGb,
  trainingStateGb,
  weightsGb,
} from "./calculator-core";
import { HARDWARE_TIERS, type HardwareTier } from "./hardware";
import { defaultState } from "./state";
import type { FormState, WorkloadFamily } from "./types";
import {
  inferenceWorkingMemoryGb,
  memoryBreakdown,
  speedEstimate,
} from "./workload-memory";

/**
 Return the 24 GB hardware tier used as a fixed basis for speed assertions.
@returns the 24 GB HardwareTier
*/
function speedTierForTest(): HardwareTier {
  const match = HARDWARE_TIERS.find((row) => row.vramGb === 24);
  if (match === undefined) {
    throw new Error("Missing 24 GB test tier");
  }
  return match;
}

// 24 GB consumer class, an arbitrary tier for speed-format assertions.
const SPEED_TIER = speedTierForTest();

/**
 Parse the leading numeric throughput out of a `"<value> <unit>"` speed string.
@param speed - formatted speed estimate such as `"156.0 tokens/second"`
@returns the numeric throughput
*/
function speedValue(speed: string): number {
  return Number(speed.split(" ", 1)[0]);
}

const NO_KV_FAMILIES = new Set<WorkloadFamily>([
  "text_encoder",
  "vision",
  "image_diffusion",
]);

/**

@param overrides
*/
function state(overrides: Partial<FormState> = {}): FormState {
  return { ...defaultState(), ...overrides };
}

/**

@param overrides
*/
function required(overrides: Partial<FormState>): number {
  return memoryBreakdown(specFromState(state(overrides))).requiredGb;
}

describe("parameter conversion and precision maps", () => {
  test("converts B and M units into billions of parameters", () => {
    expect(
      specFromState(state({ totalParams: "7", parameterUnit: "B" }))
        .totalParamsB,
    ).toBe(7);
    expect(
      specFromState(state({ totalParams: "7000", parameterUnit: "M" }))
        .totalParamsB,
    ).toBe(7);
  });

  test("matches the required precision byte and overhead table", () => {
    expect(PRECISION_MAP).toEqual({
      "4-bit": { weightBytes: 0.5, weightOverhead: 1.15 },
      "5-bit GGUF": { weightBytes: 0.625, weightOverhead: 1.12 },
      "6-bit GGUF": { weightBytes: 0.75, weightOverhead: 1.1 },
      "8-bit": { weightBytes: 1, weightOverhead: 1.05 },
      "16-bit": { weightBytes: 2, weightOverhead: 1 },
      "32-bit": { weightBytes: 4, weightOverhead: 1 },
    });
  });
});

describe("corrected text-generation totals", () => {
  test.each<[string, Partial<FormState>, number]>([
    [
      "47B MoE server inference keeps resident weight memory dense",
      {
        totalParams: "47",
        moeEnabled: true,
        activeParams: "1.3",
        precision: "16-bit",
      },
      113.1,
    ],
    ["7B server inference default matches the empty-form estimate", {}, 19],
    ["8B server inference defaults to 21.3 GB", { totalParams: "8" }, 21.3],
    [
      "104B local exact GGUF file uses local overhead and no server buffer",
      {
        totalParams: "104",
        contextTokens: "32000",
        precision: "4-bit",
        kvCachePrecision: "32-bit",
        runtimeProfile: "Local / Edge",
        knownModelFileSizeGb: "52",
      },
      79.2,
    ],
    [
      "47B local 4-bit MoE applies quantized weight overhead",
      {
        totalParams: "47",
        precision: "4-bit",
        runtimeProfile: "Local / Edge",
        moeEnabled: true,
        activeParams: "1.3",
      },
      31,
    ],
    [
      "70B long-context 4-bit FP8 KV uses estimated GQA KV heads",
      {
        totalParams: "70",
        contextTokens: "128000",
        precision: "4-bit",
        kvCachePrecision: "8-bit / FP8",
      },
      71.2,
    ],
    [
      "70B exact file long-context case preserves architecture KV",
      {
        totalParams: "70",
        contextTokens: "128000",
        precision: "4-bit",
        kvCachePrecision: "8-bit / FP8",
        knownModelFileSizeGb: "35",
      },
      65.1,
    ],
    [
      "104B 8-bit 16-bit KV uses weight overhead",
      { totalParams: "104", contextTokens: "32000", precision: "8-bit" },
      141.6,
    ],
    [
      "7B million-token context uses estimated GQA",
      { contextTokens: "1000000", precision: "8-bit" },
      154.3,
    ],
  ])("%s", (scenario, overrides, expected) => {
    expect(required(overrides), scenario).toBe(expected);
  });

  test("compares precision totals with corrected defaults", () => {
    expect(
      (
        [
          "32-bit",
          "16-bit",
          "8-bit",
          "4-bit",
        ] satisfies FormState["precision"][]
      ).map((precision) =>
        required({
          totalParams: "8",
          precision,
        }),
      ),
    ).toEqual([39.8, 21.3, 12.5, 8.1]);
  });

  test("compares a 104B local precision sweep at 32k context with 32-bit KV", () => {
    expect(
      (
        [
          "32-bit",
          "16-bit",
          "8-bit",
          "4-bit",
        ] satisfies FormState["precision"][]
      ).map((precision) =>
        required({
          totalParams: "104",
          contextTokens: "32000",
          kvCachePrecision: "32-bit",
          runtimeProfile: "Local / Edge",
          precision,
        }),
      ),
    ).toEqual([454.1, 239.9, 138.1, 87.3]);
  });

  test("local 4-bit weights apply quantized overhead", () => {
    const spec = specFromState(
      state({
        totalParams: "47",
        precision: "4-bit",
        runtimeProfile: "Local / Edge",
      }),
    );

    expect(roundTo(weightsGb(spec), 1)).toBe(27);
  });
});

describe("training estimates", () => {
  test.each<[string, Partial<FormState>, number]>([
    [
      "8B QLoRA with 2% trainable adapters",
      {
        totalParams: "8",
        executionMode: "QLoRA fine-tuning",
        loraTrainablePercent: "2",
      },
      21,
    ],
    [
      "7B full training includes weights, states, activations, overhead, and buffer",
      { executionMode: "Full training" },
      152.9,
    ],
    [
      "tiny FP8 full training uses checkpointed activations without a special case",
      {
        totalParams: "0.0004",
        precision: "8-bit",
        kvCachePrecision: "8-bit / FP8",
        executionMode: "Full training",
      },
      7,
    ],
    [
      "8B default QLoRA uses 0.5% trainable adapters",
      {
        totalParams: "8",
        precision: "4-bit",
        executionMode: "QLoRA fine-tuning",
      },
      19.2,
    ],
    [
      "70B default QLoRA scales adapter state and activations",
      {
        totalParams: "70",
        precision: "4-bit",
        executionMode: "QLoRA fine-tuning",
      },
      99.9,
    ],
    [
      "3.8B default QLoRA uses the <=4B architecture bucket",
      {
        totalParams: "3.8",
        precision: "4-bit",
        executionMode: "QLoRA fine-tuning",
      },
      13.2,
    ],
    [
      "70B 2% QLoRA replaces legacy trained/use_adapter query flags",
      {
        totalParams: "70",
        precision: "4-bit",
        executionMode: "QLoRA fine-tuning",
        loraTrainablePercent: "2",
      },
      115.6,
    ],
  ])("%s", (scenario, overrides, expected) => {
    expect(required(overrides), scenario).toBe(expected);
  });

  test("training modes drop inference KV cache and decoder scratch for the training activation term", () => {
    // text_generation would carry both a decoder KV cache and decoder scratch
    // as inference, so it proves the training branch replaces family working
    // memory instead of adding to it.
    const spec = specFromState(
      state({
        workloadFamily: "text_generation",
        executionMode: "LoRA fine-tuning",
      }),
    );
    const asInference = inferenceWorkingMemoryGb(spec, weightsGb(spec));
    expect(asInference.kvCacheGb).toBeGreaterThan(0);
    expect(asInference.inputActivationGb).toBeGreaterThan(0);

    const breakdown = memoryBreakdown(spec);
    expect(breakdown.kvCacheGb).toBe(0);
    expect(breakdown.inputActivationGb).toBeCloseTo(
      trainingActivationGb(spec),
      9,
    );
  });

  test("LoRA and optimizer options affect only adapter training state", () => {
    const lora = specFromState(
      state({
        executionMode: "LoRA fine-tuning",
        optimizer: "8-bit Adam",
        loraTrainablePercent: "1",
      }),
    );
    expect(trainingStateGb(lora)).toBeCloseTo(0.42);
    expect(trainingActivationGb(lora)).toBeGreaterThan(0);
    expect(weightsGb(lora)).toBe(14);
  });

  test("training activation uses encoder and encoder-decoder token shapes", () => {
    const encoder = specFromState(
      state({
        workloadFamily: "text_encoder",
        executionMode: "LoRA fine-tuning",
        sequenceTokens: "256",
      }),
    );
    const encoderDecoder = specFromState(
      state({
        workloadFamily: "encoder_decoder",
        executionMode: "LoRA fine-tuning",
        inputTokens: "512",
        outputTokens: "128",
      }),
    );

    expect(trainingActivationGb(encoder)).toBeGreaterThan(0);
    expect(trainingActivationGb(encoderDecoder)).toBeGreaterThan(
      trainingActivationGb(encoder),
    );
  });

  test("calculator parsing falls back for invalid direct state values", () => {
    const spec = specFromState(
      state({
        totalParams: "bad",
        workloadSize: "bad",
        activeParams: "bad",
        moeEnabled: true,
        gpuResidentFraction: "bad",
        loraTrainablePercent: "bad",
      }),
    );

    expect(spec.totalParamsB).toBe(7);
    expect(spec.workloadSize).toBe(1);
    expect(spec.activeParamsB).toBe(7);
    expect(spec.gpuResidentFraction).toBe(1);
    expect(spec.loraTrainablePercent).toBe(0.5);

    expect(
      specFromState(state({ totalParams: "-1", workloadSize: "-2" }))
        .totalParamsB,
    ).toBe(7);
  });

  test("zero baseline produces zero output memory and speed", () => {
    const spec = specFromState(
      state({
        totalParams: "0",
        workloadSize: "0",
        contextTokens: "0",
      }),
    );

    expect(memoryBreakdown(spec).requiredGb).toBe(0);
    expect(speedEstimate(spec, weightsGb(spec), SPEED_TIER)).toBe(
      "0.0 tokens/second",
    );
  });

  test("checkpointing changes activation scale and SGD-like state is valid", () => {
    const checkpointed = specFromState(
      state({ executionMode: "Full training" }),
    );
    const uncheckpointed = specFromState(
      state({
        executionMode: "Full training",
        gradientCheckpointing: false,
        optimizer: "SGD-like",
      }),
    );
    expect(trainingActivationGb(uncheckpointed)).toBeGreaterThan(
      trainingActivationGb(checkpointed),
    );
    expect(trainingStateGb(uncheckpointed)).toBe(70);
  });
});

describe("workload-family working memory", () => {
  test("text generation includes decoder scratch by runtime profile", () => {
    const server = specFromState(state());
    const local = specFromState(state({ runtimeProfile: "Local / Edge" }));

    expect(
      inferenceWorkingMemoryGb(server, weightsGb(server)).inputActivationGb,
    ).toBeCloseTo(0.7);
    expect(
      inferenceWorkingMemoryGb(local, weightsGb(local)).inputActivationGb,
    ).toBeCloseTo(0.42);
  });

  test.each<WorkloadFamily>([
    "text_encoder",
    "encoder_decoder",
    "vision",
    "vision_language",
    "image_diffusion",
    "video_generation",
    "audio",
    "tabular",
    "custom",
  ])("%s produces a positive non-legacy working-memory estimate", (family) => {
    const spec = specFromState(state({ workloadFamily: family }));
    const weights = weightsGb(spec);
    const working = inferenceWorkingMemoryGb(spec, weights);
    expect(working.inputActivationGb + working.kvCacheGb).toBeGreaterThan(0);
    if (NO_KV_FAMILIES.has(family)) {
      expect(working.kvCacheGb).toBe(0);
    }
  });

  test("video 1080p branch and image pixel proxy branch are reachable", () => {
    const video = specFromState(
      state({ workloadFamily: "video_generation", videoResolution: "1080p" }),
    );
    const vision = specFromState(
      state({
        workloadFamily: "vision",
        imageWidth: "32",
        imageHeight: "32",
      }),
    );
    expect(
      inferenceWorkingMemoryGb(video, weightsGb(video)).inputActivationGb,
    ).toBeGreaterThan(0);
    expect(
      inferenceWorkingMemoryGb(vision, weightsGb(vision)).inputActivationGb,
    ).toBeGreaterThan(0);
  });

  test("vision-language falls back to pixel proxy when vision architecture is missing", () => {
    const spec = specFromState(state({ workloadFamily: "vision_language" }));
    const working = inferenceWorkingMemoryGb(spec, weightsGb(spec));

    expect(spec.visionArchitecture).toBeNull();
    expect(working.kvCacheGb).toBeCloseTo(1.061158912, 9);
    expect(working.inputActivationGb).toBeCloseTo(0.347108864, 9);
    expect(memoryBreakdown(spec).requiredGb.toFixed(1)).toBe("18.6");
  });

  test("vision-language pixel fallback keeps image count in KV only", () => {
    const base = specFromState(state({ workloadFamily: "vision_language" }));
    const counted = specFromState(
      state({ workloadFamily: "vision_language", imageCount: "3" }),
    );
    const baseWorking = inferenceWorkingMemoryGb(base, weightsGb(base));
    const countedWorking = inferenceWorkingMemoryGb(
      counted,
      weightsGb(counted),
    );

    expect(counted.visionArchitecture).toBeNull();
    expect(countedWorking.kvCacheGb).toBeCloseTo(2.134900736, 9);
    expect(countedWorking.inputActivationGb).toBeCloseTo(
      baseWorking.inputActivationGb,
      9,
    );
  });

  test("vision-language uses explicit vision architecture for image tokens", () => {
    const base = specFromState(state({ workloadFamily: "vision_language" }));
    const spec: CalculationSpec = {
      ...base,
      visionArchitecture: { layers: 24, hidden: 1024 },
    };

    expect(
      inferenceWorkingMemoryGb(spec, weightsGb(spec)).inputActivationGb,
    ).toBeCloseTo(0.682653184, 9);
  });

  test("working-memory helpers fall back for invalid raw workload fields", () => {
    const text = specFromState(state({ contextTokens: "bad" }));
    const custom = specFromState(
      state({
        workloadFamily: "custom",
        inputSizeMultiplier: "-1",
      }),
    );
    const malformed = specFromState(state({ workloadFamily: "text_encoder" }));
    Object.defineProperty(malformed, "family", { value: "unknown" });

    expect(inferenceWorkingMemoryGb(text, weightsGb(text)).kvCacheGb).toBe(
      inferenceWorkingMemoryGb(
        specFromState(state({ contextTokens: "8000" })),
        weightsGb(text),
      ).kvCacheGb,
    );
    expect(
      inferenceWorkingMemoryGb(custom, weightsGb(custom)).inputActivationGb,
    ).toBeCloseTo(weightsGb(custom) * 0.25);
    expect(
      inferenceWorkingMemoryGb(malformed, weightsGb(malformed))
        .inputActivationGb,
    ).toBeCloseTo(weightsGb(malformed) * 0.25);
  });
});

describe("architecture, runtime, accuracy, and speed helpers", () => {
  test("covers every transformer architecture bucket", () => {
    expect(
      [1, 4, 10, 20, 40, 80, 160, 161].map(
        (value) => architectureFor(value).layers,
      ),
    ).toEqual([16, 28, 32, 40, 48, 80, 96, 120]);
  });

  test("falls back to the smallest bucket for a NaN parameter count", () => {
    expect(architectureFor(NaN).layers).toBe(16);
  });

  test("runtime assumptions cover training, local, and server profiles", () => {
    expect(runtimeAssumptions("Inference", "Server / Cloud")).toEqual({
      overheadGb: 1.5,
      buffer: 1.1,
      utilization: 0.85,
    });
    expect(runtimeAssumptions("Inference", "Local / Edge").buffer).toBe(1);
    expect(runtimeAssumptions("Full training", "Local / Edge")).toEqual({
      overheadGb: 4,
      buffer: 1.25,
      utilization: 0.8,
    });
  });

  test("speed estimate reports the workload-specific throughput unit", () => {
    const expectedUnits: readonly (readonly [WorkloadFamily, string])[] = [
      ["text_generation", "tokens/second"],
      ["text_encoder", "tokens/second"],
      ["encoder_decoder", "tokens/second"],
      ["custom", "tokens/second"],
      ["image_diffusion", "images/minute"],
      ["video_generation", "clips/minute"],
      ["tabular", "rows/second"],
      ["audio", "audio tokens/second"],
    ];
    for (const [family, unit] of expectedUnits) {
      const spec = specFromState(state({ workloadFamily: family }));
      const speed = speedEstimate(spec, weightsGb(spec), SPEED_TIER);
      expect(speed.endsWith(unit)).toBe(true);
    }
  });

  test("MoE active parameters drive a faster speed estimate than the dense model", () => {
    const shared = {
      totalParams: "47",
      precision: "16-bit",
      workloadFamily: "text_generation" as const,
    } satisfies Partial<FormState>;
    const dense = specFromState(state(shared));
    const moe = specFromState(
      state({ ...shared, moeEnabled: true, activeParams: "3" }),
    );
    const denseSpeed = speedValue(
      speedEstimate(dense, weightsGb(dense), SPEED_TIER),
    );
    const moeSpeed = speedValue(speedEstimate(moe, weightsGb(moe), SPEED_TIER));
    // tokens/sec = bandwidth / compute_weight, so smaller active compute is faster.
    expect(moeSpeed).toBeGreaterThan(denseSpeed);
  });

  test("MoE never reduces resident weight memory", () => {
    const dense = specFromState(
      state({ totalParams: "47", precision: "16-bit" }),
    );
    const moe = specFromState(
      state({
        totalParams: "47",
        precision: "16-bit",
        moeEnabled: true,
        activeParams: "3",
      }),
    );
    expect(weightsGb(moe)).toBe(weightsGb(dense));
  });

  test("zero active params falls back to the total for MoE compute", () => {
    const spec = specFromState(state({ moeEnabled: true, activeParams: "0" }));
    expect(spec.activeParamsB).toBe(spec.totalParamsB);
  });

  test("roundTo produces fixed one-decimal contract values", () => {
    expect(roundTo(20.44, 1).toFixed(1)).toBe("20.4");
    expect(roundTo(20.45, 1).toFixed(1)).toBe("20.5");
  });
});
