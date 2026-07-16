import { describe, expect, test } from "vitest";
import { GPU_LINKS } from "./hardware";
import { buildReport, specFromState } from "./report";
import { defaultState } from "./state";
import type { FormState } from "./types";

/**

@param overrides
*/
function state(overrides: Partial<FormState> = {}): FormState {
  return { ...defaultState(), ...overrides };
}

describe("buildReport", () => {
  test("builds the default report locally without network access", () => {
    const report = buildReport(state({ totalParams: "8" }));

    expect(report.totalRequiredMemory).toBe("21.0 GB");
    expect(report.minimumRawVramNeeded).toBe("24.7 GB");
    expect(report.recommendedHardware).toEqual({
      requiredMemory: "21.0 GB",
      usableVramTarget: "85%",
      usableVramOnClass: "27.2 GB",
      fitHeadroom: "6.2 GB usable margin",
      minimumRawVram: "24.7 GB",
      recommendedTier:
        "32 GB high-end consumer class, e.g. RTX 5090 / Radeon PRO W7800 / AWS Inferentia2 / Cloud TPU v6e / Cloud TPU v4",
      exampleCards: [
        {
          name: "RTX 5090",
          url: GPU_LINKS.rtx5090,
        },
        {
          name: "Radeon PRO W7800",
          url: GPU_LINKS.w7800,
        },
        {
          name: "AWS Inferentia2",
          url: GPU_LINKS.inf2,
        },
        { name: "Cloud TPU v6e", url: GPU_LINKS.tpuV6e },
        { name: "Cloud TPU v4", url: GPU_LINKS.tpuV4 },
      ],
      math: "Estimated workload memory is 21.0 GB. With a 85% usable memory target, use hardware with at least 24.7 GB of accelerator memory so the workload does not consume the entire device.",
    });
    expect(report.calculation).toBe(
      "VRAM = (weights + KV cache + activations + runtime overhead) × buffer",
    );
    expect(report.calculation).not.toContain("_GB");
    expect(report.calculationRows).toEqual([
      { label: "Model weights", value: "16.0 GB" },
      { label: "Context memory", value: "1.0 GB" },
      { label: "Activation memory", value: "0.5 GB" },
      { label: "Working memory subtotal", value: "1.5 GB" },
      { label: "Training state", value: "0.0 GB" },
      { label: "Runtime overhead", value: "1.5 GB" },
      { label: "Base subtotal before buffer", value: "19.0 GB" },
      { label: "Buffer multiplier", value: "1.10x" },
      { label: "Safety buffer", value: "1.9 GB" },
      { label: "Total required", value: "21.0 GB" },
    ]);
  });

  test("sizes a 47B MoE high-context high-concurrency server stress case", () => {
    const report = buildReport(
      state({
        totalParams: "47",
        moeEnabled: true,
        activeParams: "12",
        precision: "4-bit",
        runtimeProfile: "Server / Cloud",
        contextTokens: "32000",
        workloadSize: "4",
        kvCachePrecision: "16-bit",
      }),
    );

    expect(report.totalRequiredMemory).toBe("80.7 GB");
    expect(report.minimumRawVramNeeded).toBe("94.9 GB");
    expect(report.recommendedHardware.recommendedTier).toBe(
      "95 GB Cloud TPU class, e.g. Cloud TPU v5p",
    );
    // MoE compute weight = active 12B * 0.5 * 1.15 = 6.9 GB; TPU v5p 2765 / 6.9 = 400.7.
    expect(report.speed).toBe("400.7 tokens/second");
    expect(report.calculationRows).toEqual(
      expect.arrayContaining([
        { label: "Working memory subtotal", value: "44.9 GB" },
        { label: "Total required", value: "80.7 GB" },
      ]),
    );
  });

  test("MacBook-friendly regression case: 700M 4-bit local at 2k context", () => {
    const report = buildReport(
      state({
        workloadFamily: "text_generation",
        executionMode: "Inference",
        totalParams: "700",
        parameterUnit: "M",
        moeEnabled: false,
        precision: "4-bit",
        runtimeProfile: "Local / Edge",
        contextTokens: "2048",
        workloadSize: "1",
        kvCachePrecision: "16-bit",
      }),
    );

    expect(report.totalRequiredMemory).toBe("1.5 GB");
    expect(report.minimumRawVramNeeded).toBe("1.7 GB");
    expect(report.recommendedHardware.recommendedTier).toBe(
      "8 GB consumer class, e.g. RTX 4060 / older 8 GB GPUs",
    );
  });

  test("sharding toggle switches a 62B local fit between single-GPU and sharded tiers", () => {
    const base = {
      totalParams: "62",
      precision: "16-bit" as const,
      runtimeProfile: "Local / Edge" as const,
    };

    const singleGpu = buildReport(state(base));
    expect(singleGpu.minimumRawVramNeeded).toBe("143.6 GB");
    expect(singleGpu.recommendedHardware.recommendedTier).toBe(
      "180 GB datacenter class, e.g. B200",
    );
    expect(singleGpu.warnings.join(" ")).not.toContain("sharded-tier");
    // A single-GPU fit needs no parallelism guidance.
    expect(singleGpu.parallelismStrategies).toEqual([]);

    const sharded = buildReport(
      state({ ...base, memoryShardingEnabled: true }),
    );
    expect(sharded.recommendedHardware.recommendedTier).toBe(
      "160 GB sharded datacenter class, e.g. 2x 80 GB GPUs with tensor/model parallelism",
    );
    expect(sharded.warnings).toContain(
      "Rough sharded-tier speed estimate. Assumes memory sharding / model parallelism works.",
    );
    // A sharded recommendation surfaces the framework links for splitting the
    // workload across cards.
    expect(sharded.parallelismStrategies).toEqual([
      { label: "FSDP", url: "https://pytorch.org/docs/stable/fsdp.html" },
      { label: "ZeRO", url: "https://www.deepspeed.ai/tutorials/zero/" },
      { label: "vLLM", url: "https://docs.vllm.ai/en/latest/" },
      {
        label: "TP",
        url: "https://huggingface.co/docs/transformers/en/perf_train_gpu_many#tensor-parallelism",
      },
    ]);
  });

  test("names the sharded tier that fits when a single-GPU overflow could shard", () => {
    const report = buildReport(
      state({
        totalParams: "90",
        precision: "16-bit",
        runtimeProfile: "Local / Edge",
      }),
    );

    expect(report.recommendedHardware.recommendedTier).toBe(
      "No single-accelerator fit. Enable memory sharding to split the model across a 320 GB sharded datacenter class (4x 80 GB GPUs with tensor/model parallelism), the smallest standard pool that covers this estimate. Slower alternative: offload part of the model to CPU memory.",
    );
    expect(report.recommendedHardware.usableVramOnClass).toBe("n/a");
    expect(report.recommendedHardware.fitHeadroom).toBe("n/a");
    expect(report.speed).toMatch(/tokens\/second/u);
    expect(report.warnings).toContain(
      "Rough sharded-tier speed estimate. Assumes memory sharding / model parallelism works.",
    );
    // A single-GPU overflow (sharding disabled) still needs multi-GPU, so the
    // parallelism strategies surface even before the user enables sharding.
    expect(report.parallelismStrategies.map((s) => s.label)).toEqual([
      "FSDP",
      "ZeRO",
      "vLLM",
      "TP",
    ]);
  });

  test("uses the known file size for local runtime", () => {
    const report = buildReport(
      state({
        runtimeProfile: "Local / Edge",
        knownModelFileSizeGb: "52",
        totalParams: "104",
        contextTokens: "32000",
        precision: "4-bit",
        kvCachePrecision: "32-bit",
      }),
    );

    expect(report.totalRequiredMemory).toBe("84.1 GB");
    expect(report.warnings.join(" ")).not.toContain(
      "Transformer architecture is estimated",
    );
  });

  test("flags a Local / Edge estimate that outgrows common local PCIe cards", () => {
    const localWarning =
      "Beyond typical local hardware: this needs more than 96 GB of advertised VRAM, larger than any common local PCIe card. Local routes are a large unified-memory Mac or sharding across multiple GPUs.";
    // 70B fp16 needs ~147 GB usable: the tier engine recommends a datacenter
    // class, so Local / Edge must say what that means for a local machine.
    const local = buildReport(
      state({ runtimeProfile: "Local / Edge", totalParams: "70" }),
    );
    expect(local.warnings).toContain(localWarning);

    // The same deployment on Server / Cloud is a normal datacenter fit, and a
    // small local model (88 GB raw ceiling) stays under the local threshold.
    const server = buildReport(
      state({ runtimeProfile: "Server / Cloud", totalParams: "70" }),
    );
    expect(server.warnings).not.toContain(localWarning);
    const smallLocal = buildReport(
      state({ runtimeProfile: "Local / Edge", totalParams: "30" }),
    );
    expect(smallLocal.warnings).not.toContain(localWarning);
  });

  test("adds conditional MoE and training warnings", () => {
    const report = buildReport(
      state({
        executionMode: "QLoRA fine-tuning",
        runtimeProfile: "Local / Edge",
        moeEnabled: true,
      }),
    );

    expect(report.warnings).toContain(
      "Training estimates include parameter state and checkpointed activations, but real runs vary by optimizer, sequence packing, and framework.",
    );
    // The MoE routing caveat is a methodology note, so it renders as an
    // assumption bullet rather than a warning.
    expect(report.warnings).not.toContainEqual(
      expect.stringContaining("MoE active parameters"),
    );
    expect(report.assumptions.map((row) => row.label)).toContain(
      "MoE active parameters affect speed, not resident weight memory, unless expert offload or sharding is enabled.",
    );
  });

  test("ignores MoE state for families without MoE controls", () => {
    const plain = buildReport(state({ workloadFamily: "vision" }));
    const hiddenMoeState = state({
      workloadFamily: "vision",
      moeEnabled: true,
      activeParams: "0.1",
    });
    const hiddenMoe = buildReport(hiddenMoeState);

    expect(specFromState(hiddenMoeState).activeParamsB).toBe(7);
    expect(hiddenMoe.speed).toBe(plain.speed);
    expect(hiddenMoe.warnings).toEqual(plain.warnings);
  });

  test("keeps family-specific guidance out of warnings", () => {
    expect(
      buildReport(state({ workloadFamily: "image_diffusion" })).warnings.join(
        " ",
      ),
    ).not.toContain("Diffusion and video estimates");
    expect(
      buildReport(state({ workloadFamily: "tabular" })).warnings.join(" "),
    ).not.toContain("Tabular estimates");
    expect(
      buildReport(state({ workloadFamily: "tabular" })).warnings.join(" "),
    ).not.toContain("Transformer architecture is estimated");
    expect(
      buildReport(state({ workloadFamily: "vision_language" })).warnings.join(
        " ",
      ),
    ).not.toContain("Transformer architecture is estimated");
    expect(
      buildReport(state({ workloadFamily: "vision" })).warnings.join(" "),
    ).not.toContain("Vision estimates");
    expect(
      buildReport(state({ workloadFamily: "audio" })).warnings.join(" "),
    ).not.toContain("Audio estimates");
  });

  test("specFromState maps execution mode instead of legacy training flags", () => {
    expect(
      specFromState(state({ executionMode: "Inference" })).executionMode,
    ).toBe("Inference");
    expect(
      specFromState(state({ executionMode: "LoRA fine-tuning" })).executionMode,
    ).toBe("LoRA fine-tuning");
    expect(
      specFromState(state({ executionMode: "QLoRA fine-tuning" }))
        .executionMode,
    ).toBe("QLoRA fine-tuning");
    expect(
      specFromState(state({ executionMode: "Full training" })).executionMode,
    ).toBe("Full training");
  });

  test("payload exposes only the frontend report contract keys", () => {
    expect(
      Object.keys(buildReport(state())).sort((a, b) => a.localeCompare(b)),
    ).toEqual(
      [
        "assumptions",
        "calculation",
        "calculationNumbers",
        "calculationRows",
        "minimumRawVramNeeded",
        "parallelismStrategies",
        "recommendedHardware",
        "speed",
        "statChips",
        "totalRequiredMemory",
        "warnings",
      ].sort((a, b) => a.localeCompare(b)),
    );
  });

  test("omits parallelism guidance for a workload that fits one card", () => {
    // The default 7B inference workload fits a single 24 GB card, so no sharding
    // strategies apply and the callout stays empty.
    expect(buildReport(state()).parallelismStrategies).toEqual([]);
  });

  test("does not expose the retired confidence field for any workload family", () => {
    const workloadFamilies: readonly FormState["workloadFamily"][] = [
      "text_generation",
      "text_encoder",
      "encoder_decoder",
      "vision",
      "vision_language",
      "image_diffusion",
      "video_generation",
      "audio",
      "tabular",
      "custom",
    ];

    for (const workloadFamily of workloadFamilies) {
      expect(buildReport(state({ workloadFamily }))).not.toHaveProperty(
        "confidence",
      );
    }
  });

  test("formula numbers substitute the real values into the mode's terms", () => {
    // Inference: (weights + KV cache + activations + overhead) × buffer.
    expect(buildReport(state()).calculationNumbers).toBe(
      "18.8 GB ≈ (14.0 + 1.0 + 0.5 + 1.5) GB × 1.10",
    );
    // Training modes carry training state instead of KV cache and use the
    // 1.25 training buffer.
    const training = buildReport(state({ executionMode: "Full training" }));
    expect(training.calculationNumbers).toContain("+ 98.0 +");
    expect(training.calculationNumbers).toMatch(/ GB × 1\.25$/u);
  });

  test("assumptions are methodology notes, not an echo of the user's inputs", () => {
    const notes = buildReport(state()).assumptions.map((row) => row.label);

    // Default 7B inference decoder: overhead + KV precision + VRAM reserve.
    expect(notes).toEqual([
      "Runtime / CUDA overhead estimated at a fixed 1.5 GB for this mode and runtime profile.",
      "KV cache precision: 16-bit.",
      "Activation memory estimated at fp16 compute precision.",
      "15% of advertised card VRAM reserved for the driver + CUDA context.",
    ]);
    // The inputs the user typed are not repeated as assumption rows, and every
    // note renders as a label-only bullet (no value cell).
    for (const row of buildReport(state()).assumptions) {
      expect(row.value).toBe("");
    }
  });

  test("assumptions drop the KV note for workloads without a decoder KV cache", () => {
    const notes = buildReport(
      state({ workloadFamily: "vision" }),
    ).assumptions.map((row) => row.label);
    expect(notes).not.toContainEqual(expect.stringContaining("KV cache"));
  });

  test("training assumptions name the combined training state and checkpointing", () => {
    const trained = buildReport(
      state({ executionMode: "Full training", gradientCheckpointing: true }),
    ).assumptions.map((row) => row.label);
    expect(trained).toContainEqual(
      "Training state sized for Full training: fp32 master weights, gradients, and optimizer state.",
    );
    // Checkpointing shrinks activations, not the training state, so it reads
    // as its own methodology note.
    expect(trained).toContainEqual(
      "Activation memory assumes gradient checkpointing (recompute).",
    );

    const noCheckpoint = buildReport(
      state({
        executionMode: "LoRA fine-tuning",
        gradientCheckpointing: false,
      }),
    ).assumptions.map((row) => row.label);
    expect(noCheckpoint).toContainEqual(
      "Training state sized for LoRA: adapter weights, gradients, and optimizer state.",
    );
    expect(noCheckpoint).not.toContainEqual(
      expect.stringContaining("gradient checkpointing"),
    );
  });

  test("assumptions note sharding and a known model file size when set", () => {
    const notes = buildReport(
      state({ memoryShardingEnabled: true, knownModelFileSizeGb: "52" }),
    ).assumptions.map((row) => row.label);
    expect(notes).toContainEqual(
      "Memory sharding assumed across the recommended GPU pool (tensor / model parallelism).",
    );
    expect(notes).toContainEqual(
      "Model weight memory taken from the provided known file size, not the parameter estimate.",
    );
  });

  test("sizes training activations for a vision-language workload", () => {
    // Exercises the vision-language training-token path (text context + per-image
    // tokens) that feeds training activation memory for multimodal decoders.
    const report = buildReport(
      state({
        workloadFamily: "vision_language",
        executionMode: "Full training",
        totalParams: "8",
        textContextTokens: "4000",
        imageCount: "2",
      }),
    );
    expect(report.calculationRows).toContainEqual(
      expect.objectContaining({ label: "Total required" }),
    );
  });

  test("never surfaces pricing or cost language", () => {
    const haystack = JSON.stringify(
      buildReport(state({ totalParams: "70" })),
    ).toLowerCase();
    expect(haystack).not.toMatch(/\$|\/hr\b|per hour|\bcost\b|\bprice\b/u);
  });
});

