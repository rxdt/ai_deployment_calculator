import { buildReport } from "./report";
import { normalizedState, zeroState } from "./state";
import type { DisplayRow, FormState, ReportPayload } from "./types";
import { hasDecoderKvCache, hasMoeControl } from "./workload-visibility";

const NUMBER_MAX = 999_999;

/**
 Convert a kebab-case wire name (HTML `name` attribute) to the camelCase
 FormState key used internally.
@param name - kebab-case wire name
@returns the camelCase state key
*/
function toStateKey(name: string): string {
  return name.replaceAll(/-([a-z])/gu, (fullMatch, c: string) =>
    fullMatch.slice(-c.length).toUpperCase(),
  );
}

/**

@param element
*/
function selectEntry(element: HTMLSelectElement): [string, string] | null {
  if (element.disabled) {
    return null;
  }
  return [element.name, element.value];
}

/**

@param element
*/
function inputEntry(element: HTMLInputElement): [string, string] | null {
  if (element.disabled) {
    return null;
  }
  if (element.type === "checkbox") {
    return element.checked ? [element.name, "on"] : null;
  }
  return [element.name, element.value];
}

/**

@param element
*/
function controlEntry(element: Element): [string, string] | null {
  if (element instanceof HTMLSelectElement) {
    return selectEntry(element);
  }
  if (element instanceof HTMLInputElement) {
    return inputEntry(element);
  }
  return null;
}

/**

@param form
*/
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

/**

@param input
*/
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

/**

@param value
*/
function shortHardwareClass(value: string): string {
  const index = value.indexOf(", e.g.");
  return index === -1 ? value : value.slice(0, index);
}

// "24 GB high-end consumer class" -> "24 GB"; "" when there is no GB capacity
// prefix (e.g. "No model loaded", overflow guidance).
/**

@param value
*/
function leadingCapacity(value: string): string {
  const index = value.indexOf(" GB");
  return index === -1 ? "" : `${value.slice(0, index)} GB`;
}

/**

@param tier
*/
function recommendedGpuClass(tier: string): string {
  const short = shortHardwareClass(tier);
  const capacity = leadingCapacity(short);
  return capacity === "" ? short : `${capacity} GPU hardware tier`;
}

/**

@param report
*/
function whyText(report: Readonly<ReportPayload>): string {
  const fit = report.recommendedHardware;
  const capacity = leadingCapacity(shortHardwareClass(fit.recommendedTier));
  if (capacity === "") {
    return fit.math;
  }
  return `At an ${fit.usableVramTarget} usable VRAM target, ${report.totalRequiredMemory} requires a GPU with at least ${report.minimumRawVramNeeded} advertised VRAM. The next common class is ${capacity}.`;
}

/**

@param speed
*/
function formatSpeed(speed: string): string {
  return speed.replaceAll("/second", "/sec");
}

/**
Look up an element by its data-slot value.
@param root - DOM root to search
@param name - data-slot value
*/
function dataSlot(root: ParentNode, name: string): HTMLElement | null {
  for (const node of root.querySelectorAll<HTMLElement>("[data-slot]")) {
    if (node.dataset.slot === name) {
      return node;
    }
  }
  return null;
}

/**

@param node
@param isDisabled
*/
function setDescendantControlsDisabled(
  node: Element,
  isDisabled: boolean,
): void {
  for (const child of node.children) {
    if (
      child instanceof HTMLInputElement ||
      child instanceof HTMLSelectElement
    ) {
      child.disabled = isDisabled;
    }
    setDescendantControlsDisabled(child, isDisabled);
  }
}

/**

@param node
@param isHidden
*/
function setHiddenWithControls(node: HTMLElement, isHidden: boolean): void {
  node.hidden = isHidden;
  setDescendantControlsDisabled(node, isHidden);
}

export class CalculatorApp {
  private readonly root: ParentNode;
  private readonly form: HTMLFormElement;
  private readonly rowTemplate: HTMLTemplateElement;
  private readonly kvCacheRow: HTMLElement;

