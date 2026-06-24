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
};

const CHECKED_VALUES = new Set(["1", "true", "on", "yes"]);
const VALID_BITS = new Set(["32", "16", "8", "4"]);

type FormState = typeof DEFAULT_VALUES & {
  trained: boolean;
  use_adapter: boolean;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing app root");
}

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
  if (!isPositiveNumber(parameters) || !isNonNegativeInteger(context) || !weightBits || !kvCacheBits) {
    return defaultState();
  }
  const trained = isChecked(lastValue(search, "trained"));
  return {
    parameters_b: parameters,
    context_tokens: context,
    weight_bits: weightBits,
    kv_cache_bits: kvCacheBits,
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
      <label class="check"><input name="trained" type="checkbox"${checked(state.trained)}> Model is trained</label>
      <label class="check"><input name="use_adapter" type="checkbox"${adapterState}${adapterDisabled}> LoRA adapter</label>
      <button type="submit">Calculate</button>
    </form>
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
      <section class="panel" aria-label="Hardware recommendations">
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

async function loadReport(rawSearch: URLSearchParams): Promise<void> {
  const state = normalizedState(rawSearch);
  const search = searchFromState(state);
  try {
    const response = await fetch(`/api/report?${search.toString()}`);
    if (!response.ok) {
      throw new Error(`Report request failed: ${response.status}`);
    }
    const report = (await response.json()) as ReportPayload;
    app.innerHTML = `${renderForm(state)}${renderResults(report, state)}`;
  } catch {
    app.innerHTML = `${renderForm(state)}${renderError()}`;
  }
  syncAdapterControl();
}

app.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.name === "trained") {
    syncAdapterControl();
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
