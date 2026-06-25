import "./styles.css";

type DisplayRow = {
  label: string;
  value: string;
};

type HardwareRow = {
  name: string;
  detail: string;
  sharding: string;
};

type ComparisonRow = {
  precision: string;
  total: string;
  savings: string;
  selected: boolean;
};

type ReportPayload = {
  total_vram: string;
  host_ram: string;
  plan: {
    primary: string;
    primary_fit: string;
    optimization: string;
  };
  breakdown: DisplayRow[];
  hardware: HardwareRow[];
  comparison: ComparisonRow[];
  assumptions: DisplayRow[];
  calculation: string;
};

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
const SUPPORTED_PRECISION_LABELS = new Set(["32-bit", "16-bit", "8-bit", "4-bit"]);
const REQUIRED_ASSUMPTION_LABELS = new Set([
  "Safety margin",
  "CUDA/system tax",
  "KV cache heuristic",
  "Host RAM rule",
  "Supported precisions",
]);
const REQUIRED_BREAKDOWN_LABELS = ["Weights", "KV cache", "Task", "CUDA/system"];
const VALID_RUNTIMES = new Set(["pytorch", "llama_cpp_gguf"]);
const VALID_ARCHITECTURES = new Set(["dense", "moe"]);
const BREAKDOWN_ROW_COUNT = 4;
const COMPARISON_ROW_COUNT = 4;
const ASSUMPTION_ROW_COUNT = 5;

type FormState = typeof DEFAULT_VALUES & {
  trained: boolean;
  use_adapter: boolean;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing app root");
}

let activeReportRequest = 0;

