import { describe, expect, test } from "vitest";
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

    expect(report.totalRequiredMemory).toBe("21.3 GB");
    expect(report.minimumRawVramNeeded).toBe("25.1 GB");
    expect(report.recommendedHardware).toEqual({
      requiredMemory: "21.3 GB",
      usableVramTarget: "85%",
      usableVramOnClass: "40.8 GB",
      fitHeadroom: "19.5 GB usable margin",
      minimumRawVram: "25.1 GB",
      recommendedTier:
        "48 GB workstation / pro inference class, e.g. RTX A6000 / RTX 6000 Ada / L40S",
      exampleCards: [
        {
          name: "RTX A6000",
          url: "https://www.nvidia.com/en-us/design-visualization/rtx-a6000/",
        },
        {
          name: "RTX 6000 Ada",
          url: "https://www.nvidia.com/en-us/design-visualization/rtx-6000/",
        },
        { name: "L40S", url: "https://www.nvidia.com/en-us/data-center/l40s/" },
      ],
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
      "Required_GB = (Weights_GB + Working_Memory_GB + Training_State_GB + Runtime_Overhead_GB) * Buffer; Safety_Buffer_GB = Base_GB * (Buffer - 1)",
    );
    expect(report.calculation).not.toContain("Task_Overhead");
    expect(report.calculationRows).toEqual([
      { label: "Weights_GB (model memory)", value: "16.0 GB" },
      { label: "Context memory", value: "1.0 GB" },
      { label: "Activation memory", value: "0.8 GB" },
      { label: "Working_Memory_GB subtotal", value: "1.8 GB" },
      { label: "Training_State_GB", value: "0.0 GB" },
      { label: "Runtime_Overhead_GB", value: "1.5 GB" },
      { label: "Base_GB before buffer", value: "19.3 GB" },
      { label: "Buffer multiplier", value: "1.10x" },
      { label: "Safety_Buffer_GB", value: "1.9 GB" },
      { label: "Required_GB", value: "21.3 GB" },
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

    expect(report.totalRequiredMemory).toBe("79.0 GB");
    expect(report.minimumRawVramNeeded).toBe("92.9 GB");
    expect(report.recommendedHardware.recommendedTier).toBe(
      "141 GB datacenter class, e.g. H200",
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
    expect(report.calculationRows).toEqual(
      expect.arrayContaining([
        { label: "Working_Memory_GB subtotal", value: "43.3 GB" },
        { label: "Required_GB", value: "79.0 GB" },
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
      totalParams: "62",
      precision: "16-bit" as const,
      runtimeProfile: "Local / Edge" as const,
    };

    const singleGpu = buildReport(state(base));
    expect(singleGpu.minimumRawVramNeeded).toBe("145.3 GB");
    expect(singleGpu.recommendedHardware.recommendedTier).toBe(
      "180 GB datacenter class, e.g. B200",
    );
    expect(singleGpu.warnings.join(" ")).not.toContain("sharded-tier");

    const sharded = buildReport(
      state({ ...base, memoryShardingEnabled: true }),
    );
    expect(sharded.recommendedHardware.recommendedTier).toBe(
      "160 GB sharded datacenter class, e.g. 2x 80 GB GPUs with tensor/model parallelism",
    );
    expect(sharded.warnings).toContain(
      "Rough sharded-tier speed estimate. Assumes memory sharding / model parallelism works.",
    );
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
      "No single-GPU fit. Enable memory sharding to fit a 320 GB sharded datacenter class (4x 80 GB GPUs with tensor/model parallelism), or use offload.",
    );
    expect(report.recommendedHardware.usableVramOnClass).toBe("n/a");
    expect(report.recommendedHardware.fitHeadroom).toBe("n/a");
    expect(report.speed).toMatch(/tokens\/second/u);
    expect(report.warnings).toContain(
      "Rough sharded-tier speed estimate. Assumes memory sharding / model parallelism works.",
    );
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

    expect(report.totalRequiredMemory).toBe("79.2 GB");
    expect(report.warnings.join(" ")).not.toContain(
      "Transformer architecture is estimated",
    );
  });

  test("hides breakdown rows that round to 0.0 GB", () => {
    const report = buildReport(
      state({
        workloadFamily: "tabular",
        totalParams: "0.001",
        rowsPerBatch: "1",
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
        executionMode: "QLoRA fine-tuning",
        runtimeProfile: "Local / Edge",
        moeEnabled: true,
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
        "breakdown",
        "calculation",
        "calculationRows",
        "minimumRawVramNeeded",
        "recommendedHardware",
        "speed",
        "statChips",
        "totalRequiredMemory",
        "warnings",
      ].sort((a, b) => a.localeCompare(b)),
    );
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

  test("surfaces decoder KV assumptions only for autoregressive transformer families in inference", () => {
    const kvFamilies: readonly FormState["workloadFamily"][] = [
      "text_generation",
      "encoder_decoder",
      "vision_language",
    ];
    const noKvFamilies: readonly FormState["workloadFamily"][] = [
      "text_encoder",
      "vision",
      "image_diffusion",
      "video_generation",
      "audio",
      "tabular",
      "custom",
    ];
    for (const workloadFamily of kvFamilies) {
      const rows = buildReport(
        state({ workloadFamily, executionMode: "Inference" }),
      ).assumptions;
      expect(rows).toContainEqual(
        expect.objectContaining({ label: "KV Cache precision" }),
      );
    }
    for (const workloadFamily of noKvFamilies) {
      const rows = buildReport(
        state({ workloadFamily, executionMode: "Inference" }),
      ).assumptions;
      expect(rows).not.toContainEqual(
        expect.objectContaining({ label: "KV Cache precision" }),
      );
    }
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

  test("assumptions surface decoder KV scaling inputs by workload family", () => {
    expect(
      buildReport(
        state({
          workloadFamily: "text_generation",
          contextTokens: "32000",
          workloadSize: "4",
        }),
      ).assumptions,
    ).toEqual(
      expect.arrayContaining([
        { label: "Context tokens", value: "32000" },
        { label: "Concurrent batch requests", value: "4" },
      ]),
    );

    expect(
      buildReport(
        state({
          workloadFamily: "encoder_decoder",
          outputTokens: "512",
          workloadSize: "2",
        }),
      ).assumptions,
    ).toEqual(
      expect.arrayContaining([
        { label: "Output tokens", value: "512" },
        { label: "Concurrent batch requests", value: "2" },
      ]),
    );

    expect(
      buildReport(
        state({
          workloadFamily: "vision_language",
          textContextTokens: "12000",
          imageCount: "3",
          imageWidth: "1280",
          imageHeight: "720",
        }),
      ).assumptions,
    ).toEqual(
      expect.arrayContaining([
        { label: "Text context tokens", value: "12000" },
        { label: "Image count", value: "3" },
        { label: "Image size", value: "1280 x 720" },
      ]),
    );
  });

  /**
  Non-decoder workload families use family-specific activation inputs. The report
  should expose those inputs so the assumption panel explains the calculated size.
  */
  test("assumptions surface non-KV workload scaling inputs by family", () => {
    const cases: readonly (readonly [
      string,
      Partial<FormState>,
      readonly { readonly label: string; readonly value: string }[],
    ])[] = [
      [
        "encoder-decoder training tokens",
        {
          workloadFamily: "encoder_decoder",
          executionMode: "LoRA fine-tuning",
          inputTokens: "1536",
          outputTokens: "384",
        },
        [
          { label: "Input tokens", value: "1536" },
          { label: "Output tokens", value: "384" },
        ],
      ],
      [
        "vision image size",
        {
          workloadFamily: "vision",
          imageWidth: "640",
          imageHeight: "480",
          workloadSize: "2",
        },
        [
          { label: "Image size", value: "640 x 480" },
          { label: "Concurrent batch requests", value: "2" },
        ],
      ],
      [
        "vision-language training multimodal shape",
        {
          workloadFamily: "vision_language",
          executionMode: "LoRA fine-tuning",
          textContextTokens: "6000",
          imageCount: "2",
          imageWidth: "1024",
          imageHeight: "768",
        },
        [
          { label: "Text context tokens", value: "6000" },
          { label: "Image count", value: "2" },
          { label: "Image size", value: "1024 x 768" },
        ],
      ],
      [
        "video shape",
        {
          workloadFamily: "video_generation",
          videoResolution: "1080p",
          videoFrames: "121",
        },
        [
          { label: "Video resolution", value: "1080p" },
          { label: "Video frames", value: "121" },
        ],
      ],
      [
        "audio duration",
        { workloadFamily: "audio", audioSeconds: "45" },
        [{ label: "Audio seconds", value: "45" }],
      ],
      [
        "tabular batch shape",
        {
          workloadFamily: "tabular",
          rowsPerBatch: "5000",
          features: "300",
        },
        [
          { label: "Rows per batch", value: "5000" },
          { label: "Features", value: "300" },
        ],
      ],
      [
        "custom multiplier",
        { workloadFamily: "custom", inputSizeMultiplier: "3" },
        [{ label: "Input size multiplier", value: "3" }],
      ],
    ];

    for (const [scenario, overrides, expectedRows] of cases) {
      expect(buildReport(state(overrides)).assumptions, scenario).toEqual(
        expect.arrayContaining([...expectedRows]),
      );
    }
  });

  /**
  Direct state can contain a zero batch count. The assumption row should match the
  resolved calculation size instead of echoing the stale raw form value.
  */
  test("training assumptions show the resolved micro batch size", () => {
    expect(
      buildReport(
        state({
          executionMode: "LoRA fine-tuning",
          workloadSize: "0",
          contextTokens: "2048",
        }),
      ).assumptions,
    ).toEqual(
      expect.arrayContaining([
        { label: "Context tokens", value: "2048" },
        { label: "Micro batch size", value: "1" },
      ]),
    );
  });

  /**
  Malformed direct state can carry an unknown workload family at runtime. The
  report should still fall back to the custom workload assumption rows.
  */
  test("malformed workload family uses custom assumption rows", () => {
    const malformed = state({ inputSizeMultiplier: "4" });
    Object.defineProperty(malformed, "workloadFamily", { value: "unknown" });

    expect(buildReport(malformed).assumptions).toEqual(
      expect.arrayContaining([{ label: "Input size multiplier", value: "4" }]),
    );
  });

  /**
  Direct report callers may bypass URL normalization. Assumption rows should
  still show the numeric values used by the formulas rather than raw malformed
  strings.
  */
  test("assumptions show resolved numeric fallbacks for malformed direct state", () => {
    expect(
      buildReport(state({ contextTokens: "bad", workloadSize: "0" }))
        .assumptions,
    ).toEqual(
      expect.arrayContaining([
        { label: "Context tokens", value: "8000" },
        { label: "Concurrent batch requests", value: "1" },
      ]),
    );

    expect(
      buildReport(
        state({
          workloadFamily: "vision_language",
          textContextTokens: "bad",
          imageCount: "-2",
          imageWidth: "bad",
          imageHeight: "-1",
        }),
      ).assumptions,
    ).toEqual(
      expect.arrayContaining([
        { label: "Text context tokens", value: "4000" },
        { label: "Image count", value: "1" },
        { label: "Image size", value: "1024 x 1024" },
      ]),
    );
  });

  test("assumptions surface advanced inputs that change memory or hardware selection", () => {
    const report = buildReport(
      state({
        executionMode: "QLoRA fine-tuning",
        knownModelFileSizeGb: "52",
        gpuResidentFraction: "0.25",
        loraTrainablePercent: "2",
        optimizer: "8-bit Adam",
        gradientCheckpointing: false,
        memoryShardingEnabled: true,
      }),
    );

    expect(report.assumptions).toEqual(
      expect.arrayContaining([
        { label: "Known Model File Size", value: "52.0 GB" },
        { label: "GPU resident fraction", value: "25%" },
        { label: "LoRA trainable parameters", value: "2%" },
        { label: "Optimizer", value: "8-bit Adam" },
        { label: "Gradient checkpointing", value: "Disabled" },
        { label: "Memory sharding", value: "Enabled" },
      ]),
    );
  });

  test("assumptions omit KV cache details outside inference decoder KV workloads", () => {
    const visionRows = buildReport(
      state({ workloadFamily: "vision" }),
    ).assumptions;
    expect(visionRows).not.toContainEqual(
      expect.objectContaining({ label: "KV Cache precision" }),
    );
    expect(visionRows).not.toContainEqual(
      expect.objectContaining({ label: "KV heads used" }),
    );

    const trainingRows = buildReport(
      state({ executionMode: "Full training" }),
    ).assumptions;
    expect(trainingRows).not.toContainEqual(
      expect.objectContaining({ label: "KV Cache precision" }),
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
      { label: "Spare", value: "48%" },
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
    expect(chips[3]).toEqual({ label: "Spare", value: "—" });
  });
});
