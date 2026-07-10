// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import indexHtml from "../index.html?raw";
import { CalculatorApp, mountCalculator } from "./app";
import { sanitizeNumberInput } from "./input-sanitizer";

const CONTRACTED_LABELS = new Map([
  ["workload-family", "Model Family"],
  ["total-params", "Total Model Parameters"],
  ["parameter-unit", "Parameter Unit"],
  ["precision", "Precision"],
  ["execution-mode", "Execution Mode"],
  ["runtime-profile", "Runtime Profile"],
  ["known-model-file-size-gb", "Known Model File Size"],
]);

const PUBLIC_WORKLOAD_NAMES = [
  "text-generation / chat",
  "text embeddings / reranking / classification",
  "encoder-decoder generation",
  "vision understanding",
  "vision-language / multimodal",
  "image-generation / diffusion",
  "video-generation",
  "speech / audio",
  "tabular / classical ml",
  "custom / unknown",
];

const REPLACED_PUBLIC_NAMES = [
  "Workload Family",
  "Text generation / chat",
  "Text embeddings / reranking / classification",
  "Encoder-decoder generation",
  "Vision understanding",
  "Vision-language / multimodal",
  "Image generation / diffusion",
  "Video generation",
  "Speech / audio",
  "Tabular / classical ML",
  "Custom / unknown",
  "LLM / text generation",
  "Text encoder / embeddings / reranking / classification",
  "Known Resident Model Size",
];

/**
 Render the real index.html into the jsdom document body.
*/
function loadDom(): void {
  document.body.replaceChildren();
  const parsed = new DOMParser().parseFromString(indexHtml, "text/html");
  document.body.append(...parsed.body.childNodes);
}

/**
 Build an empty inputs form element.
@returns a detached form.inputs element
*/
function makeForm(): HTMLFormElement {
  const form = document.createElement("form");
  form.classList.add("inputs");
  form.dataset.slot = "inputs-form";
  return form;
}

/**
 Build the row template element the app clones for output rows.
@returns a detached #row-template element
*/
function makeTemplate(): HTMLTemplateElement {
  const template = document.createElement("template");
  template.dataset.slot = "row-template";
  return template;
}

/**
 Look up an output slot by its data-out name.
@param name - the data-out slot name
@returns the matching output slot
*/
function outSlot(name: string): HTMLElement {
  const nodes = [...document.querySelectorAll<HTMLElement>("[data-out]")];
  const slot = nodes.find((node) => node.dataset.out === name);
  if (slot === undefined) {
    throw new TypeError(`Missing output slot: ${name}`);
  }
  return slot;
}

/**
 Read the text of an output slot by its data-out name.
@param name - the data-out slot name
@returns the slot's text content
*/
function out(name: string): string {
  return outSlot(name).textContent;
}

/**
 Return all output slot names present in the document.
@returns data-out names in DOM order
*/
function outputNames(): string[] {
  return [...document.querySelectorAll<HTMLElement>("[data-out]")].map((node) =>
    String(node.dataset.out),
  );
}

/**
 Return all data-slot names present in the document.
@returns data-slot names in DOM order
*/
function dataSlotNames(): string[] {
  return [...document.querySelectorAll<HTMLElement>("[data-slot]")].map(
    (node) => String(node.dataset.slot),
  );
}

/**
 Find the details panel containing an output slot.
@param slot - output slot inside the panel
@returns the containing details panel
*/
function containingDetails(slot: HTMLElement): HTMLDetailsElement {
  let parent = slot.parentElement;
  while (parent !== null) {
    if (parent instanceof HTMLDetailsElement) {
      return parent;
    }
    parent = parent.parentElement;
  }
  throw new TypeError("Missing containing details panel");
}

/**
 Look up an element by its data-slot value.
@param name - data-slot value
@returns the matching element
*/
function dataSlot(name: string): HTMLElement {
  const nodes = [...document.querySelectorAll<HTMLElement>("[data-slot]")];
  const slot = nodes.find((node) => node.dataset.slot === name);
  if (slot === undefined) {
    throw new TypeError(`Missing data slot: ${name}`);
  }
  return slot;
}

/**
 Return the mounted inputs form.
@returns the form.inputs element
*/
function inputsForm(): HTMLFormElement {
  const form = dataSlot("inputs-form");
  if (!(form instanceof HTMLFormElement)) {
    throw new TypeError("Missing inputs form");
  }
  return form;
}

