// Pure, deterministic GPU VRAM deployment calculator core.
// Implements VRAM_GB = (W + KV + T + C) * RUNTIME_MARGINS[runtime].

export type Bits = 32 | 16 | 8 | 4;
export type Runtime = "pytorch" | "llama_cpp_gguf";
type Architecture = "dense" | "moe";
export type Task = "inference" | "qlora" | "full_training";

const BITS_PER_BYTE = 8;
const CONTEXT_TOKENS_PER_K = 1000;
const KV_REFERENCE_BITS = 16; // KV cache is sized in 16-bit; quantizing below this shrinks it.
const KV_HEAD_RATIO = 10; // Grouped-query-attention heuristic: KV scales with P / 10.
const KV_CONTEXT_DIVISOR = 8; // Per-1k-token context divisor from the worked examples.
const QLORA_OVERHEAD_GB = 4; // 16-bit LoRA adapters plus Adam optimizer states.
const FULL_TRAINING_BYTES_PER_PARAM = 16; // Weights + gradients + optimizer for 16-bit training.
export const CUDA_TAX_GB = 1.5; // Fixed CUDA context / system reservation.
const SAFETY_MARGIN = 1.1; // Headroom so a deployment does not run at the VRAM ceiling.
const GGUF_RUNTIME_MARGIN = 1; // llama.cpp GGUF sizing uses the additive components directly.
export const RUNTIME_MARGINS: Record<Runtime, number> = {
  pytorch: SAFETY_MARGIN,
  llama_cpp_gguf: GGUF_RUNTIME_MARGIN,
};

export interface DeploymentSpec {
  parameters_b: number;
  context_tokens: number;
  weight_bits: Bits;
  kv_cache_bits: Bits;
  task: Task;
  architecture: Architecture;
  active_parameters_b: number | null;
  runtime: Runtime;
}

// Round half-to-even, matching Python's `round(value, digits)` so the frontend
// reproduces the historical backend totals exactly. Rounding the decimal string of
// the double (not float * 10) avoids the scaling error that collapsed near-halves
// such as 13.5 * 1.1 onto an exact half; only genuine halves break to even.
// Round half-to-even: round up on >5, or on exactly 5 when a non-zero tail follows or the last
// kept digit is odd.
function shouldRoundUp(
  nextDigit: number,
  tail: string,
  lastKept: number,
): boolean {
  if (nextDigit !== 5) {
    return nextDigit > 5;
  }
  return /[1-9]/.test(tail) || lastKept % 2 === 1;
}

// Carry a +1 through the kept decimal digits, returning a new array (a leading 1 may be added).
function incrementDecimalDigits(digits: readonly number[]): number[] {
  const carried = [...digits];
  let index = carried.length - 1;
  while (index >= 0 && carried[index] === 9) {
    carried[index] = 0;
    index -= 1;
  }
  if (index < 0) {
    return [1, ...carried];
  }
  carried[index] += 1;
  return carried;
}

// Build the kept decimal digits for `value`, already rounded half-to-even at `digits` places.
function roundedKeptDigits(
  intPart: string,
  fracPart: string,
  digits: number,
): number[] {
  const kept = (intPart + fracPart.slice(0, digits)).split("").map(Number);
  const nextDigit = Number(fracPart[digits]);
  const tail = fracPart.slice(digits + 1);
  const lastKept = kept[kept.length - 1];
  return shouldRoundUp(nextDigit, tail, lastKept)
    ? incrementDecimalDigits(kept)
    : kept;
}

export function roundTo(value: number, digits: number): number {
  const text = String(value);
  const isExponential = text.includes("e"); // String(number) only ever emits a lowercase exponent
  if (!Number.isFinite(value) || isExponential) {
    return value; // non-finite and exponential magnitudes are passed through unchanged
  }
  const isNegative = text.startsWith("-");
  const [intPart, fracPart = ""] = (isNegative ? text.slice(1) : text).split(
    ".",
  );
  if (fracPart.length <= digits) {
    return value;
  }
  const rounded = roundedKeptDigits(intPart, fracPart, digits);
  const intLength = rounded.length - digits;
  const intText = rounded.slice(0, intLength).join("");
  const fracText = rounded.slice(intLength).join("");
  const fraction = fracText ? `.${fracText}` : "";
  return Number(`${isNegative ? "-" : ""}${intText}${fraction}`);
}

export function weightsGb(spec: DeploymentSpec): number {
  return spec.parameters_b * (spec.weight_bits / BITS_PER_BYTE);
}

export function kvCacheGb(spec: DeploymentSpec): number {
  const contextK = spec.context_tokens / CONTEXT_TOKENS_PER_K;
  const quant = spec.kv_cache_bits / KV_REFERENCE_BITS;
  if (spec.architecture === "moe" && spec.active_parameters_b !== null) {
    return spec.active_parameters_b * (contextK / KV_CONTEXT_DIVISOR) * quant;
  }
  return (
    (spec.parameters_b / KV_HEAD_RATIO) *
    (contextK / KV_CONTEXT_DIVISOR) *
    quant
  );
}

export function taskOverheadGb(spec: DeploymentSpec): number {
  if (spec.task === "full_training") {
    return spec.parameters_b * FULL_TRAINING_BYTES_PER_PARAM;
  }
  if (spec.task === "qlora") {
    return QLORA_OVERHEAD_GB;
  }
  return 0;
}

export function totalVramGb(spec: DeploymentSpec): number {
  const subtotal =
    weightsGb(spec) + kvCacheGb(spec) + taskOverheadGb(spec) + CUDA_TAX_GB;
  return roundTo(subtotal * RUNTIME_MARGINS[spec.runtime], 1);
}
