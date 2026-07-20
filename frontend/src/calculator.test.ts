import { describe, expect, test } from "vitest";
import type { CalculationSpec } from "./calculator-core";
import {
  PRECISION_MAP,
  architectureFor,
  roundUpTo,
  roundTo,
  runtimeAssumptions,
  specFromState,
  trainingActivationGb,
  trainingStateGb,
  weightsGb,
} from "./calculator-core";
import { HARDWARE_TIERS, type HardwareTier } from "./hardware";
import { defaultState } from "./state";
import type { FormState, Precision, WorkloadFamily } from "./types";
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
  "video_generation",
  "audio",
  "tabular",
  "custom",
]);

interface WorkingMemoryExpectation {
  readonly scenario: string;
  readonly family: WorkloadFamily;
  readonly overrides: Partial<FormState>;
  readonly key: keyof ReturnType<typeof inferenceWorkingMemoryGb>;
  readonly expected: number;
}

/**

@param overrides
*/
function state(overrides: Partial<FormState> = {}): FormState {
  return { ...defaultState(), ...overrides };
}

/**
 Compute the LoRA adapter training state for an optimizer at 1% trainable.
@param optimizer - the optimizer choice under test
@returns the adapter training state in GB
*/
function loraAdapterStateGb(optimizer: FormState["optimizer"]): number {
  return trainingStateGb(
    specFromState(
      state({
        executionMode: "LoRA fine-tuning",
        optimizer,
        loraTrainablePercent: "1",
      }),
    ),
  );
}

/**
 Compute the full-training state for an optimizer on the default 7B model.
@param optimizer - the optimizer choice under test
@returns the full-training state in GB
*/
function fullTrainingStateGb(optimizer: FormState["optimizer"]): number {
  return trainingStateGb(
    specFromState(state({ executionMode: "Full training", optimizer })),
  );
}

/**

@param overrides
*/
function required(overrides: Partial<FormState>): number {
  return memoryBreakdown(specFromState(state(overrides))).requiredGb;
}

