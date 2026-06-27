import { familySupportsMoe, isTrainingMode } from "./controls";
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

function field(
  name: keyof FormState,
  label: string,
  value: string,
  min = "0",
  step = "any",
): string {
  return `<div class="field"><label>${label}<input name="${name}" type="number" min="${min}" step="${step}" value="${escapeHtml(value)}"></label></div>`;
}

function adaptiveInputFields(state: FormState): string {
  if (state.workload_family === "text_encoder") {
    return field(
      "sequence_tokens",
      "Sequence Length",
      state.sequence_tokens,
      "1",
      "1",
    );
  }
  if (state.workload_family === "encoder_decoder") {
    return `${field("input_tokens", "Input Tokens", state.input_tokens, "1", "1")}${field("output_tokens", "Output Tokens", state.output_tokens, "1", "1")}`;
  }
  if (
    state.workload_family === "vision" ||
    state.workload_family === "image_diffusion"
  ) {
    return `${field("image_width", state.workload_family === "vision" ? "Image Width" : "Output Image Width", state.image_width, "1", "1")}${field("image_height", state.workload_family === "vision" ? "Image Height" : "Output Image Height", state.image_height, "1", "1")}`;
  }
  if (state.workload_family === "vision_language") {
    return `${field("text_context_tokens", "Text Context Tokens", state.text_context_tokens, "1", "1")}${field("image_width", "Image Width", state.image_width, "1", "1")}${field("image_height", "Image Height", state.image_height, "1", "1")}`;
  }
  if (state.workload_family === "video_generation") {
    return `<div class="field"><label>Output Resolution<select name="video_resolution">${options(["720p", "1080p"], state.video_resolution)}</select></label></div>${field("video_frames", "Frames", state.video_frames, "1", "1")}`;
  }
  if (state.workload_family === "audio") {
    return field(
      "audio_seconds",
      "Audio Length",
      state.audio_seconds,
      "1",
      "1",
    );
  }
  if (state.workload_family === "tabular") {
    return `${field("rows_per_batch", "Rows per Batch", state.rows_per_batch, "1", "1")}${field("features", "Features", state.features, "1", "1")}`;
  }
  if (state.workload_family === "custom") {
    return field(
      "input_size_multiplier",
      "Input Size Preset",
      state.input_size_multiplier,
      "0.1",
      "0.1",
    );
  }
  return field(
    "context_tokens",
    "Context Window",
    state.context_tokens,
    "1",
    "1",
  );
}

export function renderForm(state: FormState): string {
  const supportsMoe = familySupportsMoe(state.workload_family);
  const showActive = supportsMoe && state.moe_enabled;
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
      ${field("total_params", "Total Resident Parameters", state.total_params, "1", "1")}
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
      <label class="check moe-control"${supportsMoe ? "" : " hidden"}><input name="moe_enabled" type="checkbox"${checked(state.moe_enabled)}> MoE Model</label>
      <div class="field active-params"${showActive ? "" : " hidden"}>
        <label>Active Parameters
          <input name="active_params" type="number" min="0.000001" step="any" value="${escapeHtml(state.active_params)}">
        </label>
      </div>
      <details class="advanced">
        <summary>Advanced assumptions</summary>
        ${field("known_model_file_size_gb", "Known Model File Size", state.known_model_file_size_gb)}
        ${field("gpu_resident_fraction", "GPU Resident Fraction", state.gpu_resident_fraction, "0.01", "0.01")}
        <div class="field"><label>KV Cache Precision<select name="kv_cache_precision">${options(["16-bit", "8-bit / FP8", "32-bit"], state.kv_cache_precision)}</select></label></div>
        <label class="check"><input name="exact_transformer_architecture" type="checkbox"${checked(state.exact_transformer_architecture)}> Exact Transformer Architecture</label>
        ${field("lora_trainable_percent", "LoRA Trainable Percent", state.lora_trainable_percent, "0.1", "0.1")}
        <div class="field"><label>Training Settings<select name="optimizer">${options(["AdamW", "8-bit Adam", "SGD-like"], state.optimizer)}</select></label></div>
        <label class="check"><input name="gradient_checkpointing" type="checkbox"${checked(state.gradient_checkpointing)}> Gradient checkpointing</label>
        ${field("my_gpu_vram_gb", "Compare with my GPU", state.my_gpu_vram_gb)}
        ${field("cloud_cost_override", "Cloud Cost Override", state.cloud_cost_override)}
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
      <span>no /api/report</span>
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
