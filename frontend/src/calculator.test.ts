// Ports tests/test_vram_calculator.py: the pure VRAM calculator core. The Python
// DeploymentSpec validation-rejection cases map to query/state normalization and are
// ported in app.test.ts instead. The trainable_parameters_percent overhead-scaling and
// its rejection cases are an intentional, documented scope reduction (flat 4.0 GB QLoRA
// overhead, no trainable-% form control) and are deliberately not ported.

import { describe, expect, test } from "vitest";
import {
  RUNTIME_MARGINS,
  kvCacheGb,
  roundTo,
  taskOverheadGb,
  totalVramGb,
  weightsGb,
  type Bits,
  type DeploymentSpec,
} from "./calculator";

// Mirror the Python DeploymentSpec defaults (inference, 16-bit weights/KV, dense, pytorch).
/**
 
@param overrides
 */
function spec(
  overrides: Partial<DeploymentSpec> & {
    parameters_b: number;
    context_tokens: number;
  },
): DeploymentSpec {
  return {
    weight_bits: 16,
    kv_cache_bits: 16,
    task: "inference",
    architecture: "dense",
    active_parameters_b: null,
    runtime: "pytorch",
    ...overrides,
  };
}

describe("weights", () => {
  test.each<[Bits, number]>([
    [32, 32],
    [16, 16],
    [8, 8],
    [4, 4],
  ])("scale with %i-bit precision", (weight_bits, expected) => {
    expect(
      weightsGb(spec({ parameters_b: 8, context_tokens: 0, weight_bits })),
    ).toBe(expected);
  });
});

describe("kv cache", () => {
  test("matches the worked example", () => {
    expect(
      kvCacheGb(spec({ parameters_b: 8, context_tokens: 8000 })),
    ).toBeCloseTo(0.8);
  });

  test("stays 16-bit under weight quantization", () => {
    expect(
      kvCacheGb(
        spec({ parameters_b: 70, context_tokens: 8000, weight_bits: 4 }),
      ),
    ).toBeCloseTo(7);
  });

  test("shrinks only when the KV cache is quantized", () => {
    expect(
      kvCacheGb(
        spec({ parameters_b: 8, context_tokens: 8000, kv_cache_bits: 8 }),
      ),
    ).toBeCloseTo(0.4);
  });

  test("expands for 32-bit precision", () => {
    expect(
      kvCacheGb(
        spec({ parameters_b: 8, context_tokens: 8000, kv_cache_bits: 32 }),
      ),
    ).toBeCloseTo(1.6);
  });

  test("uses MoE active parameters, not total weights", () => {
    const moe = spec({
      parameters_b: 47,
      context_tokens: 8000,
      architecture: "moe",
      active_parameters_b: 1.3,
    });
    expect(weightsGb(moe)).toBeCloseTo(94);
    expect(kvCacheGb(moe)).toBeCloseTo(1.3);
    expect(totalVramGb(moe)).toBeCloseTo(106.5);
  });

  test("is zero with no context", () => {
    expect(kvCacheGb(spec({ parameters_b: 8, context_tokens: 0 }))).toBeCloseTo(
      0,
    );
  });
});

describe("task overhead", () => {
  test("is zero for inference", () => {
    expect(
      taskOverheadGb(
        spec({ parameters_b: 8, context_tokens: 8000, task: "inference" }),
      ),
    ).toBeCloseTo(0);
  });

  test("is a fixed 4.0 GB for QLoRA", () => {
    expect(
      taskOverheadGb(
        spec({
          parameters_b: 70,
          context_tokens: 8000,
          weight_bits: 4,
          task: "qlora",
        }),
      ),
    ).toBeCloseTo(4);
  });

  test("scales with parameters for full training", () => {
    expect(
      taskOverheadGb(
        spec({ parameters_b: 8, context_tokens: 8000, task: "full_training" }),
      ),
    ).toBeCloseTo(128);
  });
});