/**
Compute decoder scratch memory for a text-generation inference case.
@param overrides Text-generation form overrides.
@returns activation scratch in GB
*/
function decoderScratch(overrides: Partial<FormState>): number {
  const spec = specFromState(
    state({ workloadFamily: "text_generation", ...overrides }),
  );
  return inferenceWorkingMemoryGb(spec, weightsGb(spec)).inputActivationGb;
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
    // The GGUF/INT tiers mirror the source expressions (bpw / 8, or explicit
    // bytes/param) so both sides evaluate to identical IEEE-754 values; their
    // published bits-per-weight already fold in block-scale metadata, so no
    // nominal-vs-real overhead multiplier applies (weightOverhead 1).
    expect(PRECISION_MAP).toEqual({
      "4-bit": { weightBytes: 0.5, weightOverhead: 1.15 },
      "5-bit GGUF": { weightBytes: 0.625, weightOverhead: 1.12 },
      "6-bit GGUF": { weightBytes: 0.75, weightOverhead: 1.1 },
      "8-bit": { weightBytes: 1, weightOverhead: 1.05 },
      "16-bit": { weightBytes: 2, weightOverhead: 1 },
      "32-bit": { weightBytes: 4, weightOverhead: 1 },
      IQ1_S: { weightBytes: 1.56 / 8, weightOverhead: 1 },
      IQ2_XXS: { weightBytes: 2.06 / 8, weightOverhead: 1 },
      IQ3_XXS: { weightBytes: 3.06 / 8, weightOverhead: 1 },
      Q4_K_M: { weightBytes: 4.85 / 8, weightOverhead: 1 },
      Q5_K_M: { weightBytes: 5.69 / 8, weightOverhead: 1 },
      Q6_K: { weightBytes: 6.59 / 8, weightOverhead: 1 },
      Q8_0: { weightBytes: 8.5 / 8, weightOverhead: 1 },
      INT2: { weightBytes: 0.25, weightOverhead: 1 },
      INT3: { weightBytes: 0.375, weightOverhead: 1 },
    });
  });

  test("sizes real GGUF and integer quant tiers at their published bytes-per-parameter", () => {
    // A 7B model's resident inference weights must equal params x bytes/param:
    // GGUF tiers use bpw / 8, INT tiers use their explicit bytes/param, both at
    // overhead 1. Pins the ladder against transcription or unit-conversion slips.
    const cases: readonly [Precision, number][] = [
      ["IQ1_S", 1.56 / 8],
      ["IQ3_XXS", 3.06 / 8],
      ["Q4_K_M", 4.85 / 8],
      ["Q8_0", 8.5 / 8],
      ["INT2", 0.25],
      ["INT3", 0.375],
    ];
    for (const [precision, bytesPerParameter] of cases) {
      const spec = specFromState(state({ totalParams: "7", precision }));
      expect(weightsGb(spec)).toBeCloseTo(7 * bytesPerParameter, 6);
    }
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
      109.7,
    ],
    ["7B server inference default matches the empty-form estimate", {}, 18.8],
    ["8B server inference defaults to 21.0 GB", { totalParams: "8" }, 21],
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
      84.2,
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
      31.8,
    ],
    [
      "70B long-context 4-bit FP8 KV uses estimated GQA KV heads",
      {
        totalParams: "70",
        contextTokens: "128000",
        precision: "4-bit",
        kvCachePrecision: "8-bit / FP8",
      },
      73.9,
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
      68.1,
    ],
    [
      "104B 8-bit 16-bit KV uses weight overhead",
      { totalParams: "104", contextTokens: "32000", precision: "8-bit" },
      142.8,
    ],
    [
      "7B million-token context uses estimated GQA",
      { contextTokens: "1000000", precision: "8-bit" },
      154.5,
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
    ).toEqual([38.6, 21, 12.6, 8.5]);
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
    ).toEqual([448.2, 240.2, 141.4, 92]);
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
      21.1,
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
      19.3,
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
      115.7,
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

  test("paged 8-bit AdamW and Adafactor size adapter state by their bytes", () => {
    // Paging only relocates the quantized state, so it sizes like 8-bit Adam
    // (2 bytes); Adafactor's factored state approximates to 1 byte/param.
    // Adapter parameters: 7B x 1% = 0.07B; state = adapter x (2 + 2 + bytes).
    expect(loraAdapterStateGb("Paged 8-bit AdamW")).toBeCloseTo(0.42);
    expect(loraAdapterStateGb("Adafactor")).toBeCloseTo(0.35);
  });

  test("full-training state scales with each optimizer's bytes per parameter", () => {
    // Full training: 7B x (4 gradient + 2 master + optimizer bytes).
    expect(fullTrainingStateGb("Paged 8-bit AdamW")).toBeCloseTo(56);
    expect(fullTrainingStateGb("Adafactor")).toBeCloseTo(49);
    // Regression: the existing optimizer mappings stay unchanged.
    expect(fullTrainingStateGb("AdamW")).toBeCloseTo(98);
    expect(fullTrainingStateGb("8-bit Adam")).toBeCloseTo(56);
    expect(fullTrainingStateGb("SGD-like")).toBeCloseTo(70);
  });

  test("known model file size overrides QLoRA base weight estimate", () => {
    const spec = specFromState(
      state({
        totalParams: "8",
        executionMode: "QLoRA fine-tuning",
        knownModelFileSizeGb: "6",
      }),
    );

    expect(weightsGb(spec)).toBe(6);
    expect(memoryBreakdown(spec).requiredGb).toBe(21);
  });

  /**
  Exact model files can be known even when a caller does not know the parameter
  count. The file still represents resident model memory and should receive the
  normal runtime reserve and throughput estimate.
  */
  test("known model file size drives estimates when total parameters are unknown", () => {
    const spec = specFromState(
      state({
        totalParams: "0",
        knownModelFileSizeGb: "52",
      }),
    );
    const breakdown = memoryBreakdown(spec);

    expect(spec.knownModelFileSizeGb).toBe(52);
    expect(weightsGb(spec)).toBe(52);
    expect(breakdown.runtimeOverheadGb).toBe(1.5);
    expect(breakdown.requiredGb).toBeCloseTo(59.7, 9);
    expect(speedEstimate(spec, weightsGb(spec), SPEED_TIER)).not.toBe(
      "0 tokens/second",
    );
  });

  test("GPU resident fraction scales known-file inference weights without exceeding the file size", () => {
    const partial = specFromState(
      state({
        knownModelFileSizeGb: "52",
        gpuResidentFraction: "0.25",
      }),
    );
    const overOne = specFromState(
      state({
        knownModelFileSizeGb: "52",
        gpuResidentFraction: "2",
      }),
    );
    const negative = specFromState(
      state({
        knownModelFileSizeGb: "52",
        gpuResidentFraction: "-0.25",
      }),
    );

    expect(partial.gpuResidentFraction).toBe(0.25);
    expect(weightsGb(partial)).toBe(13);
    expect(overOne.gpuResidentFraction).toBe(1);
    expect(weightsGb(overOne)).toBe(52);
    expect(negative.gpuResidentFraction).toBe(1);
    expect(weightsGb(negative)).toBe(52);
  });

  /**
  Direct callers can bypass URL and form caps. The calculation source of truth
  should still prevent adapter state from exceeding the whole model.
  */
  test("caps direct LoRA trainable percent at the full model", () => {
    const fullModelAdapters = specFromState(
      state({
        totalParams: "8",
        executionMode: "LoRA fine-tuning",
        loraTrainablePercent: "100",
      }),
    );
    const impossibleAdapters = specFromState(
      state({
        totalParams: "8",
        executionMode: "LoRA fine-tuning",
        loraTrainablePercent: "250",
      }),
    );

    expect(impossibleAdapters.loraTrainablePercent).toBe(100);
    expect(trainingStateGb(impossibleAdapters)).toBe(
      trainingStateGb(fullModelAdapters),
    );
  });

  /**
  Direct state may contain stale or invalid Known Model File Size values. They
  should not become a zero-size override that erases parameter-based weights.
  */
  test.each(["0", "-52", "bad"])(
    "ignores %s as a non-positive known file size override",
    (knownModelFileSizeGb) => {
      const baseline = specFromState(state());
      const invalidOverride = specFromState(state({ knownModelFileSizeGb }));

      expect(invalidOverride.knownModelFileSizeGb).toBeNull();
      expect(weightsGb(invalidOverride)).toBe(weightsGb(baseline));
    },
  );

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

  /**
  Training estimates must follow the same visible family-specific sizing inputs
  that users tune for inference, not the text-generation context fallback.
  */
  test.each([
    {
      scenario: "vision image patch tokens",
      overrides: {
        workloadFamily: "vision",
        imageWidth: "2048",
        imageHeight: "2048",
      },
      expected: 12.88568832,
    },
    {
      scenario: "diffusion output image patch tokens",
      overrides: {
        workloadFamily: "image_diffusion",
        imageWidth: "2048",
        imageHeight: "2048",
      },
      expected: 12.88568832,
    },
    {
      scenario: "video patch tokens across latent frame steps",
      overrides: {
        workloadFamily: "video_generation",
        videoResolution: "1080p",
        videoFrames: "161",
      },
      expected: 263.140933632,
    },
    {
      scenario: "audio duration tokens",
      overrides: { workloadFamily: "audio", audioSeconds: "60" },
      expected: 2.359296,
    },
    {
      scenario: "tabular row-feature blocks",
      overrides: {
        workloadFamily: "tabular",
        rowsPerBatch: "20000",
        features: "200",
      },
      expected: 31.45728,
    },
    {
      scenario: "custom input multiplier",
      overrides: { workloadFamily: "custom", inputSizeMultiplier: "3" },
      expected: 18.874368,
    },
  ] satisfies readonly {
    readonly scenario: string;
    readonly overrides: Partial<FormState>;
    readonly expected: number;
  }[])(
    "training activation scales with $scenario",
    ({ overrides, expected }) => {
      const spec = specFromState(
        state({ ...overrides, executionMode: "LoRA fine-tuning" }),
      );

      expect(trainingActivationGb(spec)).toBeCloseTo(expected, 9);
    },
  );

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

  /**
  Direct state can contain zero for request or batch count; a nonzero model should
  still price at least one unit of workload-sensitive memory.
  */
  test("zero workload size falls back to one request instead of erasing memory", () => {
    const zero = specFromState(
      state({
        totalParams: "7",
        workloadSize: "0",
        contextTokens: "8000",
      }),
    );
    const one = specFromState(
      state({
        totalParams: "7",
        workloadSize: "1",
        contextTokens: "8000",
      }),
    );

    expect(zero.workloadSize).toBe(1);
    expect(inferenceWorkingMemoryGb(zero, weightsGb(zero)).kvCacheGb).toBe(
      inferenceWorkingMemoryGb(one, weightsGb(one)).kvCacheGb,
    );
  });

  /**
  A live model must never price a zero-length context: blank or 0 (including a
  stale shared URL) floors to the 256-token minimum, so the KV cache stays
  nonzero and matches an explicit 256 rather than collapsing to ~0.
  */
  test("context length floors to the 256-token minimum for a live model", () => {
    const floored = specFromState(
      state({ totalParams: "7", contextTokens: "256" }),
    );
    const flooredKv = inferenceWorkingMemoryGb(
      floored,
      weightsGb(floored),
    ).kvCacheGb;

    for (const raw of ["0", ""]) {
      const spec = specFromState(
        state({ totalParams: "7", contextTokens: raw }),
      );
      const kv = inferenceWorkingMemoryGb(spec, weightsGb(spec)).kvCacheGb;
      expect(kv).toBeGreaterThan(0);
      expect(kv).toBe(flooredKv);
    }

    const defaultSpec = specFromState(
      state({ totalParams: "7", contextTokens: "8000" }),
    );
    expect(flooredKv).toBeLessThan(
      inferenceWorkingMemoryGb(defaultSpec, weightsGb(defaultSpec)).kvCacheGb,
    );
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
      "0 tokens/second",
    );
  });

  /**
  Workload dimensions alone cannot create VRAM demand without either model
  parameters or an exact known model file.
  */
  test("zero model memory suppresses family workload memory", () => {
    const spec = specFromState(
      state({
        totalParams: "0",
        workloadFamily: "vision",
        imageWidth: "4096",
        imageHeight: "4096",
      }),
    );
    const breakdown = memoryBreakdown(spec);

    expect(weightsGb(spec)).toBe(0);
    expect(breakdown.inputActivationGb).toBe(0);
    expect(breakdown.runtimeOverheadGb).toBe(0);
    expect(breakdown.requiredGb).toBe(0);
    expect(speedEstimate(spec, weightsGb(spec), SPEED_TIER)).toBe(
      "0 tokens/second",
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
  test("text generation decoder scratch follows anchored context bands", () => {
    const at4k = decoderScratch({ totalParams: "70", contextTokens: "4096" });
    const at8k = decoderScratch({ totalParams: "70", contextTokens: "8192" });
    const at32k = decoderScratch({
      totalParams: "70",
      contextTokens: "32768",
    });
    const at128k = decoderScratch({
      totalParams: "70",
      contextTokens: "128000",
    });

    expect(at8k).toBeGreaterThanOrEqual(at4k);
    expect(at32k).toBeGreaterThan(at8k);
    expect(at128k).toBeGreaterThanOrEqual(at32k);
    expect(at8k).toBeGreaterThanOrEqual(2.2);
    expect(at8k).toBeLessThanOrEqual(3.3);
    expect(at32k).toBeGreaterThanOrEqual(4.3);
    expect(at32k).toBeLessThanOrEqual(4.6);
  });

  test("decoder activation scratch uses fp16 compute weights across quantization", () => {
    const fp16 = specFromState(
      state({ totalParams: "70", precision: "16-bit" }),
    );
    const q4 = specFromState(state({ totalParams: "70", precision: "Q4_K_M" }));
    const fp16Activation = inferenceWorkingMemoryGb(
      fp16,
      weightsGb(fp16),
    ).inputActivationGb;

    expect(inferenceWorkingMemoryGb(q4, weightsGb(q4)).inputActivationGb).toBe(
      fp16Activation,
    );
    expect(fp16Activation).toBeGreaterThanOrEqual(1);
    expect(fp16Activation).toBeLessThanOrEqual(3);
  });

  test("decoder activation scratch has a small-model floor", () => {
    const tiny = specFromState(
      state({ totalParams: "0.1", precision: "Q4_K_M" }),
    );

    expect(
      inferenceWorkingMemoryGb(tiny, weightsGb(tiny)).inputActivationGb,
    ).toBe(0.5);
  });

  test("decoder families scale persistent KV cache while encoder-like families do not", () => {
    const text = specFromState(
      state({ workloadFamily: "text_generation", contextTokens: "16000" }),
    );
    const encoderDecoder = specFromState(
      state({ workloadFamily: "encoder_decoder", outputTokens: "512" }),
    );
    const visionLanguage = specFromState(
      state({ workloadFamily: "vision_language", textContextTokens: "8000" }),
    );

    expect(
      inferenceWorkingMemoryGb(text, weightsGb(text)).kvCacheGb,
    ).toBeCloseTo(2.097152, 9);
    expect(
      inferenceWorkingMemoryGb(encoderDecoder, weightsGb(encoderDecoder))
        .kvCacheGb,
    ).toBeCloseTo(0.067108864, 9);
    expect(
      inferenceWorkingMemoryGb(visionLanguage, weightsGb(visionLanguage))
        .kvCacheGb,
    ).toBeGreaterThan(0);

    for (const family of NO_KV_FAMILIES) {
      const spec = specFromState(state({ workloadFamily: family }));
      expect(inferenceWorkingMemoryGb(spec, weightsGb(spec)).kvCacheGb).toBe(0);
    }
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

  test.each([
    {
      scenario: "encoder input tokens",
      family: "text_encoder",
      overrides: { sequenceTokens: "1024" },
      key: "inputActivationGb",
      expected: 0.536870912,
    },
    {
      scenario: "encoder-decoder input and cross-attention scratch",
      family: "encoder_decoder",
      overrides: { inputTokens: "2048" },
      key: "inputActivationGb",
      expected: 1.573741824,
    },
    {
      scenario: "diffusion latent resolution",
      family: "image_diffusion",
      overrides: {
        totalParams: "0.1",
        imageWidth: "4096",
        imageHeight: "4096",
      },
      key: "inputActivationGb",
      expected: 0.134217728,
    },
    {
      scenario: "video latent frame count",
      family: "video_generation",
      overrides: {
        totalParams: "0.1",
        videoFrames: "161",
        videoResolution: "1080p",
      },
      key: "inputActivationGb",
      expected: 1.0202112,
    },
    {
      scenario: "audio duration tokens",
      family: "audio",
      overrides: { audioSeconds: "60" },
      key: "inputActivationGb",
      expected: 1.572864,
    },
    {
      scenario: "tabular batch rows",
      family: "tabular",
      overrides: { rowsPerBatch: "20000" },
      key: "inputActivationGb",
      expected: 0.032,
    },
    {
      scenario: "custom input multiplier",
      family: "custom",
      overrides: { inputSizeMultiplier: "2" },
      key: "inputActivationGb",
      expected: 7,
    },
  ] satisfies readonly WorkingMemoryExpectation[])(
    "scales $scenario through the $family formula",
    ({ family, overrides, key, expected }) => {
      const spec = specFromState(
        state({ workloadFamily: family, ...overrides }),
      );

      expect(inferenceWorkingMemoryGb(spec, weightsGb(spec))[key]).toBeCloseTo(
        expected,
        9,
      );
    },
  );

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
    expect(working.inputActivationGb).toBeCloseTo(0.567108864, 9);
    expect(memoryBreakdown(spec).requiredGb.toFixed(1)).toBe("18.9");
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
    ).toBeCloseTo(0.902653184, 9);
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

  /**
  Active MoE parameters are a compute subset of total parameters, never a larger
  model than the resident weights.
  */
  test("caps direct MoE active parameters at total parameters", () => {
    const spec = specFromState(
      state({ totalParams: "47", moeEnabled: true, activeParams: "94" }),
    );

    expect(spec.activeParamsB).toBe(47);
  });

  test("roundTo produces fixed one-decimal contract values", () => {
    expect(roundTo(20.44, 1).toFixed(1)).toBe("20.4");
    expect(roundTo(20.45, 1).toFixed(1)).toBe("20.5");
  });

  test("roundUpTo never rounds memory requirements below the raw estimate", () => {
    expect(roundUpTo(20.4, 1).toFixed(1)).toBe("20.4");
    expect(roundUpTo(20.4001, 1).toFixed(1)).toBe("20.5");
    expect(roundUpTo(20.45, 1).toFixed(1)).toBe("20.5");
  });
});
