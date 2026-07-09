import type { CalculationSpec } from "./calculator-core";
import { formatGb } from "./hardware";
import type { DisplayRow, FormState, WorkloadFamily } from "./types";
import { nonNegativeField } from "./workload-sizing";
import { hasDecoderKvCache } from "./workload-visibility";

/**
@param value
*/
function formatPercent(value: number): string {
  return `${String(Number((value * 100).toFixed(1)))}%`;
}

/**
@param spec
*/
function knownFileAssumptionRows(
  spec: Readonly<CalculationSpec>,
): DisplayRow[] {
  if (spec.knownModelFileSizeGb === null || spec.knownModelFileSizeGb <= 0) {
    return [];
  }
  const rows: DisplayRow[] = [
    {
      label: "Known Model File Size",
      value: formatGb(spec.knownModelFileSizeGb),
    },
  ];
  if (spec.gpuResidentFraction !== 1) {
    rows.push({
      label: "GPU resident fraction",
      value: formatPercent(spec.gpuResidentFraction),
    });
  }
  return rows;
}

/**
@param value raw numeric field value
@param fallback formula fallback for malformed direct state
*/
function resolvedNumber(value: string, fallback: number): string {
  return nonNegativeField(value, fallback).toString();
}

/**
@param state
@param spec
*/
function trainingAssumptionRows(
  state: Readonly<FormState>,
  spec: Readonly<CalculationSpec>,
): DisplayRow[] {
  if (state.executionMode === "Inference") {
    return [];
  }
  const rows: DisplayRow[] = [];
  if (state.executionMode !== "Full training") {
    rows.push({
      label: "LoRA trainable parameters",
      value: `${String(spec.loraTrainablePercent)}%`,
    });
  }
  rows.push(
    { label: "Optimizer", value: state.optimizer },
    {
      label: "Gradient checkpointing",
      value: state.gradientCheckpointing ? "Enabled" : "Disabled",
    },
  );
  return rows;
}

/**
@param state
*/
function imageSizeRow(state: Readonly<FormState>): DisplayRow {
  return {
    label: "Image size",
    value: `${resolvedNumber(state.imageWidth, 1024)} x ${resolvedNumber(state.imageHeight, 1024)}`,
  };
}

/**
@param state
@param spec
*/
function kvAssumptionRows(
  state: Readonly<FormState>,
  spec: Readonly<CalculationSpec>,
): DisplayRow[] {
  if (!hasDecoderKvCache(state)) {
    return [];
  }
  const workloadRow = {
    label: "Concurrent batch requests",
    value: spec.workloadSize.toString(),
  };
  let scalingRows: DisplayRow[];
  if (state.workloadFamily === "encoder_decoder") {
    scalingRows = [
      {
        label: "Output tokens",
        value: resolvedNumber(state.outputTokens, 256),
      },
      workloadRow,
    ];
  } else if (state.workloadFamily === "vision_language") {
    scalingRows = [
      {
        label: "Text context tokens",
        value: resolvedNumber(state.textContextTokens, 4000),
      },
      { label: "Image count", value: resolvedNumber(state.imageCount, 1) },
      imageSizeRow(state),
      workloadRow,
    ];
  } else {
    scalingRows = [
      {
        label: "Context tokens",
        value: resolvedNumber(state.contextTokens, 8000),
      },
      workloadRow,
    ];
  }
  return [
    ...scalingRows,
    { label: "KV Cache precision", value: state.kvCachePrecision },
    { label: "KV heads used", value: spec.architecture.kvHeads.toString() },
    {
      label: "Conservative KV heads",
      value: spec.architecture.attentionHeads.toString(),
    },
  ];
}

/**
@param state
@param spec
*/
function workloadSizeRow(
  state: Readonly<FormState>,
  spec: Readonly<CalculationSpec>,
): DisplayRow {
  return {
    label:
      state.executionMode === "Inference"
        ? "Concurrent batch requests"
        : "Micro batch size",
    value: spec.workloadSize.toString(),
  };
}

type WorkloadAssumptionBuilder = (
  state: Readonly<FormState>,
  spec: Readonly<CalculationSpec>,
) => DisplayRow[];

const textGenerationAssumptionRows: WorkloadAssumptionBuilder = (
  state,
  spec,
) => {
  return [
    {
      label: "Context tokens",
      value: resolvedNumber(state.contextTokens, 8000),
    },
    workloadSizeRow(state, spec),
  ];
};