function option(value: string, selected: string): string {
  const marker = value === selected ? " selected" : "";
  return `<option value="${value}"${marker}>${value}-bit</option>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function isDisplayRow(value: unknown): value is DisplayRow {
  return isRecord(value) && typeof value.label === "string" && typeof value.value === "string";
}

function isHardwareRow(value: unknown): value is HardwareRow {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    hasText(value.name) &&
    typeof value.detail === "string" &&
    hasText(value.detail) &&
    typeof value.sharding === "string" &&
    hasText(value.sharding)
  );
}

function isComparisonRow(value: unknown): value is ComparisonRow {
  return (
    isRecord(value) &&
    typeof value.precision === "string" &&
    typeof value.total === "string" &&
    typeof value.savings === "string" &&
    typeof value.selected === "boolean"
  );
}

function hasSupportedComparisonRows(rows: ComparisonRow[], selectedWeightBits: string): boolean {
  const selectedRows = rows.filter((row) => row.selected);
  const precisionLabels = new Set(rows.map((row) => row.precision));
  return (
    selectedRows.length === 1 &&
    selectedRows[0].precision === `${selectedWeightBits}-bit` &&
    precisionLabels.size === SUPPORTED_PRECISION_LABELS.size &&
    Array.from(SUPPORTED_PRECISION_LABELS).every((precision) => precisionLabels.has(precision))
  );
}

function hasRequiredAssumptionRows(rows: DisplayRow[]): boolean {
  const assumptionLabels = new Set(rows.map((row) => row.label));
  return (
    rows.every((row) => hasText(row.value)) &&
    assumptionLabels.size === REQUIRED_ASSUMPTION_LABELS.size &&
    Array.from(REQUIRED_ASSUMPTION_LABELS).every((label) => assumptionLabels.has(label))
  );
}

function hasRequiredBreakdownRows(rows: DisplayRow[]): boolean {
  return rows.every(
    (row, index) => row.label === REQUIRED_BREAKDOWN_LABELS[index] && hasText(row.value),
  );
}

function isReportPayload(value: unknown, selectedWeightBits: string): value is ReportPayload {
  return (
    isRecord(value) &&
    typeof value.total_vram === "string" &&
    hasText(value.total_vram) &&
    typeof value.host_ram === "string" &&
    hasText(value.host_ram) &&
    isRecord(value.plan) &&
    typeof value.plan.primary === "string" &&
    hasText(value.plan.primary) &&
    typeof value.plan.primary_fit === "string" &&
    hasText(value.plan.primary_fit) &&
    typeof value.plan.optimization === "string" &&
    hasText(value.plan.optimization) &&
    Array.isArray(value.breakdown) &&
    value.breakdown.length === BREAKDOWN_ROW_COUNT &&
    value.breakdown.every(isDisplayRow) &&
    hasRequiredBreakdownRows(value.breakdown) &&
    Array.isArray(value.hardware) &&
    value.hardware.length > 0 &&
    value.hardware.every(isHardwareRow) &&
    Array.isArray(value.comparison) &&
    value.comparison.length === COMPARISON_ROW_COUNT &&
    value.comparison.every(isComparisonRow) &&
    hasSupportedComparisonRows(value.comparison, selectedWeightBits) &&
    Array.isArray(value.assumptions) &&
    value.assumptions.length === ASSUMPTION_ROW_COUNT &&
    value.assumptions.every(isDisplayRow) &&
    hasRequiredAssumptionRows(value.assumptions) &&
    typeof value.calculation === "string" &&
    hasText(value.calculation)
  );
}

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

function isPositiveNumber(value: string | null): value is string {
  return value !== null && Number.isFinite(Number(value)) && Number(value) > 0;
}

function isNonNegativeInteger(value: string | null): value is string {
  return value !== null && Number.isInteger(Number(value)) && Number(value) >= 0;
}

function isValidActiveParameters(value: string | null, totalParameters: string): value is string {
  const activeParameters = Number(value);
  return value !== null && Number.isFinite(activeParameters) && activeParameters > 0 && activeParameters <= Number(totalParameters);
}

function selectedBits(
  search: URLSearchParams,
  name: keyof Pick<FormState, "weight_bits" | "kv_cache_bits">,
): string | null {
  const value = lastValue(search, name) ?? DEFAULT_VALUES[name];
  return VALID_BITS.has(value) ? value : null;
}

function isChecked(value: string | null): boolean {
  return value !== null && CHECKED_VALUES.has(value.toLowerCase());
}

function normalizedState(search: URLSearchParams): FormState {
  if (Array.from(search.keys()).length === 0) {
    return defaultState();
  }
  const parameters = lastValue(search, "parameters_b");
  const context = lastValue(search, "context_tokens");
  const weightBits = selectedBits(search, "weight_bits");
  const kvCacheBits = selectedBits(search, "kv_cache_bits");
  const runtime = lastValue(search, "runtime") ?? DEFAULT_VALUES.runtime;
  const architecture = lastValue(search, "architecture") ?? DEFAULT_VALUES.architecture;
  const activeParameters = lastValue(search, "active_parameters_b") ?? DEFAULT_VALUES.active_parameters_b;
  if (
    !isPositiveNumber(parameters) ||
    !isNonNegativeInteger(context) ||
    !weightBits ||
    !kvCacheBits ||
    !VALID_RUNTIMES.has(runtime) ||
    !VALID_ARCHITECTURES.has(architecture) ||
    (architecture === "moe" && !isValidActiveParameters(activeParameters, parameters))
  ) {
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

function searchFromState(state: FormState): URLSearchParams {
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

function checked(value: boolean): string {
  return value ? " checked" : "";
}

function taskLabel(state: FormState): string {
  if (!state.trained) {
    return "Inference";
  }
  return state.use_adapter ? "QLoRA" : "Full training";
}

function renderForm(state: FormState): string {
  const adapterState = state.trained ? checked(state.use_adapter) : "";
  const adapterDisabled = state.trained ? "" : " disabled";
  const activeParametersDisabled = state.architecture === "moe" ? "" : " disabled";
  return `
    <form class="panel controls" aria-label="Deployment inputs">
      <h1>VRAM Deployment Calculator</h1>
      <label>Parameters (billions)
        <input name="parameters_b" type="number" min="0.000001" step="any"
          value="${escapeHtml(state.parameters_b)}">
      </label>
      <label>Context window
        <input name="context_tokens" type="number" min="0" step="1000"
          value="${escapeHtml(state.context_tokens)}">
      </label>
      <label>Quantization
        <select name="weight_bits">
          ${["32", "16", "8", "4"].map((bits) => option(bits, state.weight_bits)).join("")}
        </select>
      </label>
      <label>KV cache
        <select name="kv_cache_bits">
          ${["32", "16", "8", "4"].map((bits) => option(bits, state.kv_cache_bits)).join("")}
        </select>
      </label>
      <label>Runtime
        <select name="runtime">
          <option value="pytorch"${state.runtime === "pytorch" ? " selected" : ""}>PyTorch</option>
          <option value="llama_cpp_gguf"${state.runtime === "llama_cpp_gguf" ? " selected" : ""}>llama.cpp GGUF</option>
        </select>
      </label>
      <label>Architecture
        <select name="architecture">
          <option value="dense"${state.architecture === "dense" ? " selected" : ""}>Dense</option>
          <option value="moe"${state.architecture === "moe" ? " selected" : ""}>MoE</option>
        </select>
      </label>
      <label>Active parameters (billions)
        <input name="active_parameters_b" type="number" min="0.000001" step="any"
          value="${escapeHtml(state.active_parameters_b)}"${activeParametersDisabled}>
      </label>
      <label class="check"><input name="trained" type="checkbox"${checked(state.trained)}> Model is trained</label>
      <label class="check"><input name="use_adapter" type="checkbox"${adapterState}${adapterDisabled}> LoRA adapter</label>
      <button type="submit">Calculate</button>
    </form>
  `;
}

function renderStatusBar(): string {
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
    .map((row) => `<p class="metric">${escapeHtml(row.label)}<strong>${escapeHtml(row.value)}</strong></p>`)
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
  return rows.map((row) => `<p>${escapeHtml(row.label)}: <strong>${escapeHtml(row.value)}</strong></p>`).join("");
}

function renderResults(report: ReportPayload, state: FormState): string {
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
            <table>
              <thead><tr><th>GPU</th><th>Cards</th><th>Mode</th></tr></thead>
              <tbody>${renderHardware(report.hardware)}</tbody>
            </table>
          </section>
          <section aria-label="Quantization comparison">
            <h2>Quantization</h2>
            <table>
              <thead><tr><th>Bits</th><th>Total</th><th>Saves</th></tr></thead>
              <tbody>${renderComparison(report.comparison)}</tbody>
            </table>
          </section>
        </div>
        <p class="optimization">${escapeHtml(report.plan.optimization)}</p>
        <details class="calc">
          <summary>Calculation used</summary>
          <code>${escapeHtml(report.calculation)}</code>
        </details>
        <section class="assumptions" aria-label="Assumptions">
          <h2>Assumptions</h2>
          ${renderAssumptions(report.assumptions)}
        </section>
      </section>
    </section>
  `;
}