describe("headline stat chips", () => {
  test("headlines weights, KV cache, concurrency, and spare for decoder inference", () => {
    const chips = buildReport(state({ totalParams: "8" })).statChips;

    // Weights and KV cache mirror the breakdown's two largest text-generation
    // terms; concurrency is the batch count; spare is the fit meter's leftover.
    expect(chips).toEqual([
      { label: "Model Weights", value: "16.0 GB" },
      { label: "KV Cache", value: "1.0 GB" },
      { label: "Concurrency", value: "1" },
      { label: "Spare", value: "23%" },
    ]);
  });

  test("swaps KV cache for activations and concurrency for micro batch when training", () => {
    const chips = buildReport(
      state({ executionMode: "Full training", workloadSize: "4" }),
    ).statChips;

    // Training has no decoder KV cache, so the working-memory chip reads
    // activations, and the batch chip reads the training micro-batch size.
    expect(chips[1]?.label).toBe("Activations");
    expect(chips[2]).toEqual({ label: "Micro Batch", value: "4" });
  });

  test("reads activations for a non-decoder family such as image diffusion", () => {
    const chips = buildReport(
      state({ workloadFamily: "image_diffusion", totalParams: "3.5" }),
    ).statChips;

    expect(chips[1]?.label).toBe("Activations");
    expect(chips[2]?.label).toBe("Concurrency");
  });

  test("shows an em dash for spare when no single card class fits", () => {
    const chips = buildReport(state({ totalParams: "0" })).statChips;

    // With no model there is no usable-VRAM budget to divide, so the fit meter
    // yields nothing and the spare chip degrades to a neutral placeholder.
    expect(chips[3]).toEqual({ label: "Spare", value: "–" });
  });
});
