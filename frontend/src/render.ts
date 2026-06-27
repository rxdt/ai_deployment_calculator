import { isFamilySupportsMoe, isTrainingMode } from "./controls";
import type {
  DisplayRow,
  FormState,
  ReportPayload,
  WorkloadFamily,
} from "./types";

const FAMILY_OPTIONS: readonly [WorkloadFamily, string][] = [
  ["text_generation", "Text generation / chat"],
  ["text_encoder", "Text embeddings / reranking / classification"],
  ["encoder_decoder", "Encoder-decoder generation"],
  ["vision", "Vision understanding"],
  ["vision_language", "Vision-language / multimodal"],
  ["image_diffusion", "Image generation / diffusion"],
  ["video_generation", "Video generation"],
  ["audio", "Speech / audio"],
  ["tabular", "Tabular / classical ML"],
  ["custom", "Custom / unknown"],
];

function escapeHtml(value: string): string {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function checked(isChecked: boolean): string {
  return isChecked ? " checked" : "";
}

function selected(value: string, current: string): string {
  return value === current ? " selected" : "";
}

function options(values: readonly string[], current: string): string {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}"${selected(value, current)}>${escapeHtml(value)}</option>`,
    )
    .join("");
}

function familyOptions(current: WorkloadFamily): string {
  return FAMILY_OPTIONS.map(
    ([value, label]) =>
      `<option value="${value}"${selected(value, current)}>${label}</option>`,
  ).join("");
}

interface NumberField {
  name: keyof FormState;
  label: string;
  value: string;
  min?: string;
  step?: string;
}

function field({
  name,
  label,
  value,
  min = "0",
  step = "any",
}: NumberField): string {
  return `<div class="field"><label>${label}<input name="${name}" type="number" min="${min}" step="${step}" value="${escapeHtml(value)}"></label></div>`;
}

function integerField(
  name: keyof FormState,
  label: string,
  value: string,
): string {
  return field({ name, label, value, min: "1", step: "1" });
}

