import { syncAdapterControl, syncArchitectureControl } from "./controls";
import { renderError, renderForm, renderResults, renderStatusBar } from "./render";
import { normalizedState, searchFromState } from "./state";
import { isReportPayload } from "./validation";
import type { BrowserRuntime } from "./types";

export { renderResults } from "./render";
export { normalizedState, searchFromState } from "./state";
export { isReportPayload } from "./validation";
export type { BrowserRuntime, FormState, ReportPayload } from "./types";

export function browserRuntime(): BrowserRuntime {
  return {
    fetch: window.fetch.bind(window),
    history: window.history,
    location: window.location,
  };
}

export class CalculatorApp implements EventListenerObject {
  private activeReportRequest = 0;

  constructor(
    private readonly app: HTMLDivElement,
    private readonly runtime: BrowserRuntime = browserRuntime(),
  ) {}

  mount(): void {
    this.app.addEventListener("change", this);
    this.app.addEventListener("submit", this);
    void this.loadReport(new URLSearchParams(this.runtime.location.search));
  }

  handleEvent(event: Event): void {
    if (event.type === "change") {
      this.handleChange(event);
    }
    if (event.type === "submit") {
      this.handleSubmit(event);
    }
  }

  async loadReport(rawSearch: URLSearchParams): Promise<void> {
    const requestId = (this.activeReportRequest += 1);
    const state = normalizedState(rawSearch);
    const search = searchFromState(state);
    try {
      const response = await this.runtime.fetch(`/api/report?${search.toString()}`);
      if (!response.ok) {
        throw new Error(`Report request failed: ${String(response.status)}`);
      }
      const report: unknown = await response.json();
      if (!isReportPayload(report, state.weight_bits)) {
        throw new Error("Report payload does not match the frontend contract");
      }
      if (requestId !== this.activeReportRequest) {
        return;
      }
      this.app.innerHTML = `${renderStatusBar()}${renderForm(state)}${renderResults(report, state)}`;
    } catch {
      if (requestId !== this.activeReportRequest) {
        return;
      }
      this.app.innerHTML = `${renderStatusBar()}${renderForm(state)}${renderError()}`;
    }
    syncAdapterControl(this.app);
    syncArchitectureControl(this.app);
  }

  private handleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.name === "trained") {
      syncAdapterControl(this.app);
    }
    if (target.name === "architecture") {
      syncArchitectureControl(this.app);
    }
  }

  private handleSubmit(event: Event): void {
    event.preventDefault();
    const search = new URLSearchParams();
    for (const [name, value] of new FormData(event.target as HTMLFormElement)) {
      if (typeof value === "string") {
        search.set(name, value);
      }
    }
    const normalizedSearch = searchFromState(normalizedState(search));
    this.runtime.history.replaceState(null, "", `?${normalizedSearch.toString()}`);
    void this.loadReport(normalizedSearch);
  }
}

export function mountCalculator(app: HTMLDivElement, runtime: BrowserRuntime = browserRuntime()): CalculatorApp {
  const calculator = new CalculatorApp(app, runtime);
  calculator.mount();
  return calculator;
}
