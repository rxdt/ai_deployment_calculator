// Ports tests/test_hardware.py and tests/test_deployment_plan.py: the GPU recommendation
// and deployment-plan layers (gpusNeeded, host RAM floor/steps, fit labels, primary-pick
// precedence, and optimization-note selection).

import { describe, expect, test } from "vitest";
import type { DeploymentSpec } from "./calculator";
import {
  GPU_CATALOG,
  OPTIMIZE_KV_CACHE,
  OPTIMIZE_NONE,
  OPTIMIZE_SHARDING,
  OPTIMIZE_WEIGHTS,
  deploymentPlan,
  fitLabel,
  gpusNeeded,
  recommendedHostRamGb,
  type HardwareOption,
} from "./hardware";

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

/**
 
@param count
 */
function option(count: number): HardwareOption {
  return {
    gpu: { name: "test", vram_gb: 24 },
    gpu_count: count,
    tensor_parallel: count > 1,
  };
}

/**
 
@param s
 */
function byName(s: DeploymentSpec): Record<string, HardwareOption> {
  return Object.fromEntries(
    deploymentPlan(s).options.map((po) => [po.option.gpu.name, po.option]),
  );
}

/**
 
@param s
 */
function fitByName(s: DeploymentSpec): Record<string, string> {
  return Object.fromEntries(
    deploymentPlan(s).options.map((po) => [po.option.gpu.name, po.fit]),
  );
}

describe("gpusNeeded", () => {
  test.each<[number, number, number]>([
    [24, 24, 1],
    [24.1, 24, 2],
    [48, 24, 2],
    [1, 80, 1],
  ])(
    "rounds %f GB on %f GB cards up to %i full card(s)",
    (required, vram, expected) => {
      expect(gpusNeeded(required, vram)).toBe(expected);
    },
  );
});

describe("host RAM", () => {
  test("has a 32 GB floor and rounds up in 16 GB steps", () => {
    expect(
      recommendedHostRamGb(spec({ parameters_b: 8, context_tokens: 8000 })),
    ).toBe(32);
    expect(
      recommendedHostRamGb(
        spec({
          parameters_b: 70,
          context_tokens: 8000,
          weight_bits: 4,
          task: "qlora",
        }),
      ),
    ).toBe(64);
  });
});

describe("hardware recommendations", () => {
  test("cover every named catalog GPU in order", () => {
    const names = deploymentPlan(
      spec({ parameters_b: 8, context_tokens: 8000 }),
    ).options.map((po) => po.option.gpu.name);
    expect(names).toEqual(GPU_CATALOG.map((gpu) => gpu.name));
    expect(names).toEqual([
      "T4 16GB",
      "RTX 4090",
      "L4 24GB",
      "A100 40GB",
      "A100 80GB",
      "H100 80GB",
      "B200 192GB",
    ]);
  });

  test("a small deployment shards the T4 but fits larger cards on one card", () => {
    const options = byName(spec({ parameters_b: 8, context_tokens: 8000 })); // 20.1 GB
    expect(options["T4 16GB"].gpu_count).toBe(2);
    expect(options["T4 16GB"].tensor_parallel).toBe(true);
    for (const opt of Object.values(options).slice(1)) {
      expect(opt.gpu_count).toBe(1);
      expect(opt.tensor_parallel).toBe(false);
    }
  });

  test("a large deployment shards small cards but not large ones", () => {
    const options = byName(
      spec({
        parameters_b: 70,
        context_tokens: 8000,
        weight_bits: 4,
        task: "qlora",
      }),
    );
    expect(options["T4 16GB"].gpu_count).toBe(4);
    expect(options["T4 16GB"].tensor_parallel).toBe(true);
    expect(options["RTX 4090"].gpu_count).toBe(3);
    expect(options["RTX 4090"].tensor_parallel).toBe(true);
    expect(options["L4 24GB"].gpu_count).toBe(3);
    expect(options["L4 24GB"].tensor_parallel).toBe(true);
    expect(options["A100 80GB"].gpu_count).toBe(1);
    expect(options["A100 80GB"].tensor_parallel).toBe(false);
  });
});