const textEncoderAssumptionRows: WorkloadAssumptionBuilder = (state, spec) => {
  return [
    {
      label: "Sequence tokens",
      value: resolvedNumber(state.sequenceTokens, 512),
    },
    workloadSizeRow(state, spec),
  ];
};

const encoderDecoderAssumptionRows: WorkloadAssumptionBuilder = (
  state,
  spec,
) => {
  return [
    { label: "Input tokens", value: resolvedNumber(state.inputTokens, 1024) },
    { label: "Output tokens", value: resolvedNumber(state.outputTokens, 256) },
    workloadSizeRow(state, spec),
  ];
};

const imageAssumptionRows: WorkloadAssumptionBuilder = (state, spec) => {
  return [imageSizeRow(state), workloadSizeRow(state, spec)];
};

const visionLanguageAssumptionRows: WorkloadAssumptionBuilder = (
  state,
  spec,
) => {
  return [
    {
      label: "Text context tokens",
      value: resolvedNumber(state.textContextTokens, 4000),
    },
    { label: "Image count", value: resolvedNumber(state.imageCount, 1) },
    imageSizeRow(state),
    workloadSizeRow(state, spec),
  ];
};

const videoAssumptionRows: WorkloadAssumptionBuilder = (state, spec) => {
  return [
    { label: "Video resolution", value: state.videoResolution },
    { label: "Video frames", value: resolvedNumber(state.videoFrames, 81) },
    workloadSizeRow(state, spec),
  ];
};

const audioAssumptionRows: WorkloadAssumptionBuilder = (state, spec) => {
  return [
    { label: "Audio seconds", value: resolvedNumber(state.audioSeconds, 30) },
    workloadSizeRow(state, spec),
  ];
};

const tabularAssumptionRows: WorkloadAssumptionBuilder = (state, spec) => {
  return [
    {
      label: "Rows per batch",
      value: resolvedNumber(state.rowsPerBatch, 10_000),
    },
    { label: "Features", value: resolvedNumber(state.features, 100) },
    workloadSizeRow(state, spec),
  ];
};

const customAssumptionRows: WorkloadAssumptionBuilder = (state, spec) => {
  return [
    {
      label: "Input size multiplier",
      value: resolvedNumber(state.inputSizeMultiplier, 1),
    },
    workloadSizeRow(state, spec),
  ];
};

const WORKLOAD_ASSUMPTION_BUILDERS: ReadonlyMap<
  WorkloadFamily,
  WorkloadAssumptionBuilder
> = new Map([
  ["text_generation", textGenerationAssumptionRows],
  ["text_encoder", textEncoderAssumptionRows],
  ["encoder_decoder", encoderDecoderAssumptionRows],
  ["vision", imageAssumptionRows],
  ["vision_language", visionLanguageAssumptionRows],
  ["image_diffusion", imageAssumptionRows],
  ["video_generation", videoAssumptionRows],
  ["audio", audioAssumptionRows],
  ["tabular", tabularAssumptionRows],
  ["custom", customAssumptionRows],
]);

/**
@param state
@param spec
*/
function workloadAssumptionRows(
  state: Readonly<FormState>,
  spec: Readonly<CalculationSpec>,
): DisplayRow[] {
  if (hasDecoderKvCache(state)) {
    return [];
  }
  const buildRows =
    WORKLOAD_ASSUMPTION_BUILDERS.get(state.workloadFamily) ??
    customAssumptionRows;
  return buildRows(state, spec);
}

/**
@param state
@param spec
*/
export function assumptionRows(
  state: Readonly<FormState>,
  spec: Readonly<CalculationSpec>,
): DisplayRow[] {
  const shardingRows = state.memoryShardingEnabled
    ? [{ label: "Memory sharding", value: "Enabled" }]
    : [];
  return [
    { label: "Precision", value: state.precision },
    { label: "Runtime profile", value: state.runtimeProfile },
    { label: "Execution mode", value: state.executionMode },
    ...knownFileAssumptionRows(spec),
    ...trainingAssumptionRows(state, spec),
    ...shardingRows,
    ...workloadAssumptionRows(state, spec),
    ...kvAssumptionRows(state, spec),
  ];
}