describe("total VRAM", () => {
  test("8B inference acceptance signal is 20.1 GB", () => {
    expect(
      totalVramGb(spec({ parameters_b: 8, context_tokens: 8000 })),
    ).toBeCloseTo(20.1);
  });

  test("7B full-training acceptance signal", () => {
    const s = spec({
      parameters_b: 7,
      context_tokens: 8000,
      task: "full_training",
    });
    expect(weightsGb(s)).toBeCloseTo(14);
    expect(kvCacheGb(s)).toBeCloseTo(0.7);
    expect(taskOverheadGb(s)).toBeCloseTo(112);
    expect(totalVramGb(s)).toBeCloseTo(141);
  });

  test("llama.cpp GGUF uses the additive total without a safety margin", () => {
    const s = spec({
      parameters_b: 104,
      context_tokens: 32_000,
      weight_bits: 4,
      kv_cache_bits: 32,
      runtime: "llama_cpp_gguf",
    });
    expect(weightsGb(s)).toBeCloseTo(52);
    expect(kvCacheGb(s)).toBeCloseTo(83.2);
    expect(taskOverheadGb(s)).toBeCloseTo(0);
    expect(RUNTIME_MARGINS[s.runtime]).toBeCloseTo(1);
    expect(totalVramGb(s)).toBeCloseTo(136.7);
  });

  test("llama.cpp GGUF MoE uses quantized total weights and active-parameter KV", () => {
    const s = spec({
      parameters_b: 47,
      context_tokens: 8000,
      weight_bits: 4,
      architecture: "moe",
      active_parameters_b: 1.3,
      runtime: "llama_cpp_gguf",
    });
    expect(weightsGb(s)).toBeCloseTo(23.5);
    expect(kvCacheGb(s)).toBeCloseTo(1.3);
    expect(taskOverheadGb(s)).toBeCloseTo(0);
    expect(RUNTIME_MARGINS[s.runtime]).toBeCloseTo(1);
    expect(totalVramGb(s)).toBeCloseTo(26.3);
  });

  test("a tiny FP8 full-training run rounds to a CUDA-dominated total", () => {
    const s = spec({
      parameters_b: 0.0004,
      context_tokens: 8000,
      weight_bits: 8,
      kv_cache_bits: 8,
      task: "full_training",
    });
    expect(weightsGb(s)).toBeCloseTo(0.0004);
    expect(kvCacheGb(s)).toBeCloseTo(0.00002);
    expect(taskOverheadGb(s)).toBeCloseTo(0.0064);
    expect(totalVramGb(s)).toBeCloseTo(1.7);
  });

  test.each<[DeploymentSpec, number, number, number]>([
    [
      spec({
        parameters_b: 70,
        context_tokens: 128_000,
        weight_bits: 4,
        kv_cache_bits: 8,
      }),
      35,
      56,
      101.8,
    ],
    [
      spec({
        parameters_b: 104,
        context_tokens: 32_000,
        weight_bits: 8,
        kv_cache_bits: 16,
      }),
      104,
      41.6,
      161.8,
    ],
    [
      spec({
        parameters_b: 7,
        context_tokens: 1_000_000,
        weight_bits: 8,
        kv_cache_bits: 16,
      }),
      7,
      87.5,
      105.6,
    ],
  ])("large inference regression", (s, weights, kv, total) => {
    expect(weightsGb(s)).toBeCloseTo(weights);
    expect(kvCacheGb(s)).toBeCloseTo(kv);
    expect(taskOverheadGb(s)).toBeCloseTo(0);
    expect(totalVramGb(s)).toBeCloseTo(total);
  });

  // Margin applied to worked QLoRA subtotals. The 70B case is the rounding edge where the
  // historical float-scaling round produced 52.2; the faithful round reproduces Python's 52.3.
  test.each<[DeploymentSpec, number]>([
    [
      spec({
        parameters_b: 8,
        context_tokens: 8000,
        weight_bits: 4,
        task: "qlora",
      }),
      11.3,
    ],
    [
      spec({
        parameters_b: 70,
        context_tokens: 8000,
        weight_bits: 4,
        task: "qlora",
      }),
      52.3,
    ],
    [
      spec({
        parameters_b: 3.8,
        context_tokens: 8000,
        weight_bits: 4,
        task: "qlora",
      }),
      8.6,
    ],
  ])("applies the 10%% margin to the worked subtotal", (s, expected) => {
    expect(totalVramGb(s)).toBe(expected);
  });
});

describe("roundTo reproduces Python round() half-to-even", () => {
  test("rounds exact halves to even", () => {
    expect(roundTo(2.5, 0)).toBe(2);
    expect(roundTo(3.5, 0)).toBe(4);
    expect(roundTo(1.45, 1)).toBe(1.4);
    expect(roundTo(1.35, 1)).toBe(1.4);
    expect(roundTo(-2.5, 0)).toBe(-2);
  });

  test("rounds genuine non-halves by magnitude, not banker's", () => {
    expect(roundTo(1.24, 1)).toBe(1.2);
    expect(roundTo(1.26, 1)).toBe(1.3);
    expect(roundTo(1.251, 1)).toBe(1.3); // 5 followed by a non-zero tail rounds up
    // The historical *10 scaling collapsed this onto an exact half and rounded to 14.8.
    expect(roundTo(13.5 * 1.1, 1)).toBe(14.9);
    expect(roundTo(47.5 * 1.1, 1)).toBe(52.3);
  });

  test("carries across the integer boundary", () => {
    expect(roundTo(9.95, 1)).toBe(10);
  });

  test("returns short or already-rounded inputs unchanged", () => {
    expect(roundTo(5, 1)).toBe(5);
    expect(roundTo(5.2, 1)).toBe(5.2);
  });

  test("passes through non-finite and exponential magnitudes", () => {
    expect(roundTo(Infinity, 1)).toBe(Infinity);
    expect(roundTo(NaN, 1)).toBeNaN();
    expect(roundTo(1e-7, 1)).toBe(1e-7);
  });
});
