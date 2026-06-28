import { isFamilySupportsMoe, isTrainingMode } from "./controls";
import {
  checked,
  escapeHtml,
  familyOptions,
  labelledOptions,
  options,
} from "./render-helpers";
import type {
  DisplayRow,
  FormState,
  ReportPayload,
  WorkloadFamily,
} from "./types";

interface NumberField {
  name: keyof FormState;
  label: string;
  value: string;
  ariaLabel?: string;
  fieldClass?: string;
  min?: string;
  step?: string;
}

function field({
  name,
  label,
  value,
  ariaLabel,
  fieldClass = "",
  min = "0",
  step = "any",
}: NumberField): string {
  const fieldClasses = fieldClass === "" ? "field" : `field ${fieldClass}`;
  const aria =
    ariaLabel === undefined ? "" : ` aria-label="${escapeHtml(ariaLabel)}"`;
  return `<div class="${fieldClasses}"><label>${label}<input name="${name}" type="number" min="${min}" step="${step}" value="${escapeHtml(value)}"${aria}></label></div>`;
}

function integerField(
  name: keyof FormState,
  label: string,
  value: string,
  ariaLabel?: string,
): string {
  return field({ name, label, value, ariaLabel, min: "1", step: "1" });
}

function imageFields(
  state: FormState,
  widthLabel: string,
  heightLabel: string,
): string {
  return `${integerField("image_width", widthLabel, state.image_width, "Image Width")}${integerField("image_height", heightLabel, state.image_height, "Image Height")}`;
}

const ADAPTIVE_FIELDS = new Map<WorkloadFamily, (state: FormState) => string>([
  [
    "text_encoder",
    (state) =>
      integerField("sequence_tokens", "Sequence Length", state.sequence_tokens),
  ],
  [
    "encoder_decoder",
    (state) =>
      `${integerField("input_tokens", "Input Tokens", state.input_tokens)}${integerField("output_tokens", "Output Tokens", state.output_tokens)}`,
  ],
  [
    "vision",
    (state) => imageFields(state, "Image Width (px)", "Image Height (px)"),
  ],
  [
    "vision_language",
    (state) =>
      `${integerField("text_context_tokens", "Text Context Tokens", state.text_context_tokens)}${imageFields(state, "Image Width (px)", "Image Height (px)")}`,
  ],
  [
    "image_diffusion",
    (state) => imageFields(state, "Output Image Width", "Output Image Height"),
  ],
  [
    "video_generation",
    (state) =>
      `<div class="field"><label>Output Resolution<select name="video_resolution">${options(["720p", "1080p"], state.video_resolution)}</select></label></div>${integerField("video_frames", "Frames", state.video_frames)}`,
  ],
  [
    "audio",
    (state) =>
      integerField("audio_seconds", "Audio Length", state.audio_seconds),
  ],
  [
    "tabular",
    (state) =>
      `${integerField("rows_per_batch", "Rows per Batch", state.rows_per_batch)}${integerField("features", "Features", state.features)}`,
  ],
  [
    "custom",
    (state) =>
      field({
        name: "input_size_multiplier",
        label: "Input Size Preset",
        value: state.input_size_multiplier,
        min: "0.1",
        step: "0.1",
      }),
  ],
]);

function adaptiveInputFields(state: FormState): string {
  return (
    ADAPTIVE_FIELDS.get(state.workload_family)?.(state) ??
    integerField("context_tokens", "Context Window", state.context_tokens)
  );
}

function loraTrainableOptions(current: string): string {
  const values = [
    "0.1",
    "0.2",
    "0.3",
    "0.4",
    "0.5",
    "0.6",
    "0.7",
    "0.8",
    "0.9",
  ];
  return options(
    values.includes(current) ? values : [...values, current],
    current,
  );
}

function shortHardwareClass(hardwareClass: string): string {
  return hardwareClass.split(", e.g.", 1)[0];
}