  public constructor(root: ParentNode) {
    const form = dataSlot(root, "inputs-form");
    if (!(form instanceof HTMLFormElement)) {
      throw new TypeError("Missing inputs form");
    }
    const rowTemplate = dataSlot(root, "row-template");
    if (!(rowTemplate instanceof HTMLTemplateElement)) {
      throw new TypeError("Missing row template");
    }
    const resetButton = root.querySelector('[data-action="reset"]');
    if (!(resetButton instanceof HTMLButtonElement)) {
      throw new TypeError("Missing reset button");
    }
    const kvCacheRow = dataSlot(root, "kv-cache-row");
    if (kvCacheRow === null) {
      throw new Error("Missing KV cache row");
    }
    this.root = root;
    this.form = form;
    this.rowTemplate = rowTemplate;
    this.kvCacheRow = kvCacheRow;
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
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.reset();
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
        element.checked = values.get(toStateKey(element.name)) === true;
      } else if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement
      ) {
        element.value = String(values.get(toStateKey(element.name)));
      }
    }
    this.update();
  }

  private slot(name: string): HTMLElement {
    for (const node of this.root.querySelectorAll<HTMLElement>("[data-out]")) {
      if (node.dataset.out === name) {
        return node;
      }
    }
    throw new Error(`Missing output slot: ${name}`);
  }

  private setText(name: string, value: string): void {
    this.slot(name).textContent = value;
  }

  private setControlValue(name: string, value: string): void {
    const element = this.form.elements.namedItem(name);
    if (!(
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement
    )) {
      throw new TypeError(`Missing form control: ${name}`);
    }
    element.value = value;
  }

  private setCheckboxChecked(name: string, isChecked: boolean): void {
    const element = this.form.elements.namedItem(name);
    if (!(element instanceof HTMLInputElement && element.type === "checkbox")) {
      throw new TypeError(`Missing checkbox control: ${name}`);
    }
    element.checked = isChecked;
  }

  private fillRows(name: string, rows: readonly DisplayRow[]): void {
    const list = this.slot(name);
    list.replaceChildren();
    list.removeAttribute("aria-busy");
    list.toggleAttribute("hidden", rows.length === 0);
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

  private render(report: Readonly<ReportPayload>): void {
    const fit = report.recommendedHardware;
    this.setText("total", report.totalRequiredMemory);
    this.setText(
      "vram-say",
      `The workload needs ${report.totalRequiredMemory} usable VRAM.`,
    );
    this.setText("gpu-class", recommendedGpuClass(fit.recommendedTier));
    this.setText("confidence", report.confidence);
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

  private syncControls(state: Readonly<FormState>): void {
    this.setControlValue("precision", state.precision);
    this.setControlValue("runtime-profile", state.runtimeProfile);

    const family = state.workloadFamily;
    for (const node of this.root.querySelectorAll<HTMLElement>(
      "[data-families]",
    )) {
      // The [data-families] selector guarantees the attribute is present, so String()
      // only ever wraps a real value; it avoids a nullish-default branch that no real
      // DOM state could exercise.
      setHiddenWithControls(
        node,
        !String(node.dataset.families).split(" ").includes(family),
      );
    }
    const isMoeApplicable = hasMoeControl(family);
    this.setCheckboxChecked("moe-enabled", state.moeEnabled && isMoeApplicable);
    for (const node of this.root.querySelectorAll<HTMLElement>(
      "[data-moe-families]",
    )) {
      setHiddenWithControls(node, !isMoeApplicable);
    }
    const isActiveVisible = isMoeApplicable && state.moeEnabled;
    for (const node of this.root.querySelectorAll<HTMLElement>(
      "[data-active]",
    )) {
      setHiddenWithControls(node, !isActiveVisible);
    }
    setHiddenWithControls(this.kvCacheRow, !hasDecoderKvCache(state));
    const label =
      state.executionMode === "Inference"
        ? "Concurrent Requests"
        : "Micro Batch Size";
    for (const node of this.root.querySelectorAll<HTMLElement>(
      "[data-workload-label]",
    )) {
      node.textContent = label;
    }
  }
}

/**

@param root
*/
export function mountCalculator(root: ParentNode = document): CalculatorApp {
  const calculator = new CalculatorApp(root);
  calculator.mount();
  return calculator;
}