function renderError(): string {
  return `
    <section class="results">
      <div class="panel error" role="alert">
        <h2>Report unavailable</h2>
        <p>Unable to load report. Check the backend and retry.</p>
      </div>
    </section>
  `;
}

function syncAdapterControl(): void {
  const trained = app.querySelector<HTMLInputElement>('input[name="trained"]');
  const adapter = app.querySelector<HTMLInputElement>('input[name="use_adapter"]');
  if (!trained || !adapter) {
    return;
  }
  adapter.disabled = !trained.checked;
  if (!trained.checked) {
    adapter.checked = false;
  }
}

function syncArchitectureControl(): void {
  const architecture = app.querySelector<HTMLSelectElement>('select[name="architecture"]');
  const activeParameters = app.querySelector<HTMLInputElement>('input[name="active_parameters_b"]');
  if (!architecture || !activeParameters) {
    return;
  }
  activeParameters.disabled = architecture.value !== "moe";
}

async function loadReport(rawSearch: URLSearchParams): Promise<void> {
  const requestId = (activeReportRequest += 1);
  const state = normalizedState(rawSearch);
  const search = searchFromState(state);
  try {
    const response = await fetch(`/api/report?${search.toString()}`);
    if (!response.ok) {
      throw new Error(`Report request failed: ${response.status}`);
    }
    const report: unknown = await response.json();
    if (!isReportPayload(report, state.weight_bits)) {
      throw new Error("Report payload does not match the frontend contract");
    }
    if (requestId !== activeReportRequest) {
      return;
    }
    app.innerHTML = `${renderStatusBar()}${renderForm(state)}${renderResults(report, state)}`;
  } catch {
    if (requestId !== activeReportRequest) {
      return;
    }
    app.innerHTML = `${renderStatusBar()}${renderForm(state)}${renderError()}`;
  }
  syncAdapterControl();
  syncArchitectureControl();
}

app.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.name === "trained") {
    syncAdapterControl();
  }
  if (target.name === "architecture") {
    syncArchitectureControl();
  }
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const search = new URLSearchParams();
  for (const [name, value] of new FormData(form)) {
    if (typeof value === "string") {
      search.set(name, value);
    }
  }
  const normalizedSearch = searchFromState(normalizedState(search));
  history.replaceState(null, "", `?${normalizedSearch.toString()}`);
  void loadReport(normalizedSearch);
});

void loadReport(new URLSearchParams(location.search));