/**
 Look up a form control by its kebab-case wire name.
@param name - the control's name attribute
@returns the matching input or select element
*/
function field(name: string): HTMLInputElement | HTMLSelectElement {
  const node = inputsForm().elements.namedItem(name);
  if (!(
    node instanceof HTMLInputElement || node instanceof HTMLSelectElement
  )) {
    throw new TypeError(`Missing field: ${name}`);
  }
  return node;
}

/**
 Read the visible label text for a control by field name.
@param name - the control's name attribute
@returns normalized label text
*/
function labelTextFor(name: string): string {
  const control = field(name);
  const label = control.labels?.[0];
  if (!(label instanceof HTMLLabelElement)) {
    throw new TypeError(`Missing label for: ${name}`);
  }
  return label.textContent.trim().replaceAll(/\s+/gu, " ");
}

/**
 Return the visible option labels for a select field.
@param name - the control's name attribute
@returns normalized option text
*/
function optionText(name: string): string[] {
  const control = field(name);
  if (!(control instanceof HTMLSelectElement)) {
    throw new TypeError(`${name} control must be a select`);
  }
  return [...control.options].map((option) =>
    option.textContent.trim().replaceAll(/\s+/gu, " "),
  );
}

/**
 Set a control's value and dispatch an input event.
@param name - the control's name attribute
@param value - the value to set
*/
function fireInput(name: string, value: string): void {
  const node = field(name);
  node.value = value;
  node.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 Return the reset button, throwing if it is missing.
@returns the reset button element
*/
function requireButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    '[data-action="reset"]',
  );
  if (button === null) {
    throw new Error("Missing reset button");
  }
  return button;
}

