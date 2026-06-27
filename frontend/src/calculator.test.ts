import { describe, expect, test } from "vitest";
import {
  PRECISION_MAP,
  accuracyFor,
  architectureFor,
  inferenceWorkingMemoryGb,
  memoryBreakdown,
  roundTo,
  runtimeAssumptions,
  specFromState,
  speedEstimate,
  trainingActivationGb,
  trainingStateGb,
  weightsGb,
} from "./calculator";
import type { CalculationSpec } from "./calculator-core";
import { defaultState } from "./state";
import type { FormState, WorkloadFamily } from "./types";

const NO_KV_FAMILIES = new Set<WorkloadFamily>([
  "text_encoder",
  "vision",
  "image_diffusion",
]);

function state(overrides: Partial<FormState> = {}): FormState {
  return { ...defaultState(), ...overrides };
}

function required(overrides: Partial<FormState>): number {
  return memoryBreakdown(specFromState(state(overrides))).requiredGb;
}

describe("parameter conversion and precision maps", () => {
  test("converts B, M, and K units into billions of parameters", () => {
    expect(
      specFromState(state({ total_params: "7", parameter_unit: "B" }))
        .totalParamsB,
    ).toBe(7);
    expect(
      specFromState(state({ total_params: "7000", parameter_unit: "M" }))
        .totalParamsB,
    ).toBe(7);
    expect(
      specFromState(state({ total_params: "7000000", parameter_unit: "K" }))
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
        total_params: "47",
        moe_enabled: true,
        active_params: "1.3",
        precision: "16-bit",
      },
      113.1,
    ],
    ["8B server inference defaults to 21.3 GB", { total_params: "8" }, 21.3],
    [
      "104B local exact GGUF file uses local overhead and no server buffer",
      {
        total_params: "104",
        context_tokens: "32000",
        precision: "4-bit",
        kv_cache_precision: "32-bit",
        runtime_profile: "Local / Edge",
        known_model_file_size_gb: "52",
      },
      79.2,
    ],
    [
      "47B local 4-bit MoE applies quantized weight overhead",
      {
        total_params: "47",
        precision: "4-bit",
        runtime_profile: "Local / Edge",
        moe_enabled: true,
        active_params: "1.3",
      },
      31,
    ],
    [
      "70B long-context 4-bit FP8 KV uses estimated GQA KV heads",
      {
        total_params: "70",
        context_tokens: "128000",
        precision: "4-bit",
        kv_cache_precision: "8-bit / FP8",
      },
      71.2,
    ],
    [
      "70B exact file long-context case preserves architecture KV",
      {
        total_params: "70",
        context_tokens: "128000",
        precision: "4-bit",
        kv_cache_precision: "8-bit / FP8",
        known_model_file_size_gb: "35",
      },
      65.1,
    ],
    [
      "104B 8-bit 16-bit KV uses weight overhead",
      { total_params: "104", context_tokens: "32000", precision: "8-bit" },
      141.6,
    ],
    [
      "7B million-token context uses estimated GQA",
      { context_tokens: "1000000", precision: "8-bit" },
      154.3,
    ],
  ])("%s", (_name, overrides, expected) => {
    expect(required(overrides)).toBe(expected);
  });

  test("compares precision totals with corrected defaults", () => {
    expect(
      ["32-bit", "16-bit", "8-bit", "4-bit"].map((precision) =>
        required({
          total_params: "8",
          precision: precision as FormState["precision"],
        }),
      ),
    ).toEqual([39.8, 21.3, 12.5, 8.1]);
  });

  test("local 4-bit weights apply quantized overhead", () => {
    const spec = specFromState(
      state({
        total_params: "47",
        precision: "4-bit",
        runtime_profile: "Local / Edge",
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
        total_params: "8",
        execution_mode: "QLoRA fine-tuning",
        lora_trainable_percent: "2",
      },
      21,
    ],
    [
      "7B full training includes weights, states, activations, overhead, and buffer",
      { execution_mode: "Full training" },
      152.9,
    ],
    [
      "tiny FP8 full training uses checkpointed activations without a special case",
      {
        total_params: "0.0004",
        precision: "8-bit",
        kv_cache_precision: "8-bit / FP8",
        execution_mode: "Full training",
      },
      7,
    ],
    [
      "8B default QLoRA uses 0.5% trainable adapters",
      {
        total_params: "8",
        precision: "4-bit",
        execution_mode: "QLoRA fine-tuning",
      },
      19.2,
    ],
    [
      "70B default QLoRA scales adapter state and activations",
      {
        total_params: "70",
        precision: "4-bit",
        execution_mode: "QLoRA fine-tuning",
      },
      99.9,
    ],
    [
      "3.8B default QLoRA uses the <=4B architecture bucket",
      {
        total_params: "3.8",
        precision: "4-bit",
        execution_mode: "QLoRA fine-tuning",
      },
      13.2,
    ],
    [
      "70B 2% QLoRA replaces legacy trained/use_adapter query flags",
      {
        total_params: "70",
        precision: "4-bit",
        execution_mode: "QLoRA fine-tuning",
        lora_trainable_percent: "2",
      },
      115.6,
    ],
  ])("%s", (_name, overrides, expected) => {
    expect(required(overrides)).toBe(expected);
  });

  test("LoRA and optimizer options affect only adapter training state", () => {
    const lora = specFromState(
      state({
        execution_mode: "LoRA fine-tuning",
        optimizer: "8-bit Adam",
        lora_trainable_percent: "1",
      }),
    );
    expect(trainingStateGb(lora)).toBeCloseTo(0.42);
    expect(trainingActivationGb(lora)).toBeGreaterThan(0);
    expect(weightsGb(lora)).toBe(14);
  });

  test("training activation uses encoder and encoder-decoder token shapes", () => {
    const encoder = specFromState(
      state({
        workload_family: "text_encoder",
        execution_mode: "LoRA fine-tuning",
        sequence_tokens: "256",
      }),
    );
    const encoderDecoder = specFromState(
      state({
        workload_family: "encoder_decoder",
        execution_mode: "LoRA fine-tuning",
        input_tokens: "512",
        output_tokens: "128",
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
        total_params: "bad",
        workload_size: "bad",
        active_params: "bad",
        moe_enabled: true,
        gpu_resident_fraction: "bad",
        lora_trainable_percent: "bad",
      }),
    );

    expect(spec.totalParamsB).toBe(7);
    expect(spec.workloadSize).toBe(1);
    expect(spec.activeParamsB).toBe(7);
    expect(spec.gpuResidentFraction).toBe(1);
    expect(spec.loraTrainablePercent).toBe(0.5);

    expect(
      specFromState(state({ total_params: "-1", workload_size: "-2" }))
        .totalParamsB,
    ).toBe(7);
  });

  test("checkpointing changes activation scale and SGD-like state is valid", () => {
    const checkpointed = specFromState(
      state({ execution_mode: "Full training" }),
    );
    const uncheckpointed = specFromState(
      state({
        execution_mode: "Full training",
        gradient_checkpointing: false,
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
    const local = specFromState(state({ runtime_profile: "Local / Edge" }));

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
    const spec = specFromState(state({ workload_family: family }));
    const weights = weightsGb(spec);
    const working = inferenceWorkingMemoryGb(spec, weights);
    expect(working.inputActivationGb + working.kvCacheGb).toBeGreaterThan(0);
    if (NO_KV_FAMILIES.has(family)) {
      expect(working.kvCacheGb).toBe(0);
    }
  });

  test("video 1080p branch and image pixel proxy branch are reachable", () => {
    const video = specFromState(
      state({ workload_family: "video_generation", video_resolution: "1080p" }),
    );
    const vision = specFromState(
      state({
        workload_family: "vision",
        image_width: "32",
        image_height: "32",
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
    const spec = specFromState(state({ workload_family: "vision_language" }));
    const working = inferenceWorkingMemoryGb(spec, weightsGb(spec));

    expect(spec.visionArchitecture).toBeNull();
    expect(working.kvCacheGb).toBeCloseTo(1.061158912, 9);
    expect(working.inputActivationGb).toBeCloseTo(0.347108864, 9);
    expect(memoryBreakdown(spec).requiredGb).toBe(18.6);
  });

  test("vision-language uses explicit vision architecture for image tokens", () => {
    const base = specFromState(state({ workload_family: "vision_language" }));
    const spec: CalculationSpec = {
      ...base,
      visionArchitecture: { layers: 24, hidden: 1024 },
    };

    expect(
      inferenceWorkingMemoryGb(spec, weightsGb(spec)).inputActivationGb,
    ).toBeCloseTo(0.682653184, 9);
  });

  test("working-memory helpers fall back for invalid raw workload fields", () => {
    const text = specFromState(state({ context_tokens: "bad" }));
    const custom = specFromState(
      state({
        workload_family: "custom",
        input_size_multiplier: "-1",
      }),
    );
    const malformed = specFromState(state({ workload_family: "text_encoder" }));
    Object.defineProperty(malformed, "family", { value: "unknown" });

    expect(inferenceWorkingMemoryGb(text, weightsGb(text)).kvCacheGb).toBe(
      inferenceWorkingMemoryGb(
        specFromState(state({ context_tokens: "8000" })),
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

  test("accuracy labels cover all documented values", () => {
    expect(
      accuracyFor(specFromState(state({ known_model_file_size_gb: "52" }))),
    ).toBe("File-size based");
    expect(
      accuracyFor(
        specFromState(state({ exact_transformer_architecture: true })),
      ),
    ).toBe("Advanced override");
    expect(
      accuracyFor(specFromState(state({ workload_family: "vision_language" }))),
    ).toBe("Component-based");
    expect(
      accuracyFor(specFromState(state({ workload_family: "image_diffusion" }))),
    ).toBe("Rough");
    expect(
      accuracyFor(specFromState(state({ workload_family: "tabular" }))),
    ).toBe("Estimated");
  });

  test("speed labels vary by workload family and MoE compute weights", () => {
    for (const family of [
      "text_generation",
      "image_diffusion",
      "video_generation",
      "tabular",
      "audio",
    ] as const) {
      const spec = specFromState(
        state({
          workload_family: family,
          moe_enabled: family === "text_generation",
        }),
      );
      expect(speedEstimate(spec, weightsGb(spec))).toMatch(
        /tokens|images|clips|rows|audio/u,
      );
    }
  });

  test("roundTo produces fixed one-decimal contract values", () => {
    expect(roundTo(20.44, 1)).toBe(20.4);
    expect(roundTo(20.45, 1)).toBe(20.5);
  });
});
