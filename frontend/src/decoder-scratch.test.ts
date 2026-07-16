import { describe, expect, test } from "vitest";
import { fp16DecoderActivationScratchGb } from "./decoder-scratch";

/*
These tests pin the fp16 decoder activation-scratch estimate DIRECTLY to its
external measurement anchors so the formula cannot silently drift off them.
Expected GB come from raw llama.cpp compute-buffer logs, converted with the
standard 1 MiB = 1024*1024 bytes and 1 GB = 1e9 bytes (decimal GB the UI shows),
NOT from re-deriving our own constants:

- 70B @ 8k : issue #7804 reports 1104 MiB on EACH of two GPUs → 2208 MiB total
             → 2208 * 1024 * 1024 / 1e9 ≈ 2.3153 GB.
- 70B @ 32k: issue #10003 reports a 4224 MiB Metal compute buffer
             → 4224 * 1024 * 1024 / 1e9 ≈ 4.4292 GB.

The scratch estimate must never UNDER-estimate (OOM is the unforgivable
direction), so the anchors are the multi-GPU SUMMED buffers and a 0.5 GB floor
guards small/short-context models.
*/

const REF_8K_GB = 2.3153; // llama.cpp #7804, 2208 MiB summed
const REF_32K_GB = 4.4292; // llama.cpp #10003, 4224 MiB
const FLOOR_GB = 0.5;

describe("fp16DecoderActivationScratchGb anchors", () => {
  test("matches the llama.cpp 70B 8k compute buffer (#7804)", () => {
    expect(fp16DecoderActivationScratchGb(70, 8192)).toBeCloseTo(REF_8K_GB, 3);
  });

  test("matches the llama.cpp 70B 32k compute buffer (#10003)", () => {
    expect(fp16DecoderActivationScratchGb(70, 32_768)).toBeCloseTo(
      REF_32K_GB,
      3,
    );
  });

  test("sums the multi-GPU buffer rather than a single card at 8k", () => {
    // A single-GPU 1104 MiB read would be ~1.16 GB and would under-estimate.
    expect(fp16DecoderActivationScratchGb(70, 8192)).toBeGreaterThan(2);
  });
});

describe("fp16DecoderActivationScratchGb floor", () => {
  test("never returns below the 0.5 GB inference floor", () => {
    // 1B @ 8k scales to ~0.033 GB before the floor; a 24B model @ 8k
    // (~0.79 GB) sits above it. Both must respect the floor.
    expect(fp16DecoderActivationScratchGb(1, 8192)).toBe(FLOOR_GB);
    expect(fp16DecoderActivationScratchGb(0, 32_768)).toBe(FLOOR_GB);
    expect(fp16DecoderActivationScratchGb(24, 8192)).toBeGreaterThanOrEqual(
      FLOOR_GB,
    );
  });
});

describe("fp16DecoderActivationScratchGb scaling", () => {
  test("scales linearly with resident parameters against the 8k anchor", () => {
    const seventyB = fp16DecoderActivationScratchGb(70, 8192);
    expect(fp16DecoderActivationScratchGb(140, 8192)).toBeCloseTo(
      seventyB * 2,
      3,
    );
    expect(fp16DecoderActivationScratchGb(35, 8192)).toBeCloseTo(
      seventyB / 2,
      3,
    );
  });

  test("interpolates linearly between the 8k and 32k anchors", () => {
    // Midpoint token count sits halfway between the two anchor buffers.
    const midpoint = (8192 + 32_768) / 2;
    expect(fp16DecoderActivationScratchGb(70, midpoint)).toBeCloseTo(
      (REF_8K_GB + REF_32K_GB) / 2,
      3,
    );
  });
});

describe("fp16DecoderActivationScratchGb context growth", () => {
  test("never decreases as context length grows", () => {
    const tokenSweep = [512, 4096, 8192, 12_000, 20_480, 32_768, 131_072];
    let previous = 0;
    for (const tokens of tokenSweep) {
      const current = fp16DecoderActivationScratchGb(70, tokens);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  test("clamps to the 8k anchor at and below its token count", () => {
    // The 8000-token production default sits below the 8192 anchor and must
    // not fall under it.
    expect(fp16DecoderActivationScratchGb(70, 4096)).toBeCloseTo(REF_8K_GB, 3);
    expect(fp16DecoderActivationScratchGb(70, 8000)).toBeCloseTo(REF_8K_GB, 3);
  });

  test("clamps to the 32k anchor beyond its token count", () => {
    // Extrapolating past 32k would fabricate an unmeasured buffer; the estimate
    // holds flat at the highest anchor instead.
    expect(fp16DecoderActivationScratchGb(70, 131_072)).toBeCloseTo(
      REF_32K_GB,
      3,
    );
  });
});