/**
 Set a control's value and dispatch a change event.
@param name - the control's name attribute
@param value - the value to set
*/
function fireChange(name: string, value: string): void {
  const node = field(name);
  node.value = value;
  node.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 Report whether the row containing a control is hidden.
@param name - the control's name attribute
@returns true when the enclosing row is hidden
*/
function isRowHidden(name: string): boolean {
  let row = field(name).parentElement;
  while (row instanceof HTMLElement && row.tagName !== "P") {
    row = row.parentElement;
  }
  return row instanceof HTMLElement && row.hidden === true;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("CalculatorApp construction", () => {
  test("throws when the inputs form is missing", () => {
    expect(() => new CalculatorApp(document.createElement("div"))).toThrow(
      "Missing inputs form",
    );
  });

  test("throws when the row template is missing", () => {
    const root = document.createElement("div");
    root.append(makeForm());
    expect(() => new CalculatorApp(root)).toThrow("Missing row template");
  });

  test("throws when the reset button is missing", () => {
    const root = document.createElement("div");
    root.append(makeForm(), makeTemplate());
    expect(() => new CalculatorApp(root)).toThrow("Missing reset button");
  });

  test("throws when an output slot is missing", () => {
    loadDom();
    document.querySelector('[data-out="total"]')?.remove();
    expect(() => mountCalculator(document)).toThrow(
      "Missing output slot: total",
    );
  });

  test("throws when the row template lacks slots", () => {
    loadDom();
    const template = dataSlot("row-template");
    if (template instanceof HTMLTemplateElement) {
      template.content.replaceChildren(document.createElement("li"));
    }
    expect(() => mountCalculator(document)).toThrow(
      "Missing row template slots",
    );
  });

  test("throws when the KV cache row is missing", () => {
    loadDom();
    dataSlot("kv-cache-row").remove();
    expect(() => mountCalculator(document)).toThrow("Missing KV cache row");
  });

  test("throws when a required synchronized form control is missing", () => {
    loadDom();
    field("precision").remove();
    expect(() => mountCalculator(document)).toThrow(
      "Missing form control: precision",
    );
  });

  test("throws when a required synchronized checkbox is missing", () => {
    loadDom();
    field("moe-enabled").remove();
    expect(() => mountCalculator(document)).toThrow(
      "Missing checkbox control: moe-enabled",
    );
  });

  test("keeps rendering when the KV precision select is missing from its row", () => {
    loadDom();
    field("kv-cache-precision").remove();
    expect(() => mountCalculator(document)).not.toThrow();
  });
});

describe("naming contract", () => {
  test("renders public UI names from the naming contract in the real form", () => {
    loadDom();
    mountCalculator(document);

    for (const [id, expected] of CONTRACTED_LABELS) {
      expect(labelTextFor(id)).toBe(expected);
    }
    expect(optionText("workload-family")).toEqual(PUBLIC_WORKLOAD_NAMES);
    expect(
      dataSlot("advanced-assumptions").firstElementChild?.textContent.trim(),
    ).toBe("Advanced assumptions");
    for (const oldName of REPLACED_PUBLIC_NAMES) {
      expect(document.body.textContent).not.toContain(oldName);
    }
  });
});

describe("checkbox indicators", () => {
  test("renders explicit visual state indicators for every checkbox control", () => {
    loadDom();
    mountCalculator(document);
    const checkboxNames = [
      "moe-enabled",
      "gradient-checkpointing",
      "memory-sharding-enabled",
    ];

    for (const name of checkboxNames) {
      const control = field(name);
      const label = control.labels?.[0];
      if (!(label instanceof HTMLLabelElement)) {
        throw new TypeError(`Missing checkbox label: ${name}`);
      }
      const state = control.nextElementSibling;
      expect(control).toBeInstanceOf(HTMLInputElement);
      if (!(state instanceof HTMLSpanElement)) {
        throw new TypeError(`Missing checkbox indicator: ${name}`);
      }
      expect(state.dataset.slot).toBe("checkbox-indicator");
      expect(state.getAttribute("aria-hidden")).toBe("true");
    }
  });
});

describe("mounted calculator", () => {
  test("renders the compact product brand in the header", () => {
    loadDom();
    mountCalculator(document);
    const brand = dataSlot("brand");
    expect(brand.textContent).toBe("~VRAM-calculator");
    expect(brand).not.toBeInstanceOf(HTMLAnchorElement);
  });

  test("renders a labeled GitHub repository link with a logo", () => {
    loadDom();
    mountCalculator(document);
    const link = dataSlot("github-link");
    if (!(link instanceof HTMLAnchorElement)) {
      throw new TypeError("GitHub link must be an anchor");
    }
    expect(link.href).toBe("https://github.com/rxdt/ai_deployment_calculator/");
    expect(link.getAttribute("aria-label")).toBe("GitHub repository");
    expect(link.firstElementChild).toBeInstanceOf(HTMLImageElement);
    expect(link.firstElementChild?.getAttribute("src")).toBe(
      "/github-mark.svg",
    );
    expect(link.textContent.trim()).toBe("GitHub");
  });

  test("renders canonical parameter unit choices in the real form", () => {
    loadDom();
    mountCalculator(document);
    const unit = field("parameter-unit");
    if (!(unit instanceof HTMLSelectElement)) {
      throw new TypeError("Parameter Unit control must be a select");
    }
    expect([...unit.options].map((option) => option.textContent)).toEqual([
      "B",
      "M",
    ]);
    expect([...unit.options].map((option) => option.value)).toEqual(["B", "M"]);
  });

  test("renders the canonical execution mode choices in the real form", () => {
    loadDom();
    mountCalculator(document);
    const executionMode = field("execution-mode");
    if (!(executionMode instanceof HTMLSelectElement)) {
      throw new TypeError("Execution Mode control must be a select");
    }
    const choices = [
      "Inference",
      "LoRA fine-tuning",
      "QLoRA fine-tuning",
      "Full training",
    ];

    expect(
      [...executionMode.options].map((option) => option.textContent),
    ).toEqual(choices);
    expect([...executionMode.options].map((option) => option.value)).toEqual(
      choices,
    );
  });

  test("renders the contracted main form controls before advanced assumptions", () => {
    loadDom();
    mountCalculator(document);
    const mainControlNames = [
      "workload-family",
      "total-params",
      "parameter-unit",
      "precision",
      "execution-mode",
      "runtime-profile",
      "context-tokens",
      "workload-size",
      "moe-enabled",
    ];
    const advanced = dataSlot("advanced-assumptions");
    if (!(advanced instanceof HTMLDetailsElement)) {
      throw new TypeError("Advanced assumptions must be a details element");
    }

    for (const name of mainControlNames) {
      const control = field(name);
      expect(advanced.contains(control)).toBe(false);
    }
    expect(isRowHidden("moe-enabled")).toBe(false);
    expect(isRowHidden("active-params")).toBe(true);
  });

  test("keeps rare controls inside the advanced assumptions disclosure", () => {
    loadDom();
    mountCalculator(document);
    const advanced = dataSlot("advanced-assumptions");
    if (!(advanced instanceof HTMLDetailsElement)) {
      throw new TypeError("Advanced assumptions must be a details element");
    }
    const rareControlNames = [
      "kv-cache-precision",
      "known-model-file-size-gb",
      "gpu-resident-fraction",
      "lora-trainable-percent",
      "optimizer",
      "gradient-checkpointing",
      "memory-sharding-enabled",
    ];

    expect(advanced.firstElementChild?.textContent.trim()).toBe(
      "Advanced assumptions",
    );
    for (const name of rareControlNames) {
      expect(advanced.contains(field(name))).toBe(true);
    }
  });

  test("renders the output disclaimer below the estimate", () => {
    loadDom();
    mountCalculator(document);
    const disclaimer = dataSlot("output-disclaimer");
    expect(disclaimer.textContent).toContain(
      "validate against the target runtime",
    );
  });

  test("renders the default 7B estimate on mount", () => {
    loadDom();
    mountCalculator(document);
    expect(out("total")).toBe("19.0 GB");
    expect(out("vram-say")).toBe("The workload needs 19.0 GB usable VRAM.");
    expect(out("gpu-class")).toBe("24 GB GPU hardware tier");
    expect(dataSlot("gpu-class-label").textContent.trim()).toBe(
      "Recommended GPU Class",
    );
    expect(out("min-cap")).toBe("22.4 GB");
    expect(out("speed")).toMatch(/tokens\/sec$/u);
    expect(outSlot("calculation-rows").children).toHaveLength(10);
  });

  test("renders reset as the only form action because estimates are reactive", () => {
    loadDom();
    mountCalculator(document);
    const actions = [...dataSlot("form-actions").children];
    expect(actions).toHaveLength(1);
    const [action] = actions;
    if (action === undefined) {
      throw new TypeError("Missing form action");
    }
    expect(action).toBe(requireButton());
    expect(requireButton().type).toBe("submit");
    expect(requireButton().hidden).toBe(false);
    expect(requireButton().textContent.trim()).toBe("Reset");
  });

  test("omits the retired confidence output from the rendered estimate", () => {
    loadDom();
    mountCalculator(document);

    expect(document.body.textContent).not.toContain("Confidence");
    expect(dataSlotNames()).not.toContain("confidence-label");
    expect(outputNames()).not.toContain("confidence");

    fireChange("workload-family", "image_diffusion");
    expect(document.body.textContent).not.toContain("Confidence");
    expect(outputNames()).not.toContain("confidence");
  });

  test("keeps secondary result sections collapsed behind contracted summaries", () => {
    loadDom();
    mountCalculator(document);
    const whyPanel = containingDetails(outSlot("why"));
    const calculationPanel = containingDetails(outSlot("calculation-rows"));
    const formulaPanel = containingDetails(outSlot("calc-formula"));
    const assumptionsPanel = containingDetails(outSlot("assumptions"));
    const summaries = [
      whyPanel,
      calculationPanel,
      formulaPanel,
      assumptionsPanel,
    ].map((panel) => panel.firstElementChild?.textContent);

    expect(summaries).toEqual([
      "Why this recommendation",
      "Calculation used",
      "Formula used",
      "Assumptions used",
    ]);
    for (const panel of [
      whyPanel,
      calculationPanel,
      formulaPanel,
      assumptionsPanel,
    ]) {
      expect(panel.open).toBe(false);
    }
  });

  test("labels the speed estimate with the rendered workload unit", () => {
    const cases = [
      ["text_generation", "Estimated Speed (tokens/sec)", "tokens/sec"],
      ["image_diffusion", "Estimated Speed (images/min)", "images/minute"],
      ["video_generation", "Estimated Speed (clips/min)", "clips/minute"],
      ["tabular", "Estimated Speed (rows/sec)", "rows/sec"],
      ["audio", "Estimated Speed (audio tokens/sec)", "audio tokens/sec"],
    ] as const;
    loadDom();
    mountCalculator(document);
    const label = dataSlot("speed-label");

    for (const [family, expectedLabel, expectedSpeedUnit] of cases) {
      fireChange("workload-family", family);
      expect(label.textContent).toBe(expectedLabel);
      expect(out("speed")).toContain(expectedSpeedUnit);
    }
  });

  test("renders only first-glance results outside the collapsed detail panels", () => {
    loadDom();
    mountCalculator(document);
    const firstGlanceSlots = ["total", "vram-say", "gpu-class"];
    const detailSlots = [
      "why",
      "min-cap",
      "usable-target",
      "usable-on-class",
      "fit-headroom",
      "speed",
      "calculation-rows",
      "calc-formula",
      "assumptions",
    ];

    expect(out("total")).toBe("19.0 GB");
    expect(out("vram-say")).toBe("The workload needs 19.0 GB usable VRAM.");
    expect(out("gpu-class")).toBe("24 GB GPU hardware tier");
    for (const name of firstGlanceSlots) {
      expect(() => containingDetails(outSlot(name))).toThrow(
        "Missing containing details panel",
      );
    }

    expect(out("why")).toContain("advertised VRAM");
    expect(out("min-cap")).toBe("22.4 GB");
    expect(out("usable-target")).toBe("85%");
    expect(out("usable-on-class")).toBe("20.4 GB");
    expect(out("fit-headroom")).toBe("1.4 GB usable margin");
    expect(out("speed")).toMatch(/tokens\/sec$/u);
    expect(out("calculation-rows")).toContain("Required_GB");
    expect(out("calculation-rows")).toContain("19.0 GB");
    expect(out("calc-formula")).toContain("Working_Memory_GB");
    expect(out("calc-formula")).not.toContain("19.0 GB");
    expect(out("assumptions")).toContain("Precision16-bit");
    for (const name of detailSlots) {
      expect(containingDetails(outSlot(name)).open).toBe(false);
    }
  });

  test("does not restore removed accuracy or personal GPU fit outputs", () => {
    loadDom();
    mountCalculator(document);
    const text = document.body.textContent;

    expect(text).not.toContain("Accuracy");
    expect(text).not.toContain("Your GPU Fit");
    expect(() => outSlot("accuracy")).toThrow("Missing output slot: accuracy");
    expect(() => outSlot("gpu-fit")).toThrow("Missing output slot: gpu-fit");
  });

  test("recomputes when a numeric input changes", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "104");
    expect(out("total")).toBe("245.4 GB");
  });

  test("preserves fractional model parameter inputs", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "3.8");
    expect(field("total-params").value).toBe("3.8");
    expect(out("total")).toBe("11.4 GB");
  });

  test("recomputes on input and change from a select", () => {
    loadDom();
    mountCalculator(document);
    // selects fire input then change; the input event exercises the
    // non-input-element branch of the input listener.
    fireInput("precision", "4-bit");
    fireChange("precision", "4-bit");
    expect(out("total")).not.toBe("19.0 GB");
  });

  test("reflects QLoRA forced precision and runtime in the form controls", () => {
    loadDom();
    mountCalculator(document);

    fireChange("execution-mode", "QLoRA fine-tuning");

    expect(field("precision").value).toBe("4-bit");
    expect(field("runtime-profile").value).toBe("Local / Edge");
    expect(out("assumptions")).toContain("4-bit");
    expect(out("assumptions")).toContain("Local / Edge");

    fireChange("runtime-profile", "Server / Cloud");

    expect(field("precision").value).toBe("4-bit");
    expect(field("runtime-profile").value).toBe("Local / Edge");
  });

  test("sanitizes negatives, exponents, and clamps the maximum", () => {
    loadDom();
    mountCalculator(document);
    fireInput("context-tokens", "-9e5");
    expect(field("context-tokens").value).toBe("95");
    fireInput("context-tokens", "100000000");
    expect(field("context-tokens").value).toBe("99999999");
  });

  test("reset zeroes inputs and outputs and explains the empty estimate", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "104");
    requireButton().click();
    expect(field("total-params").value).toBe("0");
    expect(out("total")).toBe("0.0 GB");
    expect(out("gpu-class")).toBe("No model loaded");
    expect(out("why")).toContain("Enter model and workload inputs");
  });

  test("submit resets the reactive form without allowing navigation", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "104");
    const event = new Event("submit", { bubbles: true, cancelable: true });
    const wasSubmissionAllowed = inputsForm().dispatchEvent(event);
    expect(wasSubmissionAllowed).toBe(false);
    expect(field("total-params").value).toBe("0");
    expect(out("total")).toBe("0.0 GB");
  });

  test("serializes a checked MoE box into the estimate", () => {
    loadDom();
    mountCalculator(document);
    const moe = field("moe-enabled");
    if (moe instanceof HTMLInputElement) {
      moe.checked = true;
    }
    moe.dispatchEvent(new Event("change", { bubbles: true }));
    expect(out("total")).toBe("19.0 GB");
  });

  test("renders training warnings and drops the standard disclaimer", () => {
    loadDom();
    mountCalculator(document);
    fireChange("execution-mode", "Full training");
    const warnings =
      document.querySelector('[data-out="warnings"]')?.textContent ?? "";
    expect(warnings).toContain("Training estimates include parameter state");
    expect(warnings).not.toContain("vendor guarantee");
  });

  test("renders no warnings by default and keeps the warning list hidden", () => {
    loadDom();
    mountCalculator(document);
    const warnings = outSlot("warnings");
    expect(warnings.hidden).toBe(true);
    expect(warnings.textContent).toBe("");
  });

  test("renders the why detail outputs", () => {
    loadDom();
    mountCalculator(document);
    expect(out("usable-on-class")).not.toBe("");
    expect(out("fit-headroom")).not.toBe("");
    expect(out("why")).toContain("advertised VRAM");
  });
});

