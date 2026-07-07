// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import indexHtml from "../index.html?raw";
import { CalculatorApp, mountCalculator, sanitizeNumberInput } from "./app";

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
  form.dataset["slot"] = "inputs-form";
  return form;
}

/**
 Build the row template element the app clones for output rows.
@returns a detached #row-template element
*/
function makeTemplate(): HTMLTemplateElement {
  const template = document.createElement("template");
  template.dataset["slot"] = "row-template";
  return template;
}

/**
 Look up an output slot by its data-out name.
@param name - the data-out slot name
@returns the matching output slot
*/
function outSlot(name: string): HTMLElement {
  const nodes = [...document.querySelectorAll<HTMLElement>("[data-out]")];
  const slot = nodes.find((node) => node.dataset["out"] === name);
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
 Look up an element by its data-slot value.
@param name - data-slot value
@returns the matching element
*/
function dataSlot(name: string): HTMLElement {
  const nodes = [...document.querySelectorAll<HTMLElement>("[data-slot]")];
  const slot = nodes.find((node) => node.dataset["slot"] === name);
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

  test("keeps rendering when the KV precision select is missing from its row", () => {
    loadDom();
    field("kv-cache-precision").remove();
    expect(() => mountCalculator(document)).not.toThrow();
  });
});

describe("mounted calculator", () => {
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
    expect(out("confidence")).toBe("Estimated");
    expect(out("speed")).toMatch(/tokens\/sec$/u);
    expect(outSlot("breakdown").children).toHaveLength(5);
  });

  test("keeps the confidence label visible and adapts it to the workload", () => {
    loadDom();
    mountCalculator(document);
    // The confidence label lives outside every collapsible <details> panel, so
    // none of its ancestors is a <details> and it needs no expansion to show.
    let ancestor = outSlot("confidence").parentElement;
    while (ancestor !== null) {
      expect(ancestor.tagName).not.toBe("DETAILS");
      ancestor = ancestor.parentElement;
    }
    expect(out("confidence")).toBe("Estimated");
    fireChange("workload-family", "image_diffusion");
    expect(out("confidence")).toBe("Rough");
  });

  test("recomputes when a numeric input changes", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "104");
    expect(out("total")).toBe("245.4 GB");
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

  test("sanitizes negatives, exponents, and clamps the maximum", () => {
    loadDom();
    mountCalculator(document);
    fireInput("context-tokens", "-9e5");
    expect(field("context-tokens").value).toBe("95");
    fireInput("context-tokens", "1000000");
    expect(field("context-tokens").value).toBe("999999");
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

  test("prevents form submission so the page never reloads", () => {
    loadDom();
    mountCalculator(document);
    const event = new Event("submit", { bubbles: true, cancelable: true });
    const wasSubmissionAllowed = inputsForm().dispatchEvent(event);
    expect(wasSubmissionAllowed).toBe(false);
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

  test("renders the why detail outputs", () => {
    loadDom();
    mountCalculator(document);
    expect(out("usable-on-class")).not.toBe("");
    expect(out("fit-headroom")).not.toBe("");
    expect(out("why")).toContain("advertised VRAM");
  });
});

describe("adaptive controls", () => {
  test("shows family-specific inputs and hides MoE for vision", () => {
    loadDom();
    mountCalculator(document);
    expect(isRowHidden("context-tokens")).toBe(false);
    fireChange("workload-family", "vision");
    expect(isRowHidden("context-tokens")).toBe(true);
    expect(isRowHidden("image-width")).toBe(false);
    expect(isRowHidden("moe-enabled")).toBe(true);
  });

  test("reveals active parameters only when MoE is checked", () => {
    loadDom();
    mountCalculator(document);
    expect(isRowHidden("moe-enabled")).toBe(false);
    expect(isRowHidden("active-params")).toBe(true);
    const moe = field("moe-enabled");
    if (moe instanceof HTMLInputElement) {
      moe.checked = true;
    }
    moe.dispatchEvent(new Event("change", { bubbles: true }));
    expect(isRowHidden("active-params")).toBe(false);
  });

  test("ignores a checked hidden MoE box after switching workload family", () => {
    loadDom();
    mountCalculator(document);
    fireChange("workload-family", "vision");
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
    expect(out("speed")).toBe(visionSpeed);
    expect(outSlot("warnings").textContent).not.toContain(
      "MoE active parameters",
    );
  });

  test("switches the workload size label for training", () => {
    loadDom();
    mountCalculator(document);
    const label = document.querySelector("[data-workload-label]");
    expect(label?.textContent).toBe("Concurrent Requests");
    fireChange("execution-mode", "Full training");
    expect(label?.textContent).toBe("Micro Batch Size");
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
});

describe("sanitizeNumberInput", () => {
  test("keeps a single decimal point for decimal inputs", () => {
    const input = document.createElement("input");
    input.inputMode = "decimal";
    input.value = "1.2.3";
    sanitizeNumberInput(input);
    expect(input.value).toBe("1.23");
  });

  test("leaves an already-clean value untouched", () => {
    const input = document.createElement("input");
    input.inputMode = "numeric";
    input.value = "42";
    sanitizeNumberInput(input);
    expect(input.value).toBe("42");
  });
});

describe("main entrypoint", () => {
  test("mounts against the document on import", async () => {
    loadDom();
    await import("./main");
    expect(out("total")).toBe("19.0 GB");
  });
});
