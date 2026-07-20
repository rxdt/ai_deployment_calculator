import {
  dataSlot,
  fieldGroupNodes,
  fillFormValues,
  renderFitMeterBar,
  renderGpuClass,
  renderGpuExamples,
  renderParallelismCallout,
  clearUrlState,
  renderPresetSelection,
  renderTierFits,
  searchFromForm,
  setHiddenWithControls,
  setInapplicableWithControls,
  writeUrlFromState,
} from "./app-dom";
import type { FieldGroup } from "./app-dom";
import { buildReport } from "./report";
import { guardNumericInsertion, sanitizeNumberInput } from "./input-sanitizer";
import { activePreset, MODEL_PRESETS } from "./presets";
import { fitMeter, formatSpeed, speedLabel, whyText } from "./result-format";
import { defaultState, normalizedState } from "./state";
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
  private readonly presets: HTMLElement;

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
    const presets = dataSlot(root, "presets");
    if (presets === null) {
      throw new Error("Missing presets container");
    }
    this.root = root;
    this.form = form;
    this.rowTemplate = rowTemplate;
    this.kvCacheRow = kvCacheRow;
    this.presets = presets;
  }

  public mount(): void {
    this.wirePresets();
    const urlState = normalizedState(new URLSearchParams(location.search));
    this.applyValues(urlState, {}, false);
    this.form.addEventListener("beforeinput", guardNumericInsertion);
    const recompute = (): void => {
      this.update(true);
    };
    this.form.addEventListener("input", (event) => {
      if (event.target instanceof HTMLInputElement) {
        sanitizeNumberInput(event.target);
      }
      recompute();
    });
    this.form.addEventListener("change", recompute);
    // Enter in a field would implicitly "click" the Reset submit button and
    // wipe everything the user typed; recompute instead. Reset still submits
    // (and resets) from an explicit click or Enter on the button itself.
    this.form.addEventListener("keydown", (event) => {
      if (
        event.key !== "Enter" ||
        !(event.target instanceof HTMLInputElement)
      ) {
        return;
      }
      event.preventDefault();
      this.update(true);
    });
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      // Reset returns to the exact starting state: the default deployment the
      // page first renders, with the URL's query string dropped so the address
      // bar matches a fresh load rather than encoding a zeroed form.
      this.applyValues(defaultState(), {}, false);
      clearUrlState();
    });
  }

  private update(shouldWriteUrl = false): void {
    // Sync visibility first: searchFromForm skips disabled controls, so a
    // freshly revealed field (a preset enabling Active Parameters) must be
    // re-enabled before reading the state that feeds the report.
    this.syncControls(normalizedState(searchFromForm(this.form)));
    const state = normalizedState(searchFromForm(this.form));
    this.render(state, buildReport(state));
    if (shouldWriteUrl) {
      writeUrlFromState(state);
    }
  }

  // Attach one-click load behavior to the static preset chips by matching each
  // chip's data-preset id to the catalog. The chips ship in the HTML (not
  // injected) so they hold their space at first paint and add no layout shift.
  // The presets group holds only chip buttons, so read them as direct children
  // rather than a tag or data-* query the DOM-selector gate would reject; an id
  // absent from the catalog throws so the HTML and catalog cannot drift apart.
  private wirePresets(): void {
    for (const chip of this.presets.children) {
      const id = chip instanceof HTMLElement ? chip.dataset.preset : undefined;
      const preset = MODEL_PRESETS.find((entry) => entry.id === id);
      if (preset === undefined) {
        throw new Error(`Unknown preset chip: ${String(id)}`);
      }
      chip.addEventListener("click", () => {
        this.applyValues(defaultState(), preset.overrides);
      });
    }
  }

  // Load a full deployment into the form by seeding every control from `base`
  // and layering `overrides` on top, then recompute. Reset seeds from the empty
  // state; a preset seeds from the default deployment so unset fields stay sane.
  private applyValues(
    base: Readonly<FormState>,
    overrides: Readonly<Record<string, string | boolean>> = {},
    shouldWriteUrl = true,
  ): void {
    fillFormValues(
      this.form,
      new Map(Object.entries({ ...base, ...overrides })),
    );
    this.update(shouldWriteUrl);
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

  // The hero meter turns the answer into an at-a-glance fit signal: how much of
  // the recommended class the workload consumes. When no single class fits (no
  // model, or an overflow recommendation) there is nothing to measure, so hide
  // the bar and keep the plain "needs N GB usable VRAM" sentence instead.
  private renderFitMeter(
    report: Readonly<ReportPayload>,
    fit: Readonly<HardwareRecommendation>,
  ): void {
    const meter = fitMeter(fit);
    renderFitMeterBar(this.root, meter);
    this.setText("capacity", meter === null ? "" : meter.capacity);
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

  // Disable a select and reveal its "locked by …" note, or re-enable and hide
  // it. A disabled select is skipped by searchFromForm, so withModeConstraints
  // re-derives the pinned value on the next read — the lock needs no separate
  // value-forcing branch.
  private lockControl(name: string, noteSlot: string, isLocked: boolean): void {
    const element = this.form.elements.namedItem(name);
    if (!(element instanceof HTMLSelectElement)) {
      throw new TypeError(`Missing select control: ${name}`);
    }
    element.disabled = isLocked;
    dataSlot(this.root, noteSlot)?.toggleAttribute("hidden", !isLocked);
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

  // Grey every field in a marker group when inapplicable, keeping it visible so
  // the advanced grid holds a stable shape instead of reflowing. Disabling the
  // inner controls still excludes them from the calculation.
  private disableSlots(kind: FieldGroup, isInapplicable: boolean): void {
    for (const node of fieldGroupNodes(this.root, kind)) {
      setInapplicableWithControls(node, isInapplicable);
    }
  }

  private render(
    state: Readonly<FormState>,
    report: Readonly<ReportPayload>,
  ): void {
    const fit = report.recommendedHardware;
    renderPresetSelection(this.root, this.presets, activePreset(state));
    this.renderStatus(state, report);
    this.setText("total", report.totalRequiredMemory);
    this.renderFitMeter(report, fit);
    renderGpuClass(this.slot("gpu-class"), fit);
    renderTierFits(this.root, report.minimumRawVramNeeded);
    renderGpuExamples(this.root, fit.exampleCards);
    renderParallelismCallout(this.root, report.parallelismStrategies);
    this.setText("why", whyText(report, state.runtimeProfile));
    this.setText("min-cap", report.minimumRawVramNeeded);
    this.setText("usable-target", fit.usableVramTarget);
    this.setText("usable-on-class", fit.usableVramOnClass);
    this.setText("fit-headroom", fit.fitHeadroom);
    dataSlot(this.root, "speed-label")?.replaceChildren(
      speedLabel(report.speed),
    );
    this.setText("speed", formatSpeed(report.speed));
    this.fillRows("stat-chips", report.statChips);
    this.fillRows("calculation-rows", report.calculationRows);
    this.setText("calc-formula", report.calculation);
    this.setText("calc-numbers", report.calculationNumbers);
    this.fillRows("assumptions", report.assumptions);
    this.fillRows(
      "warnings",
      report.warnings.map((warning) => ({ label: warning, value: "" })),
    );
  }

  private syncControls(state: Readonly<FormState>): void {
    this.setControlValue("precision", state.precision);
    this.setControlValue("runtime-profile", state.runtimeProfile);
    // QLoRA pins 4-bit + Local/Edge; lock both selects and show why rather than
    // letting them silently snap back under the user.
    const isQlora = state.executionMode === "QLoRA fine-tuning";
    this.lockControl("precision", "precision-lock", isQlora);
    this.lockControl("runtime-profile", "runtime-lock", isQlora);

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
    // Advanced Assumptions and training fields stay in the layout and grey out
    // when inapplicable, so the advanced grid keeps a steady shape rather than
    // reflowing as options come and go. Disabling still keeps them out of the
    // calculation.
    this.disableSlots("moe", !isMoeApplicable);
    this.disableSlots("active", !(isMoeApplicable && state.moeEnabled));
    // LoRA Trainable % only sizes the adapter for the LoRA / QLoRA modes (both
    // contain "LoRA"); in Inference and Full training it has no effect, so grey
    // it rather than imply a setting that does nothing.
    this.disableSlots("lora", !state.executionMode.includes("LoRA"));
    // Gradient Checkpointing and the optimizer only size training state, so
    // these training-only inputs must not imply an effect on inference
    // estimates; grey them whenever the mode is plain Inference.
    this.disableSlots("training", state.executionMode === "Inference");
    setInapplicableWithControls(this.kvCacheRow, !hasDecoderKvCache(state));
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
Construct and mount the calculator app on the given document root.
@param root - the DOM root containing the calculator markup
@returns the mounted calculator instance
*/
export function mountCalculator(root: ParentNode = document): CalculatorApp {
  const calculator = new CalculatorApp(root);
  calculator.mount();
  return calculator;
}
