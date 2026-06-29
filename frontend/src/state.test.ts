import { describe, expect, test } from "vitest";
import {
  defaultState,
  normalizedState,
  searchFromState,
  zeroState,
} from "./state";
import type { FormState } from "./types";

function parameters(entries: Record<string, string>): URLSearchParams {
  return new URLSearchParams(entries);
}

describe("defaultState and zeroState", () => {
  test("default state seeds a 7B text-generation deployment", () => {
    const state = defaultState();
    expect(state.total_params).toBe("7");
    expect(state.workload_family).toBe("text_generation");
    expect(state.moe_enabled).toBe(false);
  });

  test("zero state blanks the numeric inputs", () => {
    const state = zeroState();
    expect(state.total_params).toBe("0");
    expect(state.workload_size).toBe("0");
    expect(state.context_tokens).toBe("0");
  });
});

describe("normalizedState", () => {
  test("returns defaults when the query is empty", () => {
    expect(normalizedState(new URLSearchParams())).toEqual(defaultState());
  });

  test("parses a fully specified valid query", () => {
    const state = normalizedState(
      parameters({
        workload_family: "vision",
        total_params: "13",
        parameter_unit: "M",
        precision: "8-bit",
        execution_mode: "Full training",
        runtime_profile: "Local / Edge",
        workload_size: "2",
        context_tokens: "4096",
        kv_cache_precision: "32-bit",
        optimizer: "SGD-like",
        video_resolution: "1080p",
        moe_enabled: "on",
        memory_sharding_enabled: "true",
        gradient_checkpointing: "yes",
        known_model_file_size_gb: "40",
        gpu_resident_fraction: "0.8",
      }),
    );
    expect(state.workload_family).toBe("vision");
    expect(state.parameter_unit).toBe("M");
    expect(state.precision).toBe("8-bit");
    expect(state.video_resolution).toBe("1080p");
    expect(state.moe_enabled).toBe(true);
    expect(state.memory_sharding_enabled).toBe(true);
    expect(state.gradient_checkpointing).toBe(true);
    expect(state.known_model_file_size_gb).toBe("40");
  });

  test("falls back on invalid enums and malformed numbers", () => {
    const state = normalizedState(
      parameters({
        workload_family: "not-real",
        total_params: "-5",
        parameter_unit: "X",
        precision: "9-bit",
        execution_mode: "guessing",
        runtime_profile: "Moon",
        kv_cache_precision: "7-bit",
        optimizer: "Newton",
        video_resolution: "4k",
        workload_size: "1.2.3",
        context_tokens: "abc",
        gpu_resident_fraction: "",
        moe_enabled: "maybe",
      }),
    );
    const defaults = defaultState();
    expect(state.workload_family).toBe(defaults.workload_family);
    expect(state.total_params).toBe(defaults.total_params);
    expect(state.parameter_unit).toBe(defaults.parameter_unit);
    expect(state.precision).toBe(defaults.precision);
    expect(state.execution_mode).toBe(defaults.execution_mode);
    expect(state.workload_size).toBe(defaults.workload_size);
    expect(state.context_tokens).toBe(defaults.context_tokens);
    expect(state.moe_enabled).toBe(false);
  });

  test("clamps numbers above the maximum", () => {
    expect(
      normalizedState(parameters({ total_params: "1000000" })).total_params,
    ).toBe("999999");
  });

  test("accepts a plain decimal and an integer-only value", () => {
    expect(
      normalizedState(parameters({ gpu_resident_fraction: "0.5" }))
        .gpu_resident_fraction,
    ).toBe("0.5");
    expect(
      normalizedState(parameters({ total_params: "42" })).total_params,
    ).toBe("42");
  });

  test("treats a bare decimal point as invalid", () => {
    expect(
      normalizedState(parameters({ context_tokens: "." })).context_tokens,
    ).toBe(defaultState().context_tokens);
  });

  test("QLoRA forces a frozen 4-bit local base", () => {
    const state = normalizedState(
      parameters({
        execution_mode: "QLoRA fine-tuning",
        precision: "16-bit",
        runtime_profile: "Server / Cloud",
      }),
    );
    expect(state.precision).toBe("4-bit");
    expect(state.runtime_profile).toBe("Local / Edge");
  });

  test("uses the last value when a key repeats", () => {
    const search = new URLSearchParams();
    search.append("total_params", "3");
    search.append("total_params", "9");
    expect(normalizedState(search).total_params).toBe("9");
  });
});

describe("searchFromState", () => {
  test("serializes booleans as 'on' only when true and drops empty strings", () => {
    const state: FormState = {
      ...zeroState(),
      moe_enabled: true,
      memory_sharding_enabled: false,
      total_params: "8",
      known_model_file_size_gb: "",
    };
    const search = searchFromState(state);
    expect(search.get("moe_enabled")).toBe("on");
    expect(search.has("memory_sharding_enabled")).toBe(false);
    expect(search.get("total_params")).toBe("8");
    expect(search.has("known_model_file_size_gb")).toBe(false);
  });
});
