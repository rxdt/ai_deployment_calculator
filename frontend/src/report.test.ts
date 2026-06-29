import { describe, expect, test } from "vitest";
import { buildReport, specFromState } from "./report";
import { defaultState } from "./state";
import type { FormState } from "./types";

function state(overrides: Partial<FormState> = {}): FormState {
  return { ...defaultState(), ...overrides };
}

describe("buildReport", () => {
  test("builds the default report locally without network access", () => {
    const report = buildReport(state({ total_params: "8" }));

    expect(report.totalRequiredMemory).toBe("21.3 GB");
    expect(report.minimumRawVramNeeded).toBe("25.1 GB");
    expect(report.recommendedHardware).toEqual({
      requiredMemory: "21.3 GB",
      usableVramTarget: "85%",
      usableVramOnClass: "40.8 GB",
      fitHeadroom: "19.5 GB usable margin",
      minimumRawVram: "25.1 GB",
      recommendedTier:
        "48 GB workstation / pro inference class, e.g. RTX A6000 / RTX 6000 Ada / L40S class",
      math: "Estimated workload memory is 21.3 GB. With a 85% usable VRAM target, use a GPU with at least 25.1 GB of physical VRAM so the workload does not consume the entire card.",
    });
    expect(report.breakdown.map((row) => row.label)).toEqual([
      "Model memory",
      "Context memory",
      "Activation memory",
      "Runtime reserve",
      "Safety margin",
    ]);
    expect(report.breakdown).not.toContainEqual(
      expect.objectContaining({ label: "Task overhead" }),
    );
    expect(report.calculation).toBe(
      "(16.0 + 1.0 + 0.8 + 0.0 + 1.5) * 1.10 = 21.3 GB",
    );
  });

  test("sizes a 47B MoE high-context high-concurrency server stress case", () => {
    const report = buildReport(
      state({
        total_params: "47",
        moe_enabled: true,
        active_params: "12",
        precision: "4-bit",
        runtime_profile: "Server / Cloud",
        context_tokens: "32000",
        workload_size: "4",
        kv_cache_precision: "16-bit",
      }),
    );

    expect(report.totalRequiredMemory).toBe("79.0 GB");
    expect(report.minimumRawVramNeeded).toBe("92.9 GB");
    expect(report.recommendedHardware.recommendedTier).toBe(
      "141 GB datacenter class, e.g. H200 class",
    );
    // MoE compute weight = active 12B * 0.5 * 1.15 = 6.9 GB; H200 4800 / 6.9 = 695.7.
    expect(report.speed).toBe("695.7 tokens/second");
    expect(report.breakdown).toEqual([
      { label: "Model memory", value: "27.0 GB" },
      { label: "Context memory", value: "41.9 GB" },
      { label: "Activation memory", value: "1.4 GB" },
      { label: "Runtime reserve", value: "1.5 GB" },
      { label: "Safety margin", value: "7.2 GB" },
    ]);
    expect(report.calculation).toBe(
      "(27.0 + 41.9 + 1.4 + 0.0 + 1.5) * 1.10 = 79.0 GB",
    );
  });

  test("MacBook-friendly regression case: 700M 4-bit local at 2k context", () => {
    const report = buildReport(
      state({
        workload_family: "text_generation",
        execution_mode: "Inference",
        total_params: "700",
        parameter_unit: "M",
        moe_enabled: false,
        precision: "4-bit",
        runtime_profile: "Local / Edge",
        context_tokens: "2048",
        workload_size: "1",
        kv_cache_precision: "16-bit",
      }),
    );

    expect(report.totalRequiredMemory).toBe("1.0 GB");
    expect(report.minimumRawVramNeeded).toBe("1.1 GB");
    // Scratch (0.01), training (0), and safety margin (0) round to 0.0 GB and hide.
    expect(report.breakdown).toEqual([
      { label: "Model memory", value: "0.4 GB" },
      { label: "Context memory", value: "0.1 GB" },
      { label: "Runtime reserve", value: "0.5 GB" },
    ]);
    expect(report.recommendedHardware.recommendedTier).toBe(
      "8 GB consumer class, e.g. RTX 4060 / older 8 GB GPUs",
    );
  });

  test("sharding toggle switches a 62B local fit between single-GPU and sharded tiers", () => {
    const base = {
      total_params: "62",
      precision: "16-bit" as const,
      runtime_profile: "Local / Edge" as const,
    };

    const singleGpu = buildReport(state(base));
    expect(singleGpu.minimumRawVramNeeded).toBe("145.3 GB");
    expect(singleGpu.recommendedHardware.recommendedTier).toBe(
      "180 GB datacenter class, e.g. B200 class",
    );
    expect(singleGpu.warnings.join(" ")).not.toContain("sharded-tier");

    const sharded = buildReport(
      state({ ...base, memory_sharding_enabled: true }),
    );
    expect(sharded.recommendedHardware.recommendedTier).toBe(
      "160 GB sharded datacenter class, e.g. 2x 80 GB GPUs with tensor/model parallelism",
    );
    expect(sharded.warnings).toContain(
      "Rough sharded-tier speed estimate. Assumes memory sharding / model parallelism works.",
    );
  });

  test("overflows to no-single-GPU guidance when nothing in the table fits", () => {
    const report = buildReport(
      state({
        total_params: "90",
        precision: "16-bit",
        runtime_profile: "Local / Edge",
      }),
    );

    expect(report.recommendedHardware.recommendedTier).toBe(
      "No single-GPU fit. Enable memory sharding or use offload.",
    );
    expect(report.speed).toMatch(/tokens\/second/u);
  });

  test("uses the known file size for local runtime", () => {
    const report = buildReport(
      state({
        runtime_profile: "Local / Edge",
        known_model_file_size_gb: "52",
        total_params: "104",
        context_tokens: "32000",
        precision: "4-bit",
        kv_cache_precision: "32-bit",
      }),
    );

    expect(report.totalRequiredMemory).toBe("79.2 GB");
    expect(report.warnings.join(" ")).not.toContain(
      "Transformer architecture is estimated",
    );
  });

  test("hides breakdown rows that round to 0.0 GB", () => {
    const report = buildReport(
      state({
        workload_family: "tabular",
        total_params: "0.001",
        rows_per_batch: "1",
        features: "1",
      }),
    );

    expect(report.breakdown).not.toContainEqual(
      expect.objectContaining({
        label: "Activation memory",
        value: "0.0 GB",
      }),
    );
  });

  test("adds conditional MoE and training warnings", () => {
    const report = buildReport(
      state({
        execution_mode: "QLoRA fine-tuning",
        runtime_profile: "Local / Edge",
        moe_enabled: true,
      }),
    );

    expect(report.warnings).toContain(
      "Training estimates include parameter state and checkpointed activations, but real runs vary by optimizer, sequence packing, and framework.",
    );
    expect(report.warnings).toContain(
      "MoE active parameters affect speed, not resident weight memory, unless expert offload or sharding is enabled.",
    );
    expect(report.breakdown[0]?.label).toBe("QLoRA base model memory");
  });

  test("keeps family-specific guidance out of warnings", () => {
    expect(
      buildReport(state({ workload_family: "image_diffusion" })).warnings.join(
        " ",
      ),
    ).not.toContain("Diffusion and video estimates");
    expect(
      buildReport(state({ workload_family: "tabular" })).warnings.join(" "),
    ).not.toContain("Tabular estimates");
    expect(
      buildReport(state({ workload_family: "tabular" })).warnings.join(" "),
    ).not.toContain("Transformer architecture is estimated");
    expect(
      buildReport(state({ workload_family: "vision_language" })).warnings.join(
        " ",
      ),
    ).not.toContain("Transformer architecture is estimated");
    expect(
      buildReport(state({ workload_family: "vision" })).warnings.join(" "),
    ).not.toContain("Vision estimates");
    expect(
      buildReport(state({ workload_family: "audio" })).warnings.join(" "),
    ).not.toContain("Audio estimates");
  });

  test("specFromState maps execution mode instead of legacy training flags", () => {
    expect(
      specFromState(state({ execution_mode: "Inference" })).executionMode,
    ).toBe("Inference");
    expect(
      specFromState(state({ execution_mode: "LoRA fine-tuning" }))
        .executionMode,
    ).toBe("LoRA fine-tuning");
    expect(
      specFromState(state({ execution_mode: "QLoRA fine-tuning" }))
        .executionMode,
    ).toBe("QLoRA fine-tuning");
    expect(
      specFromState(state({ execution_mode: "Full training" })).executionMode,
    ).toBe("Full training");
  });

  test("payload exposes only the frontend report contract keys", () => {
    expect(Object.keys(buildReport(state())).sort()).toEqual(
      [
        "assumptions",
        "breakdown",
        "calculation",
        "minimumRawVramNeeded",
        "recommendedHardware",
        "speed",
        "totalRequiredMemory",
        "warnings",
      ].sort(),
    );
  });

  test("assumptions show resolved KV head values", () => {
    expect(buildReport(state()).assumptions).toContainEqual({
      label: "KV heads used",
      value: "8",
    });
    expect(buildReport(state()).assumptions).toContainEqual({
      label: "Conservative KV heads",
      value: "32",
    });
    expect(buildReport(state()).assumptions).not.toContainEqual({
      label: "Conservative KV heads",
      value: "attention_heads",
    });
  });

  test("never surfaces pricing or cost language", () => {
    const haystack = JSON.stringify(
      buildReport(state({ total_params: "70" })),
    ).toLowerCase();
    expect(haystack).not.toMatch(/\$|\/hr\b|per hour|\bcost\b|\bprice\b/u);
  });
});