function imageFields(
  state: FormState,
  widthLabel: string,
  heightLabel: string,
): string {
  return `${integerField("image_width", widthLabel, state.image_width)}${integerField("image_height", heightLabel, state.image_height)}`;
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
  ["vision", (state) => imageFields(state, "Image Width", "Image Height")],
  [
    "vision_language",
    (state) =>
      `${integerField("text_context_tokens", "Text Context Tokens", state.text_context_tokens)}${imageFields(state, "Image Width", "Image Height")}`,
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

export function renderForm(state: FormState): string {
  const isSupportsMoe = isFamilySupportsMoe(state.workload_family);
  const isShowActive = isSupportsMoe && state.moe_enabled;
  const workloadLabel = isTrainingMode(state.execution_mode)
    ? "Micro Batch Size"
    : "Concurrent Requests";
  return `
    <form class="panel controls" aria-label="Deployment inputs">
      <h1>VRAM Deployment Calculator</h1>
      <div class="field">
        <label>Workload Family
          <select name="workload_family">${familyOptions(state.workload_family)}</select>
        </label>
      </div>
      ${field({ name: "total_params", label: "Total Resident Parameters", value: state.total_params, min: "1", step: "1" })}
      <div class="field">
        <label>Parameter Unit
          <select name="parameter_unit">${options(["B", "M", "K"], state.parameter_unit)}</select>
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
        <label>Runtime Profile
          <select name="runtime_profile">${options(["Local / Edge", "Server / Cloud"], state.runtime_profile)}</select>
        </label>
      </div>
      ${adaptiveInputFields(state)}
      <div class="field">
        <label><span data-workload-label>${workloadLabel}</span>
          <input name="workload_size" type="number" min="1" step="1" value="${escapeHtml(state.workload_size)}">
        </label>
      </div>
      <label class="check moe-control"${isSupportsMoe ? "" : " hidden"}><input name="moe_enabled" type="checkbox"${checked(state.moe_enabled)}> MoE Model</label>
      <div class="field active-params"${isShowActive ? "" : " hidden"}>
        <label>Active Parameters
          <input name="active_params" type="number" min="0.000001" step="any" value="${escapeHtml(state.active_params)}">
        </label>
      </div>
      <details class="advanced">
        <summary>Advanced assumptions</summary>
        ${field({ name: "known_model_file_size_gb", label: "Known Model File Size", value: state.known_model_file_size_gb })}
        ${field({ name: "gpu_resident_fraction", label: "GPU Resident Fraction", value: state.gpu_resident_fraction, min: "0.01", step: "0.01" })}
        <div class="field"><label>KV Cache Precision<select name="kv_cache_precision">${options(["16-bit", "8-bit / FP8", "32-bit"], state.kv_cache_precision)}</select></label></div>
        <label class="check"><input name="exact_transformer_architecture" type="checkbox"${checked(state.exact_transformer_architecture)}> Exact Transformer Architecture</label>
        ${field({ name: "lora_trainable_percent", label: "LoRA Trainable Percent", value: state.lora_trainable_percent, min: "0.1", step: "0.1" })}
        <div class="field"><label>Training Settings<select name="optimizer">${options(["AdamW", "8-bit Adam", "SGD-like"], state.optimizer)}</select></label></div>
        <label class="check"><input name="gradient_checkpointing" type="checkbox"${checked(state.gradient_checkpointing)}> Gradient checkpointing</label>
        ${field({ name: "my_gpu_vram_gb", label: "Compare with my GPU", value: state.my_gpu_vram_gb })}
        ${field({ name: "cloud_cost_override", label: "Cloud Cost Override", value: state.cloud_cost_override })}
      </details>
      <button type="submit">Calculate</button>
    </form>
  `;
}

export function renderStatusBar(): string {
  return `
    <header class="terminal-bar" aria-label="Deployment status">
      <strong>VRAM calculator</strong>
      <span>source: local TypeScript</span>
      <span>static Vite app</span>
    </header>
  `;
}

function rowsMarkup(rows: DisplayRow[]): string {
  return rows
    .map(
      (row) =>
        `<p class="metric">${escapeHtml(row.label)}<strong>${escapeHtml(row.value)}</strong></p>`,
    )
    .join("");
}

function warningMarkup(warnings: string[]): string {
  return warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("");
}

function cloudMarkup(report: ReportPayload): string {
  return report.cloudCost === null
    ? ""
    : `<p class="metric">Cloud cost<strong>${escapeHtml(report.cloudCost)}</strong></p>`;
}

export function renderResults(report: ReportPayload): string {
  return `
    <section class="results">
      <section class="panel hero" aria-label="Total Required Memory">
        <div>
          <h2>Total Required Memory</h2>
          <p class="primary">Accuracy: ${escapeHtml(report.accuracy)}</p>
          <p class="primary">Recommended Hardware: ${escapeHtml(report.recommendedHardware.recommendedTier)}</p>
        </div>
        <output class="total">${escapeHtml(report.totalRequiredMemory)}</output>
      </section>
      <section class="breakdown" aria-label="Required outputs">
        ${rowsMarkup(report.breakdown)}
        <p class="metric">Minimum Raw VRAM Needed<strong>${escapeHtml(report.minimumRawVramNeeded)}</strong></p>
        <p class="metric">Speed<strong>${escapeHtml(report.speed)}</strong></p>
        ${cloudMarkup(report)}
      </section>
      <section class="panel report-panel" aria-label="Recommended Hardware">
        <h2>Recommended Hardware</h2>
        <p>${escapeHtml(report.recommendedHardware.math)}</p>
        <p>Usable VRAM target: <strong>${escapeHtml(report.recommendedHardware.usableVramTarget)}</strong></p>
        <details class="calc"><summary>Calculation used</summary><code>${escapeHtml(report.calculation)}</code></details>
        <section class="assumptions" aria-label="Accuracy">
          <h2>Accuracy</h2>
          <p>${escapeHtml(report.accuracy)}</p>
        </section>
        <section class="assumptions" aria-label="Assumptions">
          <h2>Assumptions</h2>
          ${report.assumptions.map((assumption) => `<p>${escapeHtml(assumption.label)}: <strong>${escapeHtml(assumption.value)}</strong></p>`).join("")}
        </section>
        <section class="assumptions warnings" aria-label="Warnings">
          <h2>Warnings</h2>
          ${warningMarkup(report.warnings)}
        </section>
      </section>
    </section>
  `;
}
