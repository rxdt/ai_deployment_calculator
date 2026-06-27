import type {
  ComparisonRow,
  DisplayRow,
  FormState,
  HardwareRow,
  ReportPayload,
} from "./types";

function option(value: string, selected: string): string {
  const marker = value === selected ? " selected" : "";
  return `<option value="${value}"${marker}>${value}-bit</option>`;
}

function escapeHtml(value: string): string {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function checked(isChecked: boolean): string {
  return isChecked ? " checked" : "";
}

function taskLabel(state: FormState): string {
  if (!state.trained) {
    return "Inference";
  }
  return state.use_adapter ? "QLoRA" : "Full training";
}

export function renderForm(state: FormState): string {
  const adapterState = state.trained ? checked(state.use_adapter) : "";
  const adapterDisabled = state.trained ? "" : " disabled";
  const activeParametersDisabled =
    state.architecture === "moe" ? "" : " disabled";
  return `
    <form class="panel controls" aria-label="Deployment inputs">
      <h1>VRAM Deployment Calculator</h1>
      <div class="field">
        <label>Parameters (billions)
          <input name="parameters_b" type="number" min="0.000001" step="any" value="${escapeHtml(state.parameters_b)}">
        </label>
        <p class="field-hint">Model weight footprint</p>
      </div>
      <div class="field">
        <label>Context window
          <input name="context_tokens" type="number" min="0" step="1000" value="${escapeHtml(state.context_tokens)}">
        </label>
        <p class="field-hint">Tokens held in KV cache</p>
      </div>
      <div class="field">
        <label>Quantization
          <select name="weight_bits">${["32", "16", "8", "4"].map((bits) => option(bits, state.weight_bits)).join("")}</select>
        </label>
        <p class="field-hint">Precision of stored weights</p>
      </div>
      <div class="field">
        <label>KV cache
          <select name="kv_cache_bits">${["32", "16", "8", "4"].map((bits) => option(bits, state.kv_cache_bits)).join("")}</select>
        </label>
        <p class="field-hint">Precision of cached attention</p>
      </div>
      <div class="field">
        <label>Runtime
          <select name="runtime">
            <option value="pytorch"${state.runtime === "pytorch" ? " selected" : ""}>PyTorch</option>
            <option value="llama_cpp_gguf"${state.runtime === "llama_cpp_gguf" ? " selected" : ""}>llama.cpp GGUF</option>
          </select>
        </label>
        <p class="field-hint">Serving framework overhead</p>
      </div>
      <div class="field-group">
        <div class="field">
          <label>Architecture
            <select name="architecture">
              <option value="dense"${state.architecture === "dense" ? " selected" : ""}>Dense (Typical inference)</option>
              <option value="moe"${state.architecture === "moe" ? " selected" : ""}>MoE</option>
            </select>
          </label>
          <p class="field-hint">Dense or mixture-of-experts</p>
        </div>
        <div class="field field-sub">
          <label>Active parameters (billions)
            <input name="active_parameters_b" type="number" min="0.000001" step="any" value="${escapeHtml(state.active_parameters_b)}"${activeParametersDisabled}>
          </label>
          <p class="field-hint">Params active per token (MoE)</p>
        </div>
      </div>
      <label class="check"><input name="trained" type="checkbox"${checked(state.trained)}> GPUs are for model training</label>
      <label class="check"><input name="use_adapter" type="checkbox"${adapterState}${adapterDisabled}> LoRA adapter</label>
      <button type="submit">Calculate</button>
    </form>
  `;
}

export function renderStatusBar(): string {
  return `
    <nav class="terminal-bar" aria-label="Deployment status">
      <strong>~/vram-calc</strong>
      <span>&gt; system: <b>online</b></span>
      <span>&gt; inference: <b>local</b></span>
      <span>&gt; precisions: 32 / 16 / 8 / 4</span>
    </nav>
  `;
}

function renderBreakdown(rows: DisplayRow[]): string {
  return rows
    .map(
      (row) =>
        `<p class="metric">${escapeHtml(row.label)}<strong>${escapeHtml(row.value)}</strong></p>`,
    )
    .join("");
}

function renderHardware(rows: HardwareRow[]): string {
  return rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.detail)}</td><td>${escapeHtml(row.sharding)}</td></tr>`,
    )
    .join("");
}

function renderComparison(rows: ComparisonRow[]): string {
  return rows
    .map((row) => {
      const selected = row.selected ? ' class="selected"' : "";
      return `<tr${selected}><td>${escapeHtml(row.precision)}</td><td>${escapeHtml(row.total)}</td><td>${escapeHtml(row.savings)}</td></tr>`;
    })
    .join("");
}

function renderAssumptions(rows: DisplayRow[]): string {
  return rows
    .map(
      (row) =>
        `<p>${escapeHtml(row.label)}: <strong>${escapeHtml(row.value)}</strong></p>`,
    )
    .join("");
}

export function renderResults(report: ReportPayload, state: FormState): string {
  return `
    <section class="results">
      <div class="panel hero">
        <div>
          <h2>${taskLabel(state)}</h2>
          <p>${escapeHtml(report.breakdown[0].value)} weights, ${escapeHtml(report.breakdown[1].value)} KV, ${escapeHtml(report.host_ram)}</p>
          <p class="primary">Primary: ${escapeHtml(report.plan.primary)} (${escapeHtml(report.plan.primary_fit)})</p>
        </div>
        <p class="total">${escapeHtml(report.total_vram)}</p>
      </div>
      <section class="breakdown" aria-label="VRAM breakdown">${renderBreakdown(report.breakdown)}</section>
      <section class="panel report-panel" aria-label="Hardware recommendations">
        <div class="tables">
          <section aria-label="Hardware options">
            <h2>Hardware</h2>
            <table><thead><tr><th>GPU</th><th>Cards</th><th>Mode</th></tr></thead><tbody>${renderHardware(report.hardware)}</tbody></table>
          </section>
          <section aria-label="Quantization comparison">
            <h2>Quantization</h2>
            <table><thead><tr><th>Bits</th><th>Total</th><th>Saves</th></tr></thead><tbody>${renderComparison(report.comparison)}</tbody></table>
          </section>
        </div>
        <details class="calc"><summary>Calculation used</summary><code>${escapeHtml(report.calculation)}</code></details>
        <section class="assumptions" aria-label="Assumptions">
          <h2>Assumptions</h2>
          ${renderAssumptions(report.assumptions)}
        </section>
      </section>
    </section>
  `;
}