describe("recommended GPU examples", () => {
  test("names concrete example cards for the recommended tier in the why panel", () => {
    loadDom();
    mountCalculator(document);
    const row = dataSlot("gpu-examples-row");

    expect(out("gpu-class")).toBe("24 GB GPU hardware tier");
    expect(out("gpu-examples")).toBe("RTX 3090 / RTX 4090 class");
    expect(row.hidden).toBe(false);
    // The example cards belong with the reasoning, not the first-glance answer.
    expect(containingDetails(outSlot("gpu-examples")).open).toBe(false);
    expect(dataSlot("why-panel").contains(row)).toBe(true);
  });

  test("moves the example cards to match a changed recommendation tier", () => {
    loadDom();
    mountCalculator(document);
    expect(out("gpu-examples")).toContain("RTX 4090");

    fireInput("total-params", "1");

    expect(out("gpu-class")).toBe("8 GB GPU hardware tier");
    expect(out("gpu-examples")).toBe("RTX 4060 / older 8 GB GPUs");
  });

  test("drops the example row when no model is loaded", () => {
    loadDom();
    mountCalculator(document);
    requireButton().click();

    expect(out("gpu-class")).toBe("No model loaded");
    expect(out("gpu-examples")).toBe("");
    expect(dataSlot("gpu-examples-row").hidden).toBe(true);
  });

  test("renders the sharded-fit overflow guidance verbatim without a tier suffix", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "104");

    // The guidance names a "320 GB" tier mid-sentence; the class card must show
    // it verbatim, not mistake that for a leading capacity and append
    // "GPU hardware tier".
    expect(out("gpu-class")).toBe(
      "No single-GPU fit. Enable memory sharding to fit a 320 GB sharded datacenter class (4x 80 GB GPUs with tensor/model parallelism), or use offload.",
    );
    expect(out("gpu-examples")).toBe("");
    expect(dataSlot("gpu-examples-row").hidden).toBe(true);
  });

  test("keeps the sharded qualifier in the class card instead of implying one GPU", () => {
    loadDom();
    mountCalculator(document);
    fireChange("runtime-profile", "Local / Edge");
    fireInput("total-params", "62");
    const sharding = field("memory-sharding-enabled");
    if (sharding instanceof HTMLInputElement) {
      sharding.checked = true;
    }
    sharding.dispatchEvent(new Event("change", { bubbles: true }));

    // The tier is 2x 80 GB GPUs, so the class card must say "sharded" rather
    // than "160 GB GPU hardware tier", which would read as a single 160 GB card
    // that does not exist. The multi-GPU makeup stays in the examples row.
    expect(out("gpu-class")).toBe("160 GB sharded datacenter class");
    expect(out("gpu-class")).not.toContain("GPU hardware tier");
    expect(out("gpu-examples")).toBe(
      "2x 80 GB GPUs with tensor/model parallelism",
    );
  });
});

