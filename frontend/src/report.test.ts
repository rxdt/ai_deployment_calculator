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

    expect(report.totalRequiredMemory).toBe("20.4 GB");
    expect(report.minimumRawVramNeeded).toBe("24.0 GB");
    expect(report.recommendedHardware).toEqual({
      requiredMemory: "20.4 GB",
      usableVramTarget: "85%",
      minimumRawVram: "24.0 GB",
      recommendedTier:
        "24 GB: High-end consumer GPU class, e.g. RTX 3090 / RTX 4090",
      math: "20.4 GB / 85% = 24.0 GB raw VRAM",
    });
    expect(report.cloudCost).toContain("$1.00/hr static estimate");
    expect(report.accuracy).toBe("Estimated");
    expect(report.breakdown.map((row) => row.label)).toEqual([
      "Model / pipeline weights",
      "KV cache",
      "Runtime overhead",
      "Safety buffer",
    ]);
    expect(report.breakdown).not.toContainEqual(
      expect.objectContaining({ label: "Task overhead" }),
    );
    expect(report.calculation).toBe(
      "(16.0 + 1.0 + 0.0 + 0.0 + 1.5) * 1.10 = 20.4 GB",
    );
  });

  test("hides cloud cost for local runtime and marks file-size accuracy", () => {
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

    expect(report.totalRequiredMemory).toBe("77.7 GB");
    expect(report.cloudCost).toBeNull();
    expect(report.accuracy).toBe("File-size based");
    expect(report.warnings).toContain(
      "Transformer architecture is estimated from the parameter count.",
    );
  });

  test("adds conditional MoE, training, and local warnings", () => {
    const report = buildReport(
      state({
        execution_mode: "QLoRA fine-tuning",
        runtime_profile: "Local / Edge",
        moe_enabled: true,
        my_gpu_vram_gb: "24",
      }),
    );

    expect(report.warnings).toContain(
      "Training estimates include parameter state and checkpointed activations, but real runs vary by optimizer, sequence packing, and framework.",
    );
    expect(report.warnings).toContain(
      "MoE active parameters affect speed, not resident weight memory, unless expert offload or sharding is enabled.",
    );
    expect(report.warnings).toContain(
      "Local GPU fit uses usable VRAM, so drivers, displays, and other processes can still force offload.",
    );
  });

  test("does not add estimated architecture warning when exact architecture is supplied", () => {
    const report = buildReport(state({ exact_transformer_architecture: true }));

    expect(report.warnings.join(" ")).not.toContain(
      "Transformer architecture is estimated",
    );
  });

  test("adds family-specific warnings", () => {
    expect(
      buildReport(state({ workload_family: "image_diffusion" })).warnings.join(
        " ",
      ),
    ).toContain("Diffusion and video estimates");
    expect(
      buildReport(state({ workload_family: "tabular" })).warnings.join(" "),
    ).toContain("Tabular estimates");
    expect(
      buildReport(state({ workload_family: "vision" })).warnings.join(" "),
    ).toContain("Vision estimates");
    expect(
      buildReport(state({ workload_family: "audio" })).warnings.join(" "),
    ).toContain("Audio estimates");
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
        "accuracy",
        "assumptions",
        "breakdown",
        "calculation",
        "cloudCost",
        "minimumRawVramNeeded",
        "recommendedHardware",
        "speed",
        "totalRequiredMemory",
        "warnings",
      ].sort(),
    );
  });
});
