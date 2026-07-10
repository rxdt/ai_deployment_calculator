import {
  dataSlot,
  searchFromForm,
  setHiddenWithControls,
  toStateKey,
} from "./app-dom";
import { buildReport } from "./report";
import { sanitizeNumberInput } from "./input-sanitizer";
import {
  fitMeter,
  formatSpeed,
  gpuExamples,
  recommendedGpuClass,
  speedLabel,
  whyText,
} from "./result-format";
import { normalizedState, zeroState } from "./state";
import {
  statusFitLabel,
  statusModeLabel,
  statusModelLabel,
} from "./status-format";
import type {
  DisplayRow,
  FormState,
  HardwareRecommendation,
  ReportPayload,
} from "./types";
import { hasDecoderKvCache, hasMoeControl } from "./workload-visibility";

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
      if (!this.exitQloRAOnPrecisionChange(event)) {
        this.update();
      }
    });
    this.form.addEventListener("change", (event) => {
      if (!this.exitQloRAOnPrecisionChange(event)) {
        this.update();
      }
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
    this.render(state, buildReport(state));
  }

  private reset(
    overrides: Readonly<Record<string, string | boolean>> = {},
  ): void {
    const values = new Map<string, string | boolean>([
      ...Object.entries(zeroState()),
      ...Object.entries(overrides),
    ]);
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

  private exitQloRAOnPrecisionChange(event: Event): boolean {
    const { target } = event;
    const executionMode = this.form.elements.namedItem("execution-mode");
    if (
      !(target instanceof HTMLSelectElement) ||
      !(executionMode instanceof HTMLSelectElement) ||
      target.name !== "precision" ||
      target.value === "4-bit" ||
      executionMode.value !== "QLoRA fine-tuning"
    ) {
      return false;
    }
    this.reset({ executionMode: "Inference", precision: target.value });
    return true;
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

  private setDataSlotText(name: string, value: string): void {
    const slot = dataSlot(this.root, name);
    if (slot === null) {
      throw new Error(`Missing data slot: ${name}`);
    }
    slot.textContent = value;
  }

  private renderStatus(
    state: Readonly<FormState>,
    report: Readonly<ReportPayload>,
  ): void {
    this.setDataSlotText("status-model", statusModelLabel(state));
    this.setDataSlotText("status-mode", statusModeLabel(state));
    this.setDataSlotText("status-precision", state.precision.toUpperCase());
    this.setDataSlotText("status-fit", statusFitLabel(report));
  }

  // Concrete example cards for the recommended tier are a trust signal, so name
  // them in the reasoning panel; drop the whole row when the tier has none (no
  // model, or an overflow recommendation with no single-card fit).
  private renderGpuExamples(examples: string): void {
    this.setText("gpu-examples", examples);
    dataSlot(this.root, "gpu-examples-row")?.toggleAttribute(
      "hidden",
      examples === "",
    );
  }

  // The hero meter turns the answer into an at-a-glance fit signal: how much of
  // the recommended class the workload consumes. When no single class fits (no
  // model, or an overflow recommendation) there is nothing to measure, so hide
  // the bar and keep the plain "needs N GB usable VRAM" sentence instead.
  private renderFitMeter(
    report: Readonly<ReportPayload>,
    fit: Readonly<HardwareRecommendation>,
  ): void {
    const meter = fitMeter(fit);
    const bar = dataSlot(this.root, "fit-meter");
    if (!(bar instanceof HTMLMeterElement)) {
      throw new TypeError("Missing fit meter");
    }
    bar.hidden = meter === null;
    bar.value = meter?.fillPercent ?? 0;
    this.setText(
      "vram-say",
      meter === null
        ? `The workload needs ${report.totalRequiredMemory} usable VRAM.`
        : meter.summary,
    );
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

  private render(
    state: Readonly<FormState>,
    report: Readonly<ReportPayload>,
  ): void {
    const fit = report.recommendedHardware;
    this.renderStatus(state, report);
    this.setText("total", report.totalRequiredMemory);
    this.renderFitMeter(report, fit);
    this.setText("gpu-class", recommendedGpuClass(fit.recommendedTier));
    this.renderGpuExamples(gpuExamples(fit.recommendedTier));
    this.setText("why", whyText(report));
    this.setText("min-cap", report.minimumRawVramNeeded);
    this.setText("usable-target", fit.usableVramTarget);
    this.setText("usable-on-class", fit.usableVramOnClass);
    this.setText("fit-headroom", fit.fitHeadroom);
    dataSlot(this.root, "speed-label")?.replaceChildren(
      speedLabel(report.speed),
    );
    this.setText("speed", formatSpeed(report.speed));
    this.fillRows("breakdown-rows", report.breakdown);
    this.fillRows("calculation-rows", report.calculationRows);
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
        ? "Concurrent Batch Requests"
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