describe("QLoRA precision switching", () => {
  test("switching precision away from QLoRA resets to an inference deployment", () => {
    loadDom();
    mountCalculator(document);

    fireInput("total-params", "8");
    fireChange("execution-mode", "QLoRA fine-tuning");
    fireInput("precision", "16-bit");

    expect(field("execution-mode").value).toBe("Inference");
    expect(field("precision").value).toBe("16-bit");
    expect(field("runtime-profile").value).toBe("Server / Cloud");
    expect(field("total-params").value).toBe("0");
    expect(out("total")).toBe("0.0 GB");
  });

  test("a bare precision change event also exits QLoRA to an inference deployment", () => {
    loadDom();
    mountCalculator(document);

    fireInput("total-params", "8");
    fireChange("execution-mode", "QLoRA fine-tuning");
    expect(field("precision").value).toBe("4-bit");

    // Some engines emit a change without a preceding input; the change listener
    // must run the same QLoRA-exit guard rather than leaving a stale base state.
    fireChange("precision", "16-bit");

    expect(field("execution-mode").value).toBe("Inference");
    expect(field("precision").value).toBe("16-bit");
    expect(field("total-params").value).toBe("0");
    expect(out("total")).toBe("0.0 GB");
  });
});

describe("adaptive controls", () => {
  test("shows family-specific inputs and hides MoE for vision", () => {
    loadDom();
    mountCalculator(document);
    expect(isRowHidden("context-tokens")).toBe(false);
    expect(field("context-tokens").disabled).toBe(false);
    fireChange("workload-family", "vision");
    expect(isRowHidden("context-tokens")).toBe(true);
    expect(field("context-tokens").disabled).toBe(true);
    expect(isRowHidden("image-width")).toBe(false);
    expect(field("image-width").disabled).toBe(false);
    expect(isRowHidden("moe-enabled")).toBe(true);
    expect(field("moe-enabled").disabled).toBe(true);
  });

  test("rerenders adaptive controls from change events without submitting", () => {
    loadDom();
    mountCalculator(document);
    let submitCount = 0;
    inputsForm().addEventListener("submit", () => {
      submitCount += 1;
    });

    fireChange("workload-family", "vision");
    expect(isRowHidden("context-tokens")).toBe(true);
    expect(isRowHidden("image-width")).toBe(false);

    fireChange("execution-mode", "Full training");
    expect(dataSlot("form-actions").textContent).toContain("Reset");
    expect(isRowHidden("kv-cache-precision")).toBe(true);
    expect(dataSlot("workload-label").textContent.trim()).toBe(
      "Micro Batch Size",
    );
    expect(submitCount).toBe(0);
  });

  test("exposes the MoE control for exactly the MoE-applicable families", () => {
    const moeVisibleByFamily: readonly (readonly [string, boolean])[] = [
      ["text_generation", true],
      ["text_encoder", true],
      ["encoder_decoder", true],
      ["vision_language", true],
      ["custom", true],
      ["vision", false],
      ["image_diffusion", false],
      ["video_generation", false],
      ["audio", false],
      ["tabular", false],
    ];
    loadDom();
    mountCalculator(document);
    for (const [family, isVisible] of moeVisibleByFamily) {
      fireChange("workload-family", family);
      expect(isRowHidden("moe-enabled")).toBe(!isVisible);
    }
  });

  test("reveals active parameters only when MoE is checked", () => {
    loadDom();
    mountCalculator(document);
    expect(isRowHidden("moe-enabled")).toBe(false);
    expect(isRowHidden("active-params")).toBe(true);
    expect(field("active-params").disabled).toBe(true);
    const moe = field("moe-enabled");
    if (moe instanceof HTMLInputElement) {
      moe.checked = true;
    }
    moe.dispatchEvent(new Event("change", { bubbles: true }));
    expect(isRowHidden("active-params")).toBe(false);
    expect(field("active-params").disabled).toBe(false);
  });

  test("ignores a checked hidden MoE box after switching workload family", () => {
    loadDom();
    mountCalculator(document);
    fireChange("workload-family", "vision");
    const visionTotal = out("total");
    const visionSpeed = out("speed");

    fireChange("workload-family", "text_generation");
    const moe = field("moe-enabled");
    if (moe instanceof HTMLInputElement) {
      moe.checked = true;
    }
    fireInput("active-params", "0.1");
    moe.dispatchEvent(new Event("change", { bubbles: true }));

    fireChange("workload-family", "vision");
    expect(isRowHidden("moe-enabled")).toBe(true);
    expect(out("total")).toBe(visionTotal);
    expect(out("speed")).toBe(visionSpeed);
    expect(outSlot("warnings").textContent).not.toContain(
      "MoE active parameters",
    );
  });

  test("clears stale MoE selection when returning to an applicable family", () => {
    loadDom();
    mountCalculator(document);
    const moe = field("moe-enabled");
    if (!(moe instanceof HTMLInputElement)) {
      throw new TypeError("MoE control must be a checkbox");
    }
    moe.checked = true;
    moe.dispatchEvent(new Event("change", { bubbles: true }));
    expect(moe.checked).toBe(true);
    expect(isRowHidden("active-params")).toBe(false);

    fireChange("workload-family", "vision");
    expect(moe.checked).toBe(false);
    expect(isRowHidden("moe-enabled")).toBe(true);

    fireChange("workload-family", "text_generation");
    expect(isRowHidden("moe-enabled")).toBe(false);
    expect(moe.checked).toBe(false);
    expect(isRowHidden("active-params")).toBe(true);
    expect(outSlot("warnings").textContent).not.toContain(
      "MoE active parameters",
    );
  });

  test("switches the workload size label for training", () => {
    loadDom();
    mountCalculator(document);
    const label = dataSlot("workload-label");
    expect(label.textContent.trim()).toBe("Concurrent Batch Requests");
    fireChange("execution-mode", "Full training");
    expect(label.textContent.trim()).toBe("Micro Batch Size");
  });

  test("shows KV precision only for decoder KV workloads", () => {
    loadDom();
    mountCalculator(document);
    expect(isRowHidden("kv-cache-precision")).toBe(false);

    fireChange("execution-mode", "Full training");
    expect(isRowHidden("kv-cache-precision")).toBe(true);

    fireChange("execution-mode", "Inference");
    expect(isRowHidden("kv-cache-precision")).toBe(false);

    fireChange("workload-family", "text_encoder");
    expect(isRowHidden("kv-cache-precision")).toBe(true);

    fireChange("workload-family", "encoder_decoder");
    expect(isRowHidden("kv-cache-precision")).toBe(false);

    fireChange("workload-family", "vision");
    expect(isRowHidden("kv-cache-precision")).toBe(true);

    fireChange("workload-family", "vision_language");
    expect(isRowHidden("kv-cache-precision")).toBe(false);
  });

  test("offers all KV precision choices and applies 32-bit KV cache estimates", () => {
    loadDom();
    mountCalculator(document);
    const precision = field("kv-cache-precision");
    if (!(precision instanceof HTMLSelectElement)) {
      throw new TypeError("KV precision control must be a select");
    }
    expect([...precision.options].map((option) => option.value)).toEqual([
      "8-bit / FP8",
      "16-bit",
      "32-bit",
    ]);

    fireChange("kv-cache-precision", "32-bit");

    expect(out("total")).toBe("20.1 GB");
    expect(out("assumptions")).toContain("32-bit");
  });

  test("renders resolved KV head assumptions in the real HTML output", () => {
    loadDom();
    mountCalculator(document);

    const assumptions = out("assumptions");

    expect(assumptions).toContain("KV heads used8");
    expect(assumptions).toContain("Conservative KV heads32");
  });
});

