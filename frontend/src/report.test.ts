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
      minimumRawVram: "25.1 GB",
      recommendedTier:
        "48 GB physical VRAM: RTX 6000 Ada, L40S, RTX A6000, or A40",
      math: "Estimated workload memory is 21.3 GB. With a 85% usable VRAM target, use a GPU with at least 25.1 GB of physical VRAM so the workload does not consume the entire card.",
    });
    expect(report.accuracy).toBe("Estimated");
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

  test("marks file-size accuracy for local runtime", () => {
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
    expect(report.accuracy).toBe("File-size based");
    expect(report.warnings).toContain(
      "Transformer architecture is estimated from the parameter count.",
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
    expect(report.breakdown[0]?.label).toBe("QLoRA base model memory");
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
      buildReport(state({ workload_family: "tabular" })).warnings.join(" "),
    ).not.toContain("Transformer architecture is estimated");
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
        "minimumRawVramNeeded",
        "recommendedHardware",
        "speed",
        "totalRequiredMemory",
        "warnings",
      ].sort(),
    );
  });
});
