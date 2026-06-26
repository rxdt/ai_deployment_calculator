import type { FormState } from "./types";

const DEFAULT_VALUES = {
  parameters_b: "8",
  context_tokens: "8000",
  weight_bits: "16",
  kv_cache_bits: "16",
  runtime: "pytorch",
  architecture: "dense",
  active_parameters_b: "1.3",
};

const CHECKED_VALUES = new Set(["1", "true", "on", "yes"]);
const VALID_BITS = new Set(["32", "16", "8", "4"]);
const VALID_RUNTIMES = new Set(["pytorch", "llama_cpp_gguf"]);
const VALID_ARCHITECTURES = new Set(["dense", "moe"]);

function defaultState(): FormState {
  return {
    ...DEFAULT_VALUES,
    trained: false,
    use_adapter: false,
  };
}

function lastValue(search: URLSearchParams, name: string): string | null {
  const values = search.getAll(name);
  return values.length > 0 ? values[values.length - 1] : null;
}

function isDecimalNumber(value: string | null): value is string {
  return value !== null && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/iu.test(value.trim());
}

function isPositiveNumber(value: string | null): value is string {
  return isDecimalNumber(value) && Number.isFinite(Number(value)) && Number(value) > 0;
}

function isNonNegativeInteger(value: string | null): value is string {
  return isDecimalNumber(value) && Number.isInteger(Number(value)) && Number(value) >= 0;
}

function isValidActiveParameters(value: string | null, totalParameters: string): value is string {
  const activeParameters = Number(value);
  return (
    isDecimalNumber(value) &&
    Number.isFinite(activeParameters) &&
    activeParameters > 0 &&
    activeParameters <= Number(totalParameters)
  );
}

function selectedWeightBits(search: URLSearchParams): string | null {
  const value = lastValue(search, "weight_bits") ?? DEFAULT_VALUES.weight_bits;
  return VALID_BITS.has(value) ? value : null;
}

function selectedKvCacheBits(search: URLSearchParams): string | null {
  const value = lastValue(search, "kv_cache_bits") ?? DEFAULT_VALUES.kv_cache_bits;
  return VALID_BITS.has(value) ? value : null;
}

function isChecked(value: string | null): boolean {
  return value !== null && CHECKED_VALUES.has(value.toLowerCase());
}

function activeParametersFrom(search: URLSearchParams, architecture: string): string {
  if (architecture !== "moe") {
    return DEFAULT_VALUES.active_parameters_b;
  }
  return lastValue(search, "active_parameters_b") ?? DEFAULT_VALUES.active_parameters_b;
}

interface StateCandidates {
  parameters: string | null;
  context: string | null;
  weightBits: string | null;
  kvCacheBits: string | null;
  runtime: string;
  architecture: string;
  activeParameters: string;
}

function hasInvalidState(candidates: StateCandidates): boolean {
  return (
    !isPositiveNumber(candidates.parameters) ||
    !isNonNegativeInteger(candidates.context) ||
    candidates.weightBits === null ||
    candidates.kvCacheBits === null ||
    !VALID_RUNTIMES.has(candidates.runtime) ||
    !VALID_ARCHITECTURES.has(candidates.architecture) ||
    (candidates.architecture === "moe" &&
      !isValidActiveParameters(candidates.activeParameters, candidates.parameters))
  );
}

export function normalizedState(search: URLSearchParams): FormState {
  if (Array.from(search.keys()).length === 0) {
    return defaultState();
  }
  const parameters = lastValue(search, "parameters_b");
  const context = lastValue(search, "context_tokens");
  const weightBits = selectedWeightBits(search);
  const kvCacheBits = selectedKvCacheBits(search);
  const runtime = lastValue(search, "runtime") ?? DEFAULT_VALUES.runtime;
  const architecture = lastValue(search, "architecture") ?? DEFAULT_VALUES.architecture;
  const activeParameters = activeParametersFrom(search, architecture);
  if (hasInvalidState({ parameters, context, weightBits, kvCacheBits, runtime, architecture, activeParameters })) {
    return defaultState();
  }
  const trained = isChecked(lastValue(search, "trained"));
  return {
    parameters_b: parameters,
    context_tokens: context,
    weight_bits: weightBits,
    kv_cache_bits: kvCacheBits,
    runtime,
    architecture,
    active_parameters_b: activeParameters,
    trained,
    use_adapter: trained && isChecked(lastValue(search, "use_adapter")),
  };
}

export function searchFromState(state: FormState): URLSearchParams {
  const search = new URLSearchParams();
  search.set("parameters_b", state.parameters_b);
  search.set("context_tokens", state.context_tokens);
  search.set("weight_bits", state.weight_bits);
  search.set("kv_cache_bits", state.kv_cache_bits);
  search.set("runtime", state.runtime);
  search.set("architecture", state.architecture);
  if (state.architecture === "moe") {
    search.set("active_parameters_b", state.active_parameters_b);
  }
  if (state.trained) {
    search.set("trained", "on");
  }
  if (state.trained && state.use_adapter) {
    search.set("use_adapter", "on");
  }
  return search;
}