const OUTPUT_TOOLTIPS: Partial<Record<string, string>> = {
  "Estimated VRAM required":
    "Estimated GPU memory needed to load the model and run this workload.",
  "Model memory": "GPU memory used to keep the model itself loaded.",
  "QLoRA base model memory":
    "Memory for the 4-bit base model. QLoRA keeps this model frozen and trains small adapters.",
  "Context memory":
    "Memory used by text generation to remember earlier tokens. Non-text workloads usually do not use this.",
  "Activation memory":
    "Temporary GPU memory used while the model processes the input. For text generation this also includes a heuristic decoder scratch reserve estimated as a fraction of loaded weight size (~5% server, ~3% local), not an exact runtime measurement.",
  "Training memory":
    "Extra memory needed for training or fine-tuning, such as adapters, gradients, and optimizer data.",
  "Runtime reserve":
    "GPU memory needed by the software running the model, separate from the model itself.",
  "Safety margin":
    "Extra padding because real GPU memory use can fluctuate. Without it, a close fit may still crash.",
  "Minimum GPU memory needed":
    "Smallest physical GPU memory size that should fit this workload after leaving room for runtime use.",
  "Recommended hardware class":
    "The smallest common GPU memory size that should fit this workload.",
  "Usable VRAM target":
    "How much of the GPU memory the calculator allows the workload to use. The rest is left for runtime overhead and spikes.",
  "Estimated speed":
    "Rough estimate of how fast this hardware may run the workload. Real speed depends on the exact GPU and runtime.",
  "Active parameters per token":
    "For MoE models, the amount of the model used for each token. This affects speed estimates, not loaded model memory.",
};
function labelWithTip(label: string): string {
  const escapedLabel = escapeHtml(label);
  const tip = OUTPUT_TOOLTIPS[label];
  if (tip === undefined) {
    return escapedLabel;
  }
  return `${escapedLabel}<span class="tip" data-tip="${escapeHtml(tip)}" aria-hidden="true">?</span>`;
}

function transparentCalculation(report: ReportPayload): string {
  const labels = report.breakdown.map((row) => row.label);
  const values = report.breakdown.map((row) => row.value);
  return `${labels.join(" + ")}\n${values.join(" + ")} = ${report.totalRequiredMemory}`;
}

function assumptionsMarkup(report: ReportPayload): string {
  return report.assumptions
    .map(
      (assumption) =>
        `<p><span>${escapeHtml(assumption.label)}:</span> <strong>${escapeHtml(assumption.value)}</strong></p>`,
    )
    .join("");
}

export function renderForm(state: FormState): string {
  const isSupportsMoe = isFamilySupportsMoe(state.workload_family);
  const isShowActive = isSupportsMoe && state.moe_enabled;
  const isQlora = state.execution_mode === "QLoRA fine-tuning";
  const workloadLabel = isTrainingMode(state.execution_mode)
    ? "Training Batch Size"
    : "Concurrent Requests";
  const workloadAriaLabel = isTrainingMode(state.execution_mode)
    ? "Micro Batch Size"
    : "Concurrent Requests";
  return `
    <form class="panel controls" aria-label="Deployment inputs">
      <h1>VRAM Deployment Calculator</h1>
      <p class="subtitle">Estimate VRAM and hardware fit for AI workloads.</p>
      <div class="field field-wide">
        <label>Model Task Type
          <select name="workload_family" aria-label="Workload Family">${familyOptions(state.workload_family)}</select>
        </label>
      </div>
      ${field({ name: "total_params", label: "Total Parameters (B)*", value: state.total_params, ariaLabel: "Total Resident Parameters", min: "1", step: "1" })}
      <div class="field">
        <label>Parameter Scale
          <select name="parameter_unit">${labelledOptions(
            [
              ["B", "Billions"],
              ["M", "Millions"],
            ],
            state.parameter_unit,
          )}</select>
        </label>
      </div>
      <div class="field">
        <label>Precision
          ${
            isQlora
              ? `<select name="precision" disabled aria-describedby="qlora-helper"><option>4-bit QLoRA base</option></select><input type="hidden" name="precision" value="4-bit"><span class="helper" id="qlora-helper">QLoRA uses a frozen 4-bit base model plus trainable adapters.</span>`
              : `<select name="precision">${options(["4-bit", "5-bit GGUF", "6-bit GGUF", "8-bit", "16-bit", "32-bit"], state.precision)}</select>`
          }
        </label>
      </div>
      <div class="field">
        <label>Execution Mode
          <select name="execution_mode">${options(["Inference", "LoRA fine-tuning", "QLoRA fine-tuning", "Full training"], state.execution_mode)}</select>
        </label>
      </div>
      <div class="field">
        <label>Runtime Environment
          ${
            isQlora
              ? `<select name="runtime_profile" aria-label="Runtime Profile" disabled><option>Local / Edge</option></select><input type="hidden" name="runtime_profile" value="Local / Edge"><span class="helper">Training runtime assumptions: overhead 4.0 GB, buffer 25%, usable target 80%.</span>`
              : `<select name="runtime_profile" aria-label="Runtime Profile">${options(["Local / Edge", "Server / Cloud"], state.runtime_profile)}</select>`
          }
        </label>
      </div>
      ${adaptiveInputFields(state)}
      <div class="field">
        <label><span data-workload-label>${workloadLabel}</span>
          <input name="workload_size" type="number" min="1" step="1" value="${escapeHtml(state.workload_size)}" aria-label="${workloadAriaLabel}">
        </label>
      </div>
      <label class="check moe-control"${isSupportsMoe ? "" : " hidden"}><input name="moe_enabled" type="checkbox"${checked(state.moe_enabled)}> MoE Model</label>
      <div class="field field-sub active-params"${isShowActive ? "" : " hidden"}>
        <label>${labelWithTip("Active parameters per token")}
          <input name="active_params" type="number" min="0.000001" step="any" value="${escapeHtml(state.active_params)}">
        </label>
      </div>
      <details class="advanced">
        <summary>Advanced assumptions</summary>
        <div class="advanced-grid">
          <div class="field"><label>Context bits<select name="kv_cache_precision" aria-label="Context Memory Precision">${options(["16-bit", "32-bit"], state.kv_cache_precision)}</select></label></div>
          ${field({ name: "known_model_file_size_gb", label: "Model file GB", value: state.known_model_file_size_gb, ariaLabel: "Known Model File Size" })}
          ${field({ name: "gpu_resident_fraction", label: "GPU resident", value: state.gpu_resident_fraction, min: "0.01", step: "0.01" })}
          <div class="field"><label>LoRA trainable %<select name="lora_trainable_percent">${loraTrainableOptions(state.lora_trainable_percent)}</select></label></div>
          <div class="field"><label>Optimizer<select name="optimizer">${options(["AdamW", "8-bit Adam", "SGD-like"], state.optimizer)}</select></label></div>
          ${field({ name: "my_gpu_vram_gb", label: "Compare GPU", value: state.my_gpu_vram_gb })}
          <div class="advanced-checks">
            <label class="check"><input name="exact_transformer_architecture" type="checkbox"${checked(state.exact_transformer_architecture)}> Exact arch</label>
            <label class="check"><input name="gradient_checkpointing" type="checkbox"${checked(state.gradient_checkpointing)}> Grad checkpoint</label>
          </div>
        </div>
      </details>
      <button type="submit">Save estimate URL</button>
    </form>
  `;
}

