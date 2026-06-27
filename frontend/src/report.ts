// Build the display-ready report payload directly from the normalized form state, replacing the former /api/report backend call with a pure local computation.

import type { Bits, DeploymentSpec, Runtime, Task } from "./calculator";
import {
  CUDA_TAX_GB,
  RUNTIME_MARGINS,
  kvCacheGb,
  roundTo,
  taskOverheadGb,
  totalVramGb,
  weightsGb,
} from "./calculator";
import {
  HOST_RAM_FLOOR_GB,
  HOST_RAM_STEP_GB,
  deploymentPlan,
  recommendedHostRamGb,
  type FitLabel,
} from "./hardware";
import type {
  ComparisonRow,
  DisplayRow,
  FormState,
  HardwareRow,
  ReportPayload,
} from "./types";

const SUPPORTED_WEIGHT_BITS: Bits[] = [32, 16, 8, 4];
const COMPARISON_BASELINE_BITS: Bits = 16;

function toBits(value: string): Bits {
  const bits = Number(value);
  const match = SUPPORTED_WEIGHT_BITS.find((candidate) => candidate === bits);
  if (match !== undefined) {
    return match;
  }
  throw new Error(`unsupported bit width: ${value}`);
}

function toRuntime(value: string): Runtime {
  if (value === "pytorch" || value === "llama_cpp_gguf") {
    return value;
  }
  throw new Error(`unsupported runtime: ${value}`);
}

function taskFromState(state: FormState): Task {
  if (!state.trained) {
    return "inference";
  }
  return state.use_adapter ? "qlora" : "full_training";
}

export function specFromState(state: FormState): DeploymentSpec {
  return {
    parameters_b: Number(state.parameters_b),
    context_tokens: Number(state.context_tokens),
    weight_bits: toBits(state.weight_bits),
    kv_cache_bits: toBits(state.kv_cache_bits),
    task: taskFromState(state),
    architecture: state.architecture === "moe" ? "moe" : "dense",
    active_parameters_b:
      state.architecture === "moe" ? Number(state.active_parameters_b) : null,
    runtime: toRuntime(state.runtime),
  };
}

function gb(value: number): string {
  return `${value.toFixed(1)} GB`;
}

function fitText(fit: FitLabel): string {
  return fit === "single_gpu" ? "single GPU" : fit.replaceAll("_", " ");
}

function comparisonRows(spec: DeploymentSpec): ComparisonRow[] {
  const baseline = totalVramGb({
    ...spec,
    weight_bits: COMPARISON_BASELINE_BITS,
  });
  return SUPPORTED_WEIGHT_BITS.map((bits) => {
    const total = totalVramGb({ ...spec, weight_bits: bits });
    return {
      precision: `${String(bits)}-bit`,
      total: gb(total),
      savings: gb(roundTo(baseline - total, 1)),
      selected: spec.weight_bits === bits,
    };
  });
}

function assumptionRows(spec: DeploymentSpec): DisplayRow[] {
  const marginPercent = Math.round((RUNTIME_MARGINS[spec.runtime] - 1) * 100);
  const kvHeuristic =
    spec.architecture === "moe"
      ? "active_parameters * (context_k / 8)"
      : "(parameters / 10) * (context_k / 8)";
  return [
    { label: "Safety margin", value: `${String(marginPercent)}%` },
    { label: "CUDA/system tax", value: gb(CUDA_TAX_GB) },
    { label: "KV cache heuristic", value: kvHeuristic },
    {
      label: "Host RAM rule",
      value: `at least ${String(HOST_RAM_FLOOR_GB)} GB, rounded up in ${String(HOST_RAM_STEP_GB)} GB increments`,
    },
    {
      label: "Supported precisions",
      value: "32-bit, 16-bit, 8-bit, and 4-bit weights and KV cache",
    },
  ];
}

export function buildReport(state: FormState): ReportPayload {
  const spec = specFromState(state);
  const plan = deploymentPlan(spec);
  const weights = weightsGb(spec);
  const kvCache = kvCacheGb(spec);
  const taskOverhead = taskOverheadGb(spec);
  const total = totalVramGb(spec);
  const margin = RUNTIME_MARGINS[spec.runtime];
  const hardware: HardwareRow[] = plan.options.map((planOption) => ({
    name: planOption.option.gpu.name,
    detail: `${String(planOption.option.gpu_count)}x ${planOption.option.gpu.vram_gb.toFixed(0)} GB`,
    sharding: fitText(planOption.fit),
  }));
  return {
    total_vram: gb(total),
    host_ram: `${String(recommendedHostRamGb(spec))} GB host RAM`,
    plan: {
      primary: plan.primary.option.gpu.name,
      primary_fit: fitText(plan.primary.fit),
      optimization: plan.optimization,
    },
    breakdown: [
      { label: "Weights", value: gb(weights) },
      { label: "KV cache", value: gb(kvCache) },
      { label: "Task", value: gb(taskOverhead) },
      { label: "CUDA/system", value: gb(CUDA_TAX_GB) },
    ],
    hardware,
    comparison: comparisonRows(spec),
    assumptions: assumptionRows(spec),
    calculation: `(${weights.toFixed(1)} + ${kvCache.toFixed(1)} + ${taskOverhead.toFixed(1)} + ${CUDA_TAX_GB.toFixed(1)}) * ${margin.toFixed(2)} = ${total.toFixed(1)} GB`,
  };
}
