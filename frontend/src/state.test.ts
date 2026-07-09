import { describe, expect, test } from "vitest";
import {
  defaultState,
  normalizedState,
  searchFromState,
  zeroState,
} from "./state";
import type { FormState } from "./types";

/**

@param entries
*/
function parameters(entries: Record<string, string>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    const wireKey = key.replaceAll(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`);
    search.set(wireKey, value);
  }
  return search;
}

describe("defaultState and zeroState", () => {
  test("default state seeds a 7B text-generation deployment", () => {
    const state = defaultState();
    expect(state.totalParams).toBe("7");
    expect(state.workloadFamily).toBe("text_generation");
    expect(state.moeEnabled).toBe(false);
  });

  test("zero state blanks the numeric inputs", () => {
    const state = zeroState();
    expect(state.totalParams).toBe("0");
    expect(state.workloadSize).toBe("0");
    expect(state.contextTokens).toBe("0");
  });
});

describe("normalizedState", () => {
  test("returns defaults when the query is empty", () => {
    expect(normalizedState(new URLSearchParams())).toEqual(defaultState());
  });

  test("parses a fully specified valid query", () => {
    const state = normalizedState(
      parameters({
        workloadFamily: "vision",
        totalParams: "13",
        parameterUnit: "M",
        precision: "8-bit",
        executionMode: "Full training",
        runtimeProfile: "Local / Edge",
        workloadSize: "2",
        contextTokens: "4096",
        kvCachePrecision: "32-bit",
        optimizer: "SGD-like",
        videoResolution: "1080p",
        moeEnabled: "on",
        memoryShardingEnabled: "true",
        gradientCheckpointing: "yes",
        knownModelFileSizeGb: "40",
        gpuResidentFraction: "0.8",
      }),
    );
    expect(state.workloadFamily).toBe("vision");
    expect(state.parameterUnit).toBe("M");
    expect(state.precision).toBe("8-bit");
    expect(state.videoResolution).toBe("1080p");
    expect(state.moeEnabled).toBe(true);
    expect(state.memoryShardingEnabled).toBe(true);
    expect(state.gradientCheckpointing).toBe(true);
    expect(state.knownModelFileSizeGb).toBe("40");
  });

  test("falls back on invalid enums and malformed numbers", () => {
    const state = normalizedState(
      parameters({
        workloadFamily: "not-real",
        totalParams: "-5",
        parameterUnit: "X",
        precision: "9-bit",
        executionMode: "guessing",
        runtimeProfile: "Moon",
        kvCachePrecision: "7-bit",
        optimizer: "Newton",
        videoResolution: "4k",
        workloadSize: "1.2.3",
        contextTokens: "abc",
        gpuResidentFraction: "",
        moeEnabled: "maybe",
      }),
    );
    const defaults = defaultState();
    expect(state.workloadFamily).toBe(defaults.workloadFamily);
    expect(state.totalParams).toBe(defaults.totalParams);
    expect(state.parameterUnit).toBe(defaults.parameterUnit);
    expect(state.precision).toBe(defaults.precision);
    expect(state.executionMode).toBe(defaults.executionMode);
    expect(state.workloadSize).toBe(defaults.workloadSize);
    expect(state.contextTokens).toBe(defaults.contextTokens);
    expect(state.moeEnabled).toBe(false);
  });

  test("clamps numbers above the maximum", () => {
    expect(
      normalizedState(parameters({ totalParams: "1000000" })).totalParams,
    ).toBe("999999");
  });

  test("clamps advanced ratio and percent query values to valid ranges", () => {
    const state = normalizedState(
      parameters({
        gpuResidentFraction: "2",
        loraTrainablePercent: "150",
      }),
    );

    expect(state.gpuResidentFraction).toBe("1");
    expect(state.loraTrainablePercent).toBe("100");
  });

  test("accepts a plain decimal and an integer-only value", () => {
    expect(
      normalizedState(parameters({ gpuResidentFraction: "0.5" }))
        .gpuResidentFraction,
    ).toBe("0.5");
    expect(normalizedState(parameters({ totalParams: "42" })).totalParams).toBe(
      "42",
    );
  });

  test("treats a bare decimal point as invalid", () => {
    expect(
      normalizedState(parameters({ contextTokens: "." })).contextTokens,
    ).toBe(defaultState().contextTokens);
  });

  test("QLoRA forces a frozen 4-bit local base", () => {
    const state = normalizedState(
      parameters({
        executionMode: "QLoRA fine-tuning",
        precision: "16-bit",
        runtimeProfile: "Server / Cloud",
      }),
    );
    expect(state.precision).toBe("4-bit");
    expect(state.runtimeProfile).toBe("Local / Edge");
  });

  test("ignores legacy training query flags", () => {
    const state = normalizedState(
      new URLSearchParams("trained=on&use_adapter=on"),
    );

    expect(state.executionMode).toBe("Inference");
    expect(state.precision).toBe(defaultState().precision);
    expect(state.runtimeProfile).toBe(defaultState().runtimeProfile);
  });

  test("uses the last value when a key repeats", () => {
    const search = new URLSearchParams();
    search.append("total-params", "3");
    search.append("total-params", "9");
    expect(normalizedState(search).totalParams).toBe("9");
  });
});

describe("searchFromState", () => {
  test("serializes booleans as 'on' only when true and drops empty strings", () => {
    const state: FormState = {
      ...zeroState(),
      moeEnabled: true,
      memoryShardingEnabled: false,
      totalParams: "8",
      knownModelFileSizeGb: "",
    };
    const search = searchFromState(state);
    expect(search.get("moe-enabled")).toBe("on");
    expect(search.has("memory-sharding-enabled")).toBe(false);
    expect(search.get("total-params")).toBe("8");
    expect(search.has("known-model-file-size-gb")).toBe(false);
  });
});