describe("fit labels", () => {
  test.each<[number, string]>([
    [1, "single_gpu"],
    [2, "tensor_parallel"],
    [4, "tensor_parallel"],
    [5, "large_shard"],
  ])("classify %i card(s) as %s", (count, expected) => {
    expect(fitLabel(option(count))).toBe(expected);
  });
});

describe("deployment plan", () => {
  test("primary prefers a single card and the earliest catalog GPU", () => {
    const plan = deploymentPlan(
      spec({
        parameters_b: 70,
        context_tokens: 8000,
        weight_bits: 4,
        task: "qlora",
      }),
    );
    expect(plan.primary.option.gpu_count).toBe(1);
    expect(plan.primary.option.tensor_parallel).toBe(false);
    expect(plan.primary.option.gpu.name).toBe("A100 80GB");
    expect(plan.primary.fit).toBe("single_gpu");
  });

  test("labels every catalog option and includes the primary", () => {
    const plan = deploymentPlan(
      spec({
        parameters_b: 70,
        context_tokens: 8000,
        weight_bits: 4,
        task: "qlora",
      }),
    );
    const fits = Object.fromEntries(
      plan.options.map((po) => [po.option.gpu.name, po.fit]),
    );
    expect(fits["T4 16GB"]).toBe("tensor_parallel");
    expect(fits["RTX 4090"]).toBe("tensor_parallel");
    expect(fits["L4 24GB"]).toBe("tensor_parallel");
    expect(fits["A100 80GB"]).toBe("single_gpu");
    expect(plan.options).toContain(plan.primary);
  });

  test("labels large shards when more than four cards are needed", () => {
    const fits = fitByName(
      spec({ parameters_b: 70, context_tokens: 8000, task: "full_training" }),
    );
    expect(fits["T4 16GB"]).toBe("large_shard");
    expect(fits["RTX 4090"]).toBe("large_shard");
    expect(fits["L4 24GB"]).toBe("large_shard");
  });
});

describe("optimization note", () => {
  test("lowers weight precision first", () => {
    expect(
      deploymentPlan(
        spec({ parameters_b: 8, context_tokens: 8000, weight_bits: 16 }),
      ).optimization,
    ).toBe(OPTIMIZE_WEIGHTS);
  });

  test("recommends an FP8 KV cache when weights are already minimal", () => {
    expect(
      deploymentPlan(
        spec({
          parameters_b: 8,
          context_tokens: 8000,
          weight_bits: 4,
          kv_cache_bits: 16,
        }),
      ).optimization,
    ).toBe(OPTIMIZE_KV_CACHE);
  });

  test("skips the KV note when context is zero", () => {
    expect(
      deploymentPlan(
        spec({
          parameters_b: 8,
          context_tokens: 0,
          weight_bits: 4,
          kv_cache_bits: 16,
        }),
      ).optimization,
    ).toBe(OPTIMIZE_NONE);
  });

  test("recommends avoiding sharding when the levers are exhausted", () => {
    const plan = deploymentPlan(
      spec({
        parameters_b: 405,
        context_tokens: 8000,
        weight_bits: 4,
        kv_cache_bits: 8,
      }),
    );
    expect(plan.primary.option.tensor_parallel).toBe(true);
    expect(plan.optimization).toBe(OPTIMIZE_SHARDING);
  });

  test("stays none when the primary fits one card despite weaker GPUs sharding", () => {
    const plan = deploymentPlan(
      spec({
        parameters_b: 70,
        context_tokens: 8000,
        weight_bits: 4,
        kv_cache_bits: 8,
      }),
    );
    expect(plan.primary.option.gpu_count).toBe(1);
    expect(plan.options.some((po) => po.option.tensor_parallel)).toBe(true);
    expect(plan.optimization).toBe(OPTIMIZE_NONE);
  });

  test("stays none when fitting a single card at minimal precision", () => {
    expect(
      deploymentPlan(
        spec({
          parameters_b: 8,
          context_tokens: 8000,
          weight_bits: 4,
          kv_cache_bits: 8,
        }),
      ).optimization,
    ).toBe(OPTIMIZE_NONE);
  });
});
