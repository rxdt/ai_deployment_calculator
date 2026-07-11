import type { CalculationSpec } from "./calculator-core";
import type { DisplayRow, FormState } from "./types";
import { hasDecoderKvCache, hasMoeControl } from "./workload-visibility";

/**
Format a fraction (0..1) as a whole-number percent for prose, e.g. 0.9 -> "90%".
@param value - a 0..1 fraction
@returns the value as a rounded percent string
*/
function percent(value: number): string {
  return `${Math.round(value * 100).toString()}%`;
}

/**
Name every component the training-state row actually sums (see
trainingStateGb): full training holds fp32 master weights, the LoRA modes hold
only the adapter's. Checkpointing is noted separately since it shrinks
activation memory, not the training state.
@param state - normalized form state
@returns the training methodology notes; empty for inference
*/
function trainingNotes(state: Readonly<FormState>): string[] {
  if (state.executionMode === "Inference") {
    return [];
  }
  const weights =
    state.executionMode === "Full training"
      ? "fp32 master weights"
      : "adapter weights";
  const sizing = `Training state sized for ${state.executionMode.replace(" fine-tuning", "")}: ${weights}, gradients, and optimizer state.`;
  return state.gradientCheckpointing
    ? [sizing, "Activation memory assumes gradient checkpointing (recompute)."]
    : [sizing];
}

/**
Build the "Assumptions used" notes: short plain-language statements of the
methodology behind the estimate: the fixed overhead, reserve, and precision
choices a reader cannot infer from their own inputs. Values the user typed
(context tokens, batch size, execution mode, …) are intentionally omitted; they
already appear in the form and the calculation breakdown, so echoing them here
would only duplicate. Each note renders as a green-bulleted line.
@param state - normalized form state
@param spec - the derived calculation spec
@returns the assumption notes, one label per bullet (values are unused)
*/
export function assumptionRows(
  state: Readonly<FormState>,
  spec: Readonly<CalculationSpec>,
): DisplayRow[] {
  const notes: string[] = [
    `Runtime / CUDA overhead estimated at a fixed ${spec.runtime.overheadGb.toFixed(1)} GB for this mode and runtime profile.`,
  ];
  if (hasDecoderKvCache(state)) {
    notes.push(`KV cache precision: ${state.kvCachePrecision}.`);
  }
  notes.push(
    `${percent(1 - spec.runtime.utilization)} of advertised card VRAM reserved for the driver + CUDA context.`,
    ...trainingNotes(state),
  );
  if (state.memoryShardingEnabled) {
    notes.push(
      "Memory sharding assumed across the recommended GPU pool (tensor / model parallelism).",
    );
  }
  // A methodology note, not a warning: MoE routing is a speed assumption.
  if (state.moeEnabled && hasMoeControl(state.workloadFamily)) {
    notes.push(
      "MoE active parameters affect speed, not resident weight memory, unless expert offload or sharding is enabled.",
    );
  }
  if (spec.knownModelFileSizeGb !== null && spec.knownModelFileSizeGb > 0) {
    notes.push(
      "Model weight memory taken from the provided known file size, not the parameter estimate.",
    );
  }
  return notes.map((note) => ({ label: note, value: "" }));
}
