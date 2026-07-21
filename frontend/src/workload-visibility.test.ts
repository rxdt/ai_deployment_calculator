import { describe, expect, test } from "vitest";
import type { ExecutionMode, WorkloadFamily } from "./types";
import { hasDecoderKvCache } from "./workload-visibility";

describe("hasDecoderKvCache", () => {
  test.each<readonly [string, ExecutionMode, WorkloadFamily]>([
    ["text decoder inference", "Inference", "text_generation"],
    ["seq2seq inference", "Inference", "encoder_decoder"],
    // Whisper-style speech encoder-decoder models use the same seq2seq cache
    // path as text encoder-decoder models.
    ["speech encoder-decoder inference", "Inference", "encoder_decoder"],
    ["vision-language generation", "Inference", "vision_language"],
  ])("enables the cache precision control for %s", (scenario, mode, family) => {
    expect(
      hasDecoderKvCache({ executionMode: mode, workloadFamily: family }),
      scenario,
    ).toBe(true);
  });

  test.each<readonly [string, ExecutionMode, WorkloadFamily]>([
    ["encoder-only inference", "Inference", "text_encoder"],
    ["vision encoder inference", "Inference", "vision"],
    ["image diffusion inference", "Inference", "image_diffusion"],
    ["video diffusion inference", "Inference", "video_generation"],
    [
      "generic audio inference without a decoder declaration",
      "Inference",
      "audio",
    ],
    ["tabular inference", "Inference", "tabular"],
    ["custom inference", "Inference", "custom"],
    ["LoRA training", "LoRA fine-tuning", "text_generation"],
    ["QLoRA training", "QLoRA fine-tuning", "text_generation"],
    ["full training", "Full training", "encoder_decoder"],
  ])(
    "disables the cache precision control for %s",
    (scenario, mode, family) => {
      expect(
        hasDecoderKvCache({
          executionMode: mode,
          workloadFamily: family,
        }),
        scenario,
      ).toBe(false);
    },
  );
});