describe("advanced numeric input caps", () => {
  test("clamps advanced ratio and percent inputs to their real ranges", () => {
    loadDom();
    mountCalculator(document);
    fireInput("gpu-resident-fraction", "2");
    fireInput("lora-trainable-percent", "150");

    expect(field("gpu-resident-fraction").value).toBe("1");
    expect(field("lora-trainable-percent").value).toBe("100");
  });
});

describe("sanitizeNumberInput", () => {
  test("keeps a single decimal point for decimal inputs", () => {
    const input = document.createElement("input");
    input.inputMode = "decimal";
    input.value = "1.2.3";
    sanitizeNumberInput(input);
    expect(input.value).toBe("1.2");
  });

  test("keeps one decimal digit at the global cap", () => {
    const input = document.createElement("input");
    input.inputMode = "decimal";
    input.value = "100000000";
    sanitizeNumberInput(input);
    expect(input.value).toBe("99999999.9");
  });

  test("leaves an already-clean value untouched", () => {
    const input = document.createElement("input");
    input.inputMode = "numeric";
    input.value = "42";
    sanitizeNumberInput(input);
    expect(input.value).toBe("42");
  });

  test("falls back to the global cap when a field cap is malformed", () => {
    const input = document.createElement("input");
    input.dataset.numberMax = "not-a-number";
    input.inputMode = "numeric";
    input.value = "100000000";
    sanitizeNumberInput(input);
    expect(input.value).toBe("99999999");
  });
});

describe("main entrypoint", () => {
  test("mounts against the document on import", async () => {
    loadDom();
    await import("./main");
    expect(out("total")).toBe("19.0 GB");
  });
});
