import { buildReport } from "./report";
import { normalizedState, zeroState } from "./state";
import type { DisplayRow, FormState, ReportPayload } from "./types";

const NUMBER_MAX = 999_999;

function controlEntry(element: Element): [string, string] | null {
  if (element instanceof HTMLSelectElement) {
    return [element.name, element.value];
  }
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox") {
      return element.checked ? [element.name, "on"] : null;
    }
    return [element.name, element.value];
  }
  return null;
}

function searchFromForm(form: HTMLFormElement): URLSearchParams {
  const search = new URLSearchParams();
  for (const element of form.elements) {
    const entry = controlEntry(element);
    if (entry !== null) {
      search.set(entry[0], entry[1]);
    }
  }
  return search;
}

export function sanitizeNumberInput(input: HTMLInputElement): void {
  const digitsOnly = input.value.replaceAll(/[^\d.]/gu, "");
  const [integer = "", ...fractions] = digitsOnly.split(".");
  let next =
    input.inputMode === "decimal" && fractions.length > 0
      ? `${integer}.${fractions.join("")}`
      : integer;
  if (next !== "" && Number(next) > NUMBER_MAX) {
    next = String(NUMBER_MAX);
  }
  if (input.value !== next) {
    input.value = next;
  }
}

function shortHardwareClass(value: string): string {
  const index = value.indexOf(", e.g.");
  return index === -1 ? value : value.slice(0, index);
}

// "24 GB high-end consumer class" -> "24 GB"; "" when there is no GB capacity
// prefix (e.g. "No model loaded", overflow guidance).
function leadingCapacity(value: string): string {
  const index = value.indexOf(" GB");
  return index === -1 ? "" : `${value.slice(0, index)} GB`;
}

function recommendedGpuClass(tier: string): string {
  const short = shortHardwareClass(tier);
  const capacity = leadingCapacity(short);
  return capacity === "" ? short : `${capacity} GPU hardware tier`;
}

function whyText(report: ReportPayload): string {
  const fit = report.recommendedHardware;
  const capacity = leadingCapacity(shortHardwareClass(fit.recommendedTier));
  if (capacity === "") {
    return fit.math;
  }
  return `At an ${fit.usableVramTarget} usable VRAM target, ${report.totalRequiredMemory} requires a GPU with at least ${report.minimumRawVramNeeded} advertised VRAM. The next common class is ${capacity}.`;
}

function formatSpeed(speed: string): string {
  return speed.replaceAll("/second", "/sec");
}

export class CalculatorApp {
  private readonly root: ParentNode;
  private readonly form: HTMLFormElement;
  private readonly rowTemplate: HTMLTemplateElement;
  private readonly resetButton: HTMLButtonElement;

  public constructor(root: ParentNode) {
    const form = root.querySelector<HTMLFormElement>("form.inputs");
    if (form === null) {
      throw new Error("Missing inputs form");
    }
    const rowTemplate =
      root.querySelector<HTMLTemplateElement>("#row-template");
    if (rowTemplate === null) {
      throw new Error("Missing row template");
    }
    const resetButton = root.querySelector<HTMLButtonElement>(
      '[data-action="reset"]',
    );
    if (resetButton === null) {
      throw new Error("Missing reset button");
    }
    this.root = root;
    this.form = form;
    this.rowTemplate = rowTemplate;
    this.resetButton = resetButton;
  }

  public mount(): void {
    this.form.addEventListener("input", (event) => {
      if (event.target instanceof HTMLInputElement) {
        sanitizeNumberInput(event.target);
      }
      this.update();
    });
    this.form.addEventListener("change", () => {
      this.update();
    });
    this.resetButton.addEventListener("click", () => {
      this.reset();
    });
    // The form has a submit button (accessibility); the calculator is reactive,
    // so submitting must not navigate or reload.
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
    });
    this.update();
  }

  private update(): void {
    const state = normalizedState(searchFromForm(this.form));
    this.syncControls(state);
    this.render(buildReport(state));
  }

  private reset(): void {
    const values = new Map<string, string | boolean>(
      Object.entries(zeroState()),
    );
    for (const element of this.form.elements) {
      if (element instanceof HTMLInputElement && element.type === "checkbox") {
        element.checked = values.get(element.name) === true;
      } else if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement
      ) {
        element.value = String(values.get(element.name));
      }
    }
    this.update();
  }

  private slot(name: string): HTMLElement {
    for (const node of this.root.querySelectorAll<HTMLElement>("[data-out]")) {
      if (node.dataset["out"] === name) {
        return node;
      }
    }
    throw new Error(`Missing output slot: ${name}`);
  }

  private setText(name: string, value: string): void {
    this.slot(name).textContent = value;
  }

  private fillRows(name: string, rows: DisplayRow[]): void {
    const list = this.slot(name);
    list.replaceChildren();
    for (const { label, value } of rows) {
      const item = document.importNode(this.rowTemplate.content, true);
      const [labelCell, valueCell] =
        item.querySelectorAll<HTMLElement>("[data-slot]");
      if (labelCell === undefined || valueCell === undefined) {
        throw new Error("Missing row template slots");
      }
      labelCell.textContent = label;
      valueCell.textContent = value;
      list.append(item);
    }
  }

  private render(report: ReportPayload): void {
    const fit = report.recommendedHardware;
    this.setText("total", report.totalRequiredMemory);
    this.setText(
      "vram-say",
      `The workload needs ${report.totalRequiredMemory} usable VRAM.`,
    );
    this.setText("gpu-class", recommendedGpuClass(fit.recommendedTier));
    this.setText("why", whyText(report));
    this.setText("min-cap", report.minimumRawVramNeeded);
    this.setText("usable-target", fit.usableVramTarget);
    this.setText("usable-on-class", fit.usableVramOnClass);
    this.setText("fit-headroom", fit.fitHeadroom);
    this.setText("speed", formatSpeed(report.speed));
    this.fillRows("breakdown", report.breakdown);
    this.setText("calc-formula", report.calculation);
    this.fillRows("assumptions", report.assumptions);
    this.fillRows(
      "warnings",
      report.warnings.map((warning) => ({ label: warning, value: "" })),
    );
  }

  private syncControls(state: FormState): void {
    const family = state.workload_family;
    for (const node of this.root.querySelectorAll<HTMLElement>(
      "[data-families]",
    )) {
      node.hidden = !String(node.dataset["families"])
        .split(" ")
        .includes(family);
    }
    let isMoeApplicable = false;
    for (const node of this.root.querySelectorAll<HTMLElement>(
      "[data-moe-families]",
    )) {
      isMoeApplicable = String(node.dataset["moeFamilies"])
        .split(" ")
        .includes(family);
      node.hidden = !isMoeApplicable;
    }
    const isActiveVisible = isMoeApplicable && state.moe_enabled;
    for (const node of this.root.querySelectorAll<HTMLElement>(
      "[data-active]",
    )) {
      node.hidden = !isActiveVisible;
    }
    const label =
      state.execution_mode === "Inference"
        ? "Concurrent Requests"
        : "Micro Batch Size";
    for (const node of this.root.querySelectorAll<HTMLElement>(
      "[data-workload-label]",
    )) {
      node.textContent = label;
    }
  }
}

export function mountCalculator(root: ParentNode = document): CalculatorApp {
  const calculator = new CalculatorApp(root);
  calculator.mount();
  return calculator;
}
