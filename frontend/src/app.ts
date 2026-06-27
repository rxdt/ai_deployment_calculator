import { syncConditionalControls } from "./controls";
import { renderForm, renderResults, renderStatusBar } from "./render";
import { buildReport } from "./report";
import { normalizedState, searchFromState } from "./state";
import type { BrowserRuntime } from "./types";

export { renderResults } from "./render";
export { buildReport } from "./report";
export { defaultState, normalizedState, searchFromState } from "./state";
export { isReportPayload } from "./validation";
export type { BrowserRuntime, FormState } from "./types";

function searchFromForm(form: HTMLFormElement): URLSearchParams {
  const search = new URLSearchParams();
  const formData = new FormData(form);
  const entries = formData.entries();
  for (const [name, value] of entries) {
    if (typeof value === "string") {
      search.set(name, value);
    }
  }
  return search;
}

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
      return;
    }
    if (event.type === "submit") {
      this.handleSubmit(event);
    }
  }

  public loadReport(rawSearch: URLSearchParams): void {
    const state = normalizedState(rawSearch);
    const report = buildReport(state);
    this.app.innerHTML = `${renderStatusBar()}${renderForm(state)}${renderResults(report)}`;
    syncConditionalControls(this.app);
  }

  private handleChange(event: Event): void {
    const { target } = event;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement
    ) {
      if (
        (target.name === "workload_family" ||
          target.name === "execution_mode") &&
        target.form instanceof HTMLFormElement
      ) {
        this.renderFromForm(target.form);
        return;
      }
      syncConditionalControls(this.app);
    }
  }

  private renderFromForm(form: HTMLFormElement): void {
    const search = searchFromForm(form);
    const state = normalizedState(search);
    const report = buildReport(state);
    this.app.innerHTML = `${renderStatusBar()}${renderForm(state)}${renderResults(report)}`;
    syncConditionalControls(this.app);
  }

  private handleSubmit(event: Event): void {
    event.preventDefault();
    if (!(event.target instanceof HTMLFormElement)) {
      return;
    }
    const search = searchFromForm(event.target);
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
