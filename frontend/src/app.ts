import { syncAdapterControl, syncArchitectureControl } from "./controls";
import { renderForm, renderResults, renderStatusBar } from "./render";
import { buildReport } from "./report";
import { normalizedState, searchFromState } from "./state";
import type { BrowserRuntime } from "./types";

export { renderResults } from "./render";
export { buildReport } from "./report";
export { normalizedState, searchFromState } from "./state";
export { isReportPayload } from "./validation";
export type { BrowserRuntime, FormState, ReportPayload } from "./types";

function browserRuntime(): BrowserRuntime {
  return {
    history: history,
    location: location,
  };
}

export class CalculatorApp implements EventListenerObject {
  private readonly app: HTMLDivElement;
  private readonly runtime: BrowserRuntime;

  public constructor(
    app: HTMLDivElement,
    runtime: BrowserRuntime = browserRuntime(),
  ) {
    this.app = app;
    this.runtime = runtime;
  }

  public mount(): void {
    this.app.addEventListener("change", this);
    this.app.addEventListener("submit", this);
    this.loadReport(new URLSearchParams(this.runtime.location.search));
  }

  public handleEvent(event: Event): void {
    if (event.type === "change") {
      this.handleChange(event);
    } else if (event.type === "submit") {
      this.handleSubmit(event);
    }
  }

  public loadReport(rawSearch: URLSearchParams): void {
    const state = normalizedState(rawSearch);
    const report = buildReport(state);
    this.app.innerHTML = `${renderStatusBar()}${renderForm(state)}${renderResults(report, state)}`;
    syncAdapterControl(this.app);
    syncArchitectureControl(this.app);
  }

  private handleChange(event: Event): void {
    const { target } = event;
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLSelectElement)
    ) {
      return;
    }
    if (target.name === "trained") {
      syncAdapterControl(this.app);
    } else if (target.name === "architecture") {
      syncArchitectureControl(this.app);
    }
  }

  private handleSubmit(event: Event): void {
    event.preventDefault();
    if (!(event.target instanceof HTMLFormElement)) {
      return;
    }
    const search = new URLSearchParams();
    const formData = new FormData(event.target);
    for (const [name, value] of formData) {
      if (typeof value === "string") {
        search.set(name, value);
      }
    }
    const normalizedSearch = searchFromState(normalizedState(search));
    this.runtime.history.replaceState(
      null,
      "",
      `?${normalizedSearch.toString()}`,
    );
    this.loadReport(normalizedSearch);
  }
}

export function mountCalculator(
  app: HTMLDivElement,
  runtime: BrowserRuntime = browserRuntime(),
): CalculatorApp {
  const calculator = new CalculatorApp(app, runtime);
  calculator.mount();
  return calculator;
}