export function renderStatusBar(): string {
  return `
    <header class="terminal-bar" aria-label="Deployment status">
      <strong>VRAM calculator</strong>
      <span><b>source</b>: local TypeScript</span>
      <span><b>static</b> Vite app</span>
    </header>
  `;
}

function rowsMarkup(rows: DisplayRow[]): string {
  return rows
    .map(
      (row) =>
        `<p class="metric"><span>${labelWithTip(row.label)}</span><strong>${escapeHtml(row.value)}</strong></p>`,
    )
    .join("");
}

function warningMarkup(warnings: string[]): string {
  return warnings
    .filter((warning) => !warning.includes("vendor guarantee"))
    .slice(0, 2)
    .map((warning) =>
      warning ===
      "Transformer architecture is estimated from the parameter count."
        ? `<p class="info-note">${escapeHtml(warning)}</p>`
        : `<p class="warning-note">${escapeHtml(warning)}</p>`,
    )
    .join("");
}

export function renderResults(report: ReportPayload): string {
  return `
    <section class="results">
      <section class="panel hero" aria-label="Estimated VRAM required">
        <div>
          <h2>Estimated VRAM required ${labelWithTip("Estimated VRAM required").replace("Estimated VRAM required", "")}</h2>
        </div>
        <div class="total-wrap"><output class="total">${escapeHtml(report.totalRequiredMemory)}</output></div>
      </section>
      <section class="breakdown" aria-label="Required outputs">
        ${rowsMarkup(report.breakdown)}
        <p class="metric"><span>${labelWithTip("Minimum GPU memory needed")}</span><strong>${escapeHtml(report.minimumRawVramNeeded)}</strong></p>
      </section>
      <section class="panel calc-panel" aria-label="Calculation used">
        <details class="calc"><summary>Calculation used</summary><div class="calc-body"><code>${escapeHtml(transparentCalculation(report))}</code><div class="calc-assumptions" aria-label="Assumptions"><h3>Assumptions</h3>${assumptionsMarkup(report)}</div></div></details>
      </section>
      <section class="panel report-panel" aria-label="Recommended Hardware">
        <details class="calc fit-details" open><summary>Recommended GPU Fit</summary><div class="fit-body">
          <div class="fit-grid">
            <p class="fit-line fit-hardware"><span>${labelWithTip("Recommended hardware class")}</span><strong>${escapeHtml(shortHardwareClass(report.recommendedHardware.recommendedTier))}</strong></p>
            <p class="fit-line"><span>${labelWithTip("Usable VRAM target")}</span><strong>${escapeHtml(report.recommendedHardware.usableVramTarget)}</strong></p>
            <p class="fit-line"><span>${labelWithTip("Estimated speed")}</span><strong>${escapeHtml(report.speed)}</strong></p>
          </div>
          <p class="fit-math">${escapeHtml(report.recommendedHardware.math)}</p>
        </div></details>
        <section class="assumptions warnings" aria-label="Warnings"><p class="estimate-note">Estimates use heuristics. Real usage varies by model architecture, runtime, kernels, quantization, sharding, and offload settings.</p>${warningMarkup(report.warnings)}</section>
      </section>
    </section>
  `;
}
