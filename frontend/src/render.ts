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

function shortHardwareTier(tier: string): string {
  return tier.split(", e.g.", 1)[0];
}

function transparentCalculation(report: ReportPayload): string {
  const components = report.breakdown.map(
    (row) => `${row.label}: ${row.value}`,
  );
  return `${components.join(" + ")} = ${report.totalRequiredMemory}`;
}

export function renderForm(state: FormState): string {
  const isSupportsMoe = isFamilySupportsMoe(state.workload_family);
  const isShowActive = isSupportsMoe && state.moe_enabled;
  const workloadLabel = isTrainingMode(state.execution_mode)
    ? "Training Batch Size"
    : "Concurrent Requests";
  const workloadAriaLabel = isTrainingMode(state.execution_mode)
    ? "Micro Batch Size"
    : "Concurrent Requests";
  return `
    <form class="panel controls" aria-label="Deployment inputs">
      <h1>VRAM Deployment Calculator</h1>
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
              ["K", "Thousands"],
            ],
            state.parameter_unit,
          )}</select>
        </label>
      </div>
      <div class="field">
        <label>Precision
          <select name="precision">${options(["4-bit", "5-bit GGUF", "6-bit GGUF", "8-bit", "16-bit", "32-bit"], state.precision)}</select>
        </label>
      </div>
      <div class="field">
        <label>Execution Mode
          <select name="execution_mode">${options(["Inference", "LoRA fine-tuning", "QLoRA fine-tuning", "Full training"], state.execution_mode)}</select>
        </label>
      </div>
      <div class="field">
        <label>Runtime Environment
          <select name="runtime_profile" aria-label="Runtime Profile">${options(["Local / Edge", "Server / Cloud"], state.runtime_profile)}</select>
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
        <label>Active Parameters
          <input name="active_params" type="number" min="0.000001" step="any" value="${escapeHtml(state.active_params)}">
        </label>
      </div>
      <details class="advanced">
        <summary>Advanced assumptions</summary>
        <div class="advanced-grid">
          <div class="field"><label>KV Cache Bits<select name="kv_cache_precision" aria-label="KV Cache Precision">${options(["16-bit", "32-bit"], state.kv_cache_precision)}</select></label></div>
          ${field({ name: "known_model_file_size_gb", label: "Model File Size Override (GB)", value: state.known_model_file_size_gb, ariaLabel: "Known Model File Size" })}
          ${field({ name: "gpu_resident_fraction", label: "GPU Resident Fraction", value: state.gpu_resident_fraction, min: "0.01", step: "0.01" })}
          ${field({ name: "lora_trainable_percent", label: "LoRA Trainable Percent", value: state.lora_trainable_percent, min: "0.1", step: "0.1" })}
          <div class="field"><label>Training Settings<select name="optimizer">${options(["AdamW", "8-bit Adam", "SGD-like"], state.optimizer)}</select></label></div>
          ${field({ name: "my_gpu_vram_gb", label: "Compare with my GPU", value: state.my_gpu_vram_gb })}
          ${field({ name: "cloud_cost_override", label: "Cloud Cost Override", value: state.cloud_cost_override, fieldClass: "field-wide" })}
          <label class="check"><input name="exact_transformer_architecture" type="checkbox"${checked(state.exact_transformer_architecture)}> Exact Transformer Architecture</label>
          <label class="check"><input name="gradient_checkpointing" type="checkbox"${checked(state.gradient_checkpointing)}> Gradient checkpointing</label>
        </div>
      </details>
      <button type="submit">Calculate</button>
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
        `<p class="metric"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></p>`,
    )
    .join("");
}

function warningMarkup(warnings: string[]): string {
  return warnings
    .filter((warning) => !warning.includes("vendor guarantee"))
    .slice(0, 2)
    .map((warning) => `<p>${escapeHtml(warning)}</p>`)
    .join("");
}

function cloudMarkup(report: ReportPayload): string {
  return report.cloudCost === null
    ? ""
    : `<p class="fit-line fit-wide"><span>Cloud cost</span><strong>${escapeHtml(report.cloudCost)}</strong></p>`;
}

export function renderResults(report: ReportPayload): string {
  return `
    <section class="results">
      <section class="panel hero" aria-label="Total Required Memory">
        <div>
          <h2>Total Required Memory</h2>
          <p class="primary">Accuracy: ${escapeHtml(report.accuracy)} <span aria-hidden="true">•</span> Recommended Hardware: ${escapeHtml(shortHardwareTier(report.recommendedHardware.recommendedTier))}</p>
        </div>
        <output class="total">${escapeHtml(report.totalRequiredMemory)}</output>
      </section>
      <section class="breakdown" aria-label="Required outputs">
        ${rowsMarkup(report.breakdown)}
        <p class="metric"><span>Minimum Raw VRAM Needed</span><strong>${escapeHtml(report.minimumRawVramNeeded)}</strong></p>
      </section>
      <section class="panel calc-panel" aria-label="Calculation used">
        <details class="calc" open><summary>Calculation used</summary><code>${escapeHtml(transparentCalculation(report))}</code></details>
      </section>
      <section class="panel report-panel" aria-label="Recommended Hardware">
        <h2>Fit Details</h2>
        <div class="fit-grid">
          <p class="fit-line"><span>Hardware</span><strong>${escapeHtml(shortHardwareTier(report.recommendedHardware.recommendedTier))}</strong></p>
          <p class="fit-line"><span>Usable target</span><strong>${escapeHtml(report.recommendedHardware.usableVramTarget)}</strong></p>
          <p class="fit-line"><span>Speed</span><strong>${escapeHtml(report.speed)}</strong></p>
          ${cloudMarkup(report)}
        </div>
        <p class="fit-math">${escapeHtml(report.recommendedHardware.math)}</p>
        <details class="assumptions assumptions-details" aria-label="Assumptions"><summary>Assumptions</summary><p>Accuracy: <strong>${escapeHtml(report.accuracy)}</strong></p>${report.assumptions.map((assumption) => `<p>${escapeHtml(assumption.label)}: <strong>${escapeHtml(assumption.value)}</strong></p>`).join("")}</details>
        <section class="assumptions warnings" aria-label="Warnings"><h2>Disclaimers</h2>${warningMarkup(report.warnings)}</section>
      </section>
    </section>
  `;
}
