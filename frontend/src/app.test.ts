// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import indexHtml from "../index.html?raw";
import { CalculatorApp, mountCalculator } from "./app";
import { sanitizeNumberInput } from "./input-sanitizer";
import { MODEL_PRESETS } from "./presets";
import { buildReport } from "./report";
import { defaultState } from "./state";
import type { Precision } from "./types";

const CONTRACTED_LABELS = new Map([
  ["workload-family", "Model Task Family"],
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
 Return the anchor children of the hero GPU-examples slot. Linked cards render
 as anchor elements; separators and name-only cards are text nodes, so element
 children are exactly the links.
@returns the example-card link elements in DOM order
*/
function exampleCardLinks(): HTMLAnchorElement[] {
  return [...outSlot("gpu-examples").children].filter(
    (child): child is HTMLAnchorElement => child instanceof HTMLAnchorElement,
  );
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

/**
 Read the rendered headline stat chips as label/value pairs.
@returns one entry per rendered chip, in DOM order
*/
function statChipCards(): { label: string; value: string }[] {
  return [...outSlot("stat-chips").children].map((card) => ({
    label: card.firstElementChild?.textContent ?? "",
    value: card.lastElementChild?.textContent ?? "",
  }));
}

// The hero picks its example card pseudo-randomly from the render clock; pin
// the clock to zero so the pick lands on the tier's first card and example
// assertions stay deterministic. Individual tests re-mock other picks.
beforeEach(() => {
  vi.spyOn(performance, "now").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
  document.body.replaceChildren();
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const REFERENCE_PRECISIONS: readonly Precision[] = ["16-bit", "8-bit", "4-bit"];

/**
 Walk every element under a parsed document or element without CSS selectors.
@param root - document or element to traverse
@returns descendant elements in DOM order
*/
function allElements(root: Document | Element): Element[] {
  const owner = root instanceof Document ? root : root.ownerDocument;
  const walker = owner.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const elements: Element[] = [];
  let current = walker.nextNode();
  while (current !== null) {
    if (current instanceof Element) {
      elements.push(current);
    }
    current = walker.nextNode();
  }
  return elements;
}

/**
 Parse the JSON-LD blocks from the static document head.
@param parsed - parsed index.html document
@returns structured-data objects in DOM order
*/
function structuredData(parsed: Document): Record<string, unknown>[] {
  return allElements(parsed.head)
    .filter(
      (element): element is HTMLScriptElement =>
        element instanceof HTMLScriptElement &&
        element.type === "application/ld+json",
    )
    .map((script): unknown => JSON.parse(script.textContent))
    .filter(isRecord);
}

/**
 Read one static meta tag by exact attribute value.
@param head - parsed document head
@param attribute - meta attribute to match
@param value - exact attribute value
@returns the meta content, when present
*/
function metaContent(
  head: HTMLHeadElement,
  attribute: "name" | "property",
  value: string,
): string | null {
  const meta = allElements(head).find(
    (entry): entry is HTMLMetaElement =>
      entry instanceof HTMLMetaElement &&
      entry.getAttribute(attribute) === value,
  );
  return meta?.content ?? null;
}

/**
 Read the first canonical link from the static document head.
@param head - parsed document head
@returns canonical href, when present
*/
function canonicalHref(head: HTMLHeadElement): string | null {
  const canonical = allElements(head).find(
    (entry): entry is HTMLLinkElement =>
      entry instanceof HTMLLinkElement && entry.rel === "canonical",
  );
  return canonical?.href ?? null;
}

/**
 Read visible FAQ question headings from the crawlable content.
@param parsed - parsed index.html document
@returns FAQ question text in DOM order
*/
function visibleFaqQuestions(parsed: Document): string[] {
  return allElements(parsed.body)
    .filter(
      (entry): entry is HTMLHeadingElement =>
        entry instanceof HTMLHeadingElement &&
        entry.tagName === "H3" &&
        entry.parentElement?.classList.contains("faq-item") === true,
    )
    .map((heading) => heading.textContent.trim());
}

/**
 Find the static VRAM reference table.
@param parsed - parsed index.html document
@returns the reference table
*/
function referenceTable(parsed: Document): HTMLTableElement {
  const table = allElements(parsed.body).find(
    (entry): entry is HTMLTableElement =>
      entry instanceof HTMLTableElement &&
      entry.dataset.slot === "vram-reference-table",
  );
  if (table === undefined) {
    throw new TypeError("Missing crawlable VRAM reference table");
  }
  return table;
}

describe("static SEO metadata", () => {
  test("sets crawlable keyword metadata for the calculator", () => {
    const parsed = new DOMParser().parseFromString(indexHtml, "text/html");
    const { head } = parsed;
    const title = allElements(head).find(
      (entry): entry is HTMLTitleElement => entry instanceof HTMLTitleElement,
    );

    expect(title?.textContent).toBe(
      "VRAM Calculator for LLMs, Diffusion & AI Models",
    );
    expect(metaContent(head, "name", "description")).toContain("inference");
    expect(metaContent(head, "name", "description")).toContain("fine-tuning");
    expect(metaContent(head, "name", "description")).toContain("diffusion");
    expect(metaContent(head, "name", "description")).toContain("video");
    expect(metaContent(head, "name", "robots")).toContain(
      "max-image-preview:large",
    );
    expect(canonicalHref(head)).toBe("https://vram.rxdt.dev/");
    expect(metaContent(head, "property", "og:url")).toBe(
      "https://vram.rxdt.dev/",
    );
    expect(metaContent(head, "property", "og:title")).toBe(
      "VRAM Calculator for LLMs, Diffusion & AI Models",
    );
    expect(metaContent(head, "name", "twitter:title")).toBe(
      "VRAM Calculator for LLMs, Diffusion & AI Models",
    );
    expect(metaContent(head, "property", "og:image")).toBe(
      "https://vram.rxdt.dev/og-image.png",
    );
    expect(metaContent(head, "property", "og:image:alt")).toContain(
      "18.8 GB memory estimate",
    );
    expect(metaContent(head, "name", "twitter:card")).toBe(
      "summary_large_image",
    );
  });

  test("describes the web application in structured data", () => {
    const parsed = new DOMParser().parseFromString(indexHtml, "text/html");
    const [data] = structuredData(parsed);
    if (!isRecord(data)) {
      throw new TypeError("Structured data must be a JSON object");
    }

    expect(data["@type"]).toBe("WebApplication");
    expect(data.name).toBe("VRAM Calculator for LLMs, Diffusion & AI Models");
    expect(data.applicationCategory).toBe("DeveloperApplication");
    const { offers } = data;
    if (!isRecord(offers)) {
      throw new TypeError("Structured data offers must be a JSON object");
    }
    expect(offers.price).toBe("0");
  });

  test("mirrors the visible FAQ in structured data", () => {
    const parsed = new DOMParser().parseFromString(indexHtml, "text/html");
    const visibleQuestions = visibleFaqQuestions(parsed);
    const faqSchema = structuredData(parsed).find(
      (schema) => schema["@type"] === "FAQPage",
    );
    if (!isRecord(faqSchema)) {
      throw new TypeError("FAQ structured data must be a JSON object");
    }
    const { mainEntity } = faqSchema;
    if (!Array.isArray(mainEntity)) {
      throw new TypeError("FAQ structured data must list questions");
    }
    const schemaQuestions = mainEntity.map((item) => {
      if (!isRecord(item) || typeof item.name !== "string") {
        throw new TypeError("FAQ question must be named");
      }
      return item.name;
    });

    expect(visibleQuestions).toHaveLength(7);
    expect(schemaQuestions).toEqual(visibleQuestions);
  });

  test("keeps the crawlable quick reference table equal to calculator output", () => {
    const parsed = new DOMParser().parseFromString(indexHtml, "text/html");
    const table = referenceTable(parsed);
    const rows = [...(table.tBodies.item(0)?.rows ?? [])];

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const cells = [...row.cells].map((cell) => cell.textContent.trim());
      const [model, ...values] = cells;
      if (model === undefined) {
        throw new TypeError("Reference row must name a model size");
      }
      const totalParameters = model.replace("B", "");
      const expected = REFERENCE_PRECISIONS.map(
        (precision) =>
          buildReport({
            ...defaultState(),
            totalParams: totalParameters,
            precision,
          }).totalRequiredMemory,
      );

      expect(values).toEqual(expected);
    }
  });
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

  test("throws when the fit meter slot is missing", () => {
    loadDom();
    dataSlot("fit-meter").remove();
    expect(() => mountCalculator(document)).toThrow("Missing fit meter");
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

  test("throws when the presets container is missing", () => {
    loadDom();
    dataSlot("presets").remove();
    expect(() => mountCalculator(document)).toThrow(
      "Missing presets container",
    );
  });

  test("throws when a preset chip names an unknown catalog id", () => {
    loadDom();
    const rogue = document.createElement("button");
    rogue.type = "button";
    rogue.dataset.preset = "not-a-real-model";
    dataSlot("presets").append(rogue);
    expect(() => mountCalculator(document)).toThrow(
      "Unknown preset chip: not-a-real-model",
    );
  });

  test("throws when the presets group holds a non-HTML element", () => {
    loadDom();
    const stray = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    dataSlot("presets").append(stray);
    expect(() => mountCalculator(document)).toThrow("Unknown preset chip");
  });

  test("throws when a required header status slot is missing", () => {
    loadDom();
    dataSlot("status-model").remove();
    expect(() => mountCalculator(document)).toThrow(
      "Missing data slot: status-model",
    );
  });

  test("throws when the header model link is missing", () => {
    loadDom();
    dataSlot("status-model-link").remove();
    expect(() => mountCalculator(document)).toThrow("Missing model link");
  });

  test("throws when the fit scale row is missing", () => {
    loadDom();
    dataSlot("fit-scale").remove();
    expect(() => mountCalculator(document)).toThrow(
      "Missing data slot: fit-scale",
    );
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
    // Gradient Checkpointing is training-only and hidden during Inference;
    // switch modes so every inspected indicator belongs to a visible control.
    fireChange("execution-mode", "Full training");
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

describe("enter and reset semantics", () => {
  test("Enter inside a field recomputes and never wipes the inputs", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "70");
    const before = out("total");
    expect(before).not.toBe("0.0 GB");

    // Enter in a text field is intercepted before it can implicitly "click"
    // the Reset submit button; the typed values survive.
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    const wasDefaultAllowed = field("total-params").dispatchEvent(enter);
    expect(wasDefaultAllowed).toBe(false);
    expect(field("total-params").value).toBe("70");
    expect(out("total")).toBe(before);

    // Other keys, and Enter outside a text field, pass through untouched.
    const letter = new KeyboardEvent("keydown", {
      key: "a",
      bubbles: true,
      cancelable: true,
    });
    expect(field("total-params").dispatchEvent(letter)).toBe(true);
    const enterOnSelect = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    expect(field("precision").dispatchEvent(enterOnSelect)).toBe(true);
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
});

test("hydrates from the URL and replaces it after edits", () => {
  history.replaceState(null, "", "/?total-params=70&precision=8-bit");
  loadDom();
  mountCalculator(document);

  expect(field("total-params").value).toBe("70");
  expect(field("precision").value).toBe("8-bit");

  fireInput("total-params", "13");
  const search = new URLSearchParams(location.search);
  expect(search.get("total-params")).toBe("13");
  expect(search.get("precision")).toBe("8-bit");
});

/**
 Build a cancelable beforeinput event carrying the inserted text.
@param data - the text the edit would insert, or null for deletions
@returns a bubbling, cancelable InputEvent
*/
function insertion(data: string | null): InputEvent {
  return new InputEvent("beforeinput", {
    data,
    bubbles: true,
    cancelable: true,
  });
}

describe("input integrity", () => {
  test("clearing the parameter field shows the empty estimate, not the default", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "");

    // A blank field must never silently compute the hidden 7B default.
    expect(field("total-params").value).toBe("");
    expect(out("total")).toBe("0.0 GB");
    expect(out("gpu-class")).toBe("No model loaded");
  });

  test("a zero batch normalizes visibly to the 1 the estimate uses", () => {
    loadDom();
    mountCalculator(document);
    fireInput("workload-size", "0");

    // The field and the computed concurrency agree instead of showing 0 while
    // silently computing with 1.
    expect(field("workload-size").value).toBe("1");
  });

  test("blocks non-numeric insertions instead of transforming them", () => {
    loadDom();
    mountCalculator(document);

    // "e" is rejected outright, so typed scientific notation can never be
    // silently reshaped into a different magnitude.
    expect(field("total-params").dispatchEvent(insertion("e"))).toBe(false);
    expect(field("total-params").dispatchEvent(insertion("5"))).toBe(true);
    // Deletions (null data), non-numeric controls, and non-input targets are
    // untouched.
    expect(field("total-params").dispatchEvent(insertion(null))).toBe(true);
    expect(field("moe-enabled").dispatchEvent(insertion("e"))).toBe(true);
    expect(field("precision").dispatchEvent(insertion("e"))).toBe(true);
    const plain = new Event("beforeinput", { bubbles: true, cancelable: true });
    expect(inputsForm().dispatchEvent(plain)).toBe(true);
  });
});

describe("optimizer choices", () => {
  test("offers the expanded optimizer choices with stable persisted values", () => {
    loadDom();
    mountCalculator(document);
    // The optimizer is a training-only control hidden during Inference; reveal
    // it before reading the choices it offers.
    fireChange("execution-mode", "Full training");
    const select = field("optimizer");
    if (!(select instanceof HTMLSelectElement)) {
      throw new TypeError("optimizer control must be a select");
    }
    // Visible text modernizes the naming; values stay stable so persisted
    // URLs keep parsing.
    expect(optionText("optimizer")).toEqual([
      "AdamW",
      "8-bit AdamW",
      "Paged 8-bit AdamW",
      "Adafactor",
      "SGD / Momentum",
    ]);
    expect([...select.options].map((option) => option.value)).toEqual([
      "AdamW",
      "8-bit Adam",
      "Paged 8-bit AdamW",
      "Adafactor",
      "SGD-like",
    ]);
  });
});

describe("mounted calculator", () => {
  test("renders the compact product brand with an isolated prompt marker", () => {
    loadDom();
    mountCalculator(document);
    const brand = dataSlot("brand");
    expect(brand.textContent).toBe("~VRAM-calculator");
    // The brand links to the canonical production URL from any deployment.
    if (!(brand instanceof HTMLAnchorElement)) {
      throw new TypeError("Brand must be an anchor");
    }
    expect(brand.href).toBe("https://vram.rxdt.dev/");
    // The prompt marker sits in its own element so the stylesheet greens only
    // the marker (its "~") and never the product name outside it. One marker
    // holding just "~" plus the full "~VRAM-calculator" text proves the name
    // stays unwrapped.
    const marks = [
      ...brand.querySelectorAll<HTMLElement>("[data-slot]"),
    ].filter((node) => node.dataset.slot === "brand-mark");
    expect(marks).toHaveLength(1);
    expect(dataSlot("brand-mark").textContent).toBe("~");
  });

  test("renders a labeled GitHub link with a logo", () => {
    loadDom();
    mountCalculator(document);
    const link = dataSlot("github-link");
    if (!(link instanceof HTMLAnchorElement)) {
      throw new TypeError("GitHub link must be an anchor");
    }
    expect(link.href).toBe("https://github.com/rxdt/ai_deployment_calculator");
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
    ];
    const advanced = dataSlot("advanced-assumptions");
    if (!(advanced instanceof HTMLDetailsElement)) {
      throw new TypeError("Advanced assumptions must be a details element");
    }

    for (const name of mainControlNames) {
      const control = field(name);
      expect(advanced.contains(control)).toBe(false);
    }
  });

  test("keeps rare controls inside the advanced assumptions disclosure", () => {
    loadDom();
    mountCalculator(document);
    const advanced = dataSlot("advanced-assumptions");
    if (!(advanced instanceof HTMLDetailsElement)) {
      throw new TypeError("Advanced assumptions must be a details element");
    }
    const rareControlNames = [
      "moe-enabled",
      "memory-sharding-enabled",
      "active-params",
      "kv-cache-precision",
      "known-model-file-size-gb",
      "gpu-resident-fraction",
      "lora-trainable-percent",
      "optimizer",
      "gradient-checkpointing",
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
      "Validate against your target runtime",
    );
  });

  test("renders the default 7B estimate on mount", () => {
    loadDom();
    mountCalculator(document);
    expect(out("total")).toBe("18.8 GB");
    expect(out("vram-say")).toBe(
      "Fits on one 24 GB card: 18.8 GB uses 92% of its 20.4 GB usable VRAM.",
    );
    expect(out("gpu-class")).toBe("24 GB hardware tier");
    expect(dataSlot("gpu-class-label").textContent.trim()).toBe(
      "Recommended Example",
    );
    expect(out("min-cap")).toBe("22.1 GB");
    expect(out("speed")).toMatch(/tokens\/sec$/u);
    expect(outSlot("calculation-rows").children).toHaveLength(10);
  });

  test("renders Reset as the only form action", () => {
    loadDom();
    mountCalculator(document);
    const actions = [...dataSlot("form-actions").children];
    expect(actions).toHaveLength(1);
    expect(actions[0]).toBe(requireButton());
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
      "Values Used In Calculations",
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
      "calc-numbers",
      "assumptions",
    ];

    expect(out("total")).toBe("18.8 GB");
    expect(out("vram-say")).toBe(
      "Fits on one 24 GB card: 18.8 GB uses 92% of its 20.4 GB usable VRAM.",
    );
    expect(out("gpu-class")).toBe("24 GB hardware tier");
    for (const name of firstGlanceSlots) {
      expect(() => containingDetails(outSlot(name))).toThrow(
        "Missing containing details panel",
      );
    }

    expect(out("why")).toContain("accelerator memory");
    expect(out("min-cap")).toBe("22.1 GB");
    expect(out("usable-target")).toBe("85%");
    expect(out("usable-on-class")).toBe("20.4 GB");
    expect(out("fit-headroom")).toBe("1.6 GB usable margin");
    expect(out("speed")).toMatch(/tokens\/sec$/u);
    expect(out("calculation-rows")).toContain("Total required");
    expect(out("calculation-rows")).toContain("18.8 GB");
    expect(out("calc-formula")).toContain(
      "(weights + KV cache + activations + runtime overhead) × buffer",
    );
    expect(out("calc-formula")).not.toContain("18.8 GB");
    expect(out("calc-numbers")).toBe(
      "18.8 GB ≈ (14.0 + 1.0 + 0.5 + 1.5) GB × 1.10",
    );
    expect(out("assumptions")).toContain(
      "Runtime / CUDA overhead estimated at a fixed 1.5 GB",
    );
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
    expect(out("total")).toBe("237.3 GB");
  });

  test("preserves fractional model parameter inputs", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "3.8");
    expect(field("total-params").value).toBe("3.8");
    expect(out("total")).toBe("11.6 GB");
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

    fireChange("runtime-profile", "Server / Cloud");

    expect(field("precision").value).toBe("4-bit");
    expect(field("runtime-profile").value).toBe("Local / Edge");
  });

  test("sanitizes negatives, exponents, and clamps the maximum", () => {
    loadDom();
    mountCalculator(document);
    // Truncate at the first non-numeric character instead of deleting it in
    // place, so scientific notation and signs cannot be reinterpreted as a
    // plausible-but-wrong magnitude: a leading "-" yields empty, and "9e5"
    // keeps only the leading "9" rather than fusing into "95".
    fireInput("context-tokens", "-9e5");
    expect(field("context-tokens").value).toBe("");
    fireInput("context-tokens", "9e5");
    expect(field("context-tokens").value).toBe("9");
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

  test("serializes a checked MoE box into the estimate", () => {
    loadDom();
    mountCalculator(document);
    const moe = field("moe-enabled");
    if (moe instanceof HTMLInputElement) {
      moe.checked = true;
    }
    moe.dispatchEvent(new Event("change", { bubbles: true }));
    expect(out("total")).toBe("18.8 GB");
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
    expect(out("why")).toContain("accelerator memory");
  });
});

describe("multi-GPU parallelism callout", () => {
  test("stays hidden and empty for a workload that fits one card", () => {
    loadDom();
    mountCalculator(document);
    const callout = dataSlot("parallelism");
    expect(callout.hidden).toBe(true);
    expect(out("parallelism-links")).toBe("");
  });

  test("surfaces the parallelism strategies as new-tab links when no single card fits", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "200");

    const callout = dataSlot("parallelism");
    expect(callout.hidden).toBe(false);
    expect(callout.textContent.replaceAll(/\s+/gu, " ")).toContain(
      "Too large for any single GPU or accelerator. Split the model",
    );

    const links = [...outSlot("parallelism-links").children].filter(
      (child): child is HTMLAnchorElement => child instanceof HTMLAnchorElement,
    );
    expect(links.map((link) => link.textContent)).toEqual([
      "FSDP",
      "ZeRO",
      "vLLM",
      "TP",
    ]);
    expect(links[0]?.getAttribute("href")).toBe(
      "https://pytorch.org/docs/stable/fsdp.html",
    );
    for (const link of links) {
      expect(link.target).toBe("_blank");
      expect(link.rel).toBe("noopener noreferrer");
    }
  });

  test("drops the callout again once the workload fits a single card", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "200");
    expect(dataSlot("parallelism").hidden).toBe(false);

    fireInput("total-params", "7");
    expect(dataSlot("parallelism").hidden).toBe(true);
    expect(out("parallelism-links")).toBe("");
  });
});

describe("hero fit meter", () => {
  test("shows a fit meter summarizing spare VRAM on the recommended class", () => {
    loadDom();
    mountCalculator(document);
    const meter = dataSlot("fit-meter");
    if (!(meter instanceof HTMLMeterElement)) {
      throw new TypeError("Missing fit meter");
    }

    expect(meter.hidden).toBe(false);
    expect(meter.value).toBe(92);
    // The default sits at 92%, under the 95% threshold, so the bar stays calm.
    expect(meter.classList.contains("fit-meter--tight")).toBe(false);
    expect(out("vram-say")).toBe(
      "Fits on one 24 GB card: 18.8 GB uses 92% of its 20.4 GB usable VRAM.",
    );
    // The scale row under the bar names the usable budget the bar measures.
    expect(out("capacity")).toBe("20.4 GB usable of 24 GB");
  });

  test("marks the meter amber and leads with a tight-fit caption near the budget", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "16");
    const meter = dataSlot("fit-meter");
    if (!(meter instanceof HTMLMeterElement)) {
      throw new TypeError("Missing fit meter");
    }

    expect(meter.hidden).toBe(false);
    expect(meter.value).toBe(95);
    expect(meter.classList.contains("fit-meter--tight")).toBe(true);
    expect(out("vram-say")).toBe(
      "Tight fit on one 48 GB card: 38.8 GB uses 95% of its 40.8 GB usable VRAM.",
    );
  });

  test("drops the tight signal after a tight fit relaxes to a comfortable one", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "16");
    const meter = dataSlot("fit-meter");
    if (!(meter instanceof HTMLMeterElement)) {
      throw new TypeError("Missing fit meter");
    }
    expect(meter.classList.contains("fit-meter--tight")).toBe(true);

    // 8B fills 78% of its 32 GB class: comfortably under the 95% threshold.
    fireInput("total-params", "8");

    expect(meter.classList.contains("fit-meter--tight")).toBe(false);
    expect(out("vram-say")).toContain("Fits on one 32 GB card");
  });

  test("pegs the meter full and red and says +100% when no class fits", () => {
    loadDom();
    mountCalculator(document);
    fireInput("total-params", "400");
    const meter = dataSlot("fit-meter");
    if (!(meter instanceof HTMLMeterElement)) {
      throw new TypeError("Missing fit meter");
    }

    expect(meter.hidden).toBe(false);
    expect(meter.value).toBe(100);
    expect(meter.dataset.over).toBe("true");
    expect(out("vram-say")).toMatch(
      /^\+100% usage\. The workload needs .* usable VRAM\.$/u,
    );
    // With no single-class capacity to label, the readout empties; the app
    // hides the scale row for the overflowed bar.
    expect(out("capacity")).toBe("");
  });

  test("hides the fit meter entirely when no model is loaded", () => {
    loadDom();
    mountCalculator(document);
    requireButton().click();
    const meter = dataSlot("fit-meter");
    if (!(meter instanceof HTMLMeterElement)) {
      throw new TypeError("Missing fit meter");
    }

    expect(meter.hidden).toBe(true);
    expect(meter.dataset.over).toBe("false");
  });
});

describe("header status strip", () => {
  test("renders a compact summary for the default estimate", () => {
    loadDom();
    mountCalculator(document);

    expect(dataSlot("status-model").textContent).toBe("7B");
    expect(dataSlot("status-mode").textContent).toBe("INFERENCE");
    expect(dataSlot("status-precision").textContent).toBe("16-BIT");
    expect(dataSlot("status-fit").textContent).toBe("24 GB");
  });

  test("updates model, mode, precision, and fit after input changes", () => {
    loadDom();
    mountCalculator(document);

    fireInput("total-params", "104");
    fireChange("execution-mode", "QLoRA fine-tuning");
    const moe = field("moe-enabled");
    if (moe instanceof HTMLInputElement) {
      moe.checked = true;
    }
    moe.dispatchEvent(new Event("change", { bubbles: true }));

    expect(dataSlot("status-model").textContent).toBe("104B MoE");
    expect(dataSlot("status-mode").textContent).toBe("QLORA");
    expect(dataSlot("status-precision").textContent).toBe("4-BIT");
    expect(dataSlot("status-fit").textContent).toBe("192 GB");
  });
});

/**
 Re-mock the render clock so the hero example lands on the given tier index
 (modulo the tier's card count).
@param index - the desired pick index
*/
function mockRandomPick(index: number): void {
  vi.spyOn(performance, "now").mockReturnValue(index / 1000);
}

describe("recommended GPU examples", () => {
  test("names concrete example cards on the hero GPU card beneath the class", () => {
    loadDom();
    mountCalculator(document);
    const row = dataSlot("gpu-examples-row");

    expect(out("gpu-class")).toBe("24 GB hardware tier");
    // One randomly picked card anchors the tier (the mock pins the pick to
    // the tier's first card), never the whole catalog.
    expect(out("gpu-examples")).toBe("RTX 4090");
    expect(row.hidden).toBe(false);
    // The example reads at first glance on the hero card, prefixed "e.g." and
    // not tucked inside a collapsed reasoning panel.
    expect(row.textContent.replaceAll(/\s+/gu, " ").trim()).toBe(
      "e.g. RTX 4090",
    );
    expect(dataSlot("hero-gpu-card").contains(row)).toBe(true);
    expect(() => containingDetails(row)).toThrow();
  });

  test("links the picked example card to its product page safely", () => {
    loadDom();
    mountCalculator(document);
    // The picked card renders as an element child; name-only cards would be
    // text nodes, so the element children are exactly the linked cards.
    const links = exampleCardLinks();

    // The pinned pick (the 24 GB tier's first card) carries a product page,
    // so it links out, opening in a new tab without leaking the opener.
    expect(links.map((link) => link.textContent)).toEqual(["RTX 4090"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/",
    ]);
    for (const link of links) {
      expect(link.target).toBe("_blank");
      expect(link.rel).toBe("noopener noreferrer");
    }
  });

  test("renders a card with no product page as muted text, not a link", () => {
    loadDom();
    mountCalculator(document);
    // Pick the 8 GB tier's second card, the generic name-only descriptor.
    mockRandomPick(1);
    fireInput("total-params", "1");

    // A descriptor with no product page renders as plain text (no element
    // children), never as a link.
    expect(out("gpu-examples")).toBe("older 8 GB GPUs");
    expect(exampleCardLinks()).toEqual([]);
  });

  test("re-picks the example card only when the recommendation tier changes", () => {
    loadDom();
    mountCalculator(document);
    expect(out("gpu-examples")).toBe("RTX 4090");

    // Typing inside the same tier must not reshuffle the visible example even
    // if the random pick would land elsewhere.
    mockRandomPick(1);
    fireInput("context-tokens", "9000");
    expect(out("gpu-examples")).toBe("RTX 4090");

    fireInput("total-params", "1");

    expect(out("gpu-class")).toBe("8 GB hardware tier");
    expect(out("gpu-examples")).toBe("older 8 GB GPUs");
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
    // "hardware tier".
    expect(out("gpu-class")).toBe(
      "No single-accelerator fit. Enable memory sharding to split the model across a 320 GB sharded datacenter class (4x 80 GB GPUs with tensor/model parallelism), the smallest standard pool that covers this estimate. Slower alternative: offload part of the model to CPU memory.",
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
    // than "160 GB hardware tier", which would read as a single 160 GB card
    // that does not exist. The multi-GPU makeup stays in the examples row.
    expect(out("gpu-class")).toBe("160 GB sharded datacenter class");
    expect(out("gpu-class")).not.toContain("hardware tier");
    expect(out("gpu-examples")).toBe(
      "2x 80 GB GPUs with tensor/model parallelism",
    );
  });
});

describe("QLoRA precision switching", () => {
  test("switching precision away from QLoRA exits to Inference but keeps inputs", () => {
    loadDom();
    mountCalculator(document);

    fireInput("total-params", "8");
    fireChange("execution-mode", "QLoRA fine-tuning");
    fireInput("precision", "16-bit");

    expect(field("execution-mode").value).toBe("Inference");
    expect(field("precision").value).toBe("16-bit");
    expect(field("runtime-profile").value).toBe("Server / Cloud");
    // The user's parameter count must survive the mode switch; leaving QLoRA
    // changes only the mode and precision, never the deployment they entered.
    expect(field("total-params").value).toBe("8");
    expect(out("total")).not.toBe("0.0 GB");
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
    expect(field("total-params").value).toBe("8");
    expect(out("total")).not.toBe("0.0 GB");
  });

  test("leaving QLoRA for a training mode lifts the 4-bit precision pin", () => {
    loadDom();
    mountCalculator(document);

    fireInput("total-params", "8");
    fireChange("execution-mode", "QLoRA fine-tuning");
    expect(field("precision").value).toBe("4-bit");

    // Full training cannot run on 4-bit NF4 weights, so the pin must lift rather
    // than leak a physically impossible quantization into the estimate.
    fireChange("execution-mode", "Full training");
    expect(field("precision").value).toBe("16-bit");
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

  test("hides training-only inputs during Inference and restores them for training", () => {
    loadDom();
    mountCalculator(document);
    // Inference never reads gradient checkpointing or the optimizer, so both
    // rows stay hidden with their controls disabled instead of implying an
    // effect on the estimate.
    expect(isRowHidden("gradient-checkpointing")).toBe(true);
    expect(field("gradient-checkpointing").disabled).toBe(true);
    expect(isRowHidden("optimizer")).toBe(true);
    expect(field("optimizer").disabled).toBe(true);

    for (const mode of [
      "LoRA fine-tuning",
      "QLoRA fine-tuning",
      "Full training",
    ]) {
      fireChange("execution-mode", mode);
      expect(isRowHidden("gradient-checkpointing")).toBe(false);
      expect(field("gradient-checkpointing").disabled).toBe(false);
      expect(isRowHidden("optimizer")).toBe(false);
      expect(field("optimizer").disabled).toBe(false);
    }

    // The recommended default survives the round trip: the box reappears
    // checked, matching common training recipes.
    const gradient = field("gradient-checkpointing");
    if (!(gradient instanceof HTMLInputElement)) {
      throw new TypeError("Gradient checkpointing must be a checkbox");
    }
    expect(gradient.checked).toBe(true);

    fireChange("execution-mode", "Inference");
    expect(isRowHidden("gradient-checkpointing")).toBe(true);
    expect(isRowHidden("optimizer")).toBe(true);
  });

  test("unchecking gradient checkpointing changes training estimates", () => {
    loadDom();
    mountCalculator(document);
    fireChange("execution-mode", "Full training");
    expect(out("total")).toBe("152.9 GB");

    const gradient = field("gradient-checkpointing");
    if (!(gradient instanceof HTMLInputElement)) {
      throw new TypeError("Gradient checkpointing must be a checkbox");
    }
    gradient.checked = false;
    gradient.dispatchEvent(new Event("change", { bubbles: true }));

    expect(out("total")).toBe("166.0 GB");
    expect(out("min-cap")).toBe("207.5 GB");
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

    expect(out("total")).toBe("19.9 GB");
    expect(out("assumptions")).toContain("32-bit");
  });

  test("renders the methodology assumption notes in the real HTML output", () => {
    loadDom();
    mountCalculator(document);

    const assumptions = out("assumptions");

    expect(assumptions).toContain(
      "Runtime / CUDA overhead estimated at a fixed 1.5 GB for this mode and runtime profile.",
    );
    expect(assumptions).toContain("KV cache precision: 16-bit.");
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

/**
 Return the preset chip buttons rendered into the presets group.
@returns preset chip buttons in DOM order
*/
function presetChips(): HTMLButtonElement[] {
  // The presets group holds only chip buttons; read them as direct children so
  // the query stays on an allowed data-* slot rather than a tag selector.
  return [...dataSlot("presets").children].filter(
    (node): node is HTMLButtonElement => node instanceof HTMLButtonElement,
  );
}

/**
 Read each preset chip's aria-pressed value, in DOM order.
@returns one "true"/"false" string per chip
*/
function pressedStates(): string[] {
  return presetChips().map((chip) => chip.getAttribute("aria-pressed") ?? "");
}

/**
 Click a preset chip by its visible label.
@param label - the chip's text label
*/
function clickPreset(label: string): void {
  const chip = presetChips().find(
    (button) => button.textContent.trim() === label,
  );
  if (chip === undefined) {
    throw new TypeError(`Missing preset chip: ${label}`);
  }
  chip.click();
}

/**
 Return the hardware-tier fit cells without CSS selector queries.
@returns tier fit cells in DOM order
*/
function tierFitCells(): HTMLElement[] {
  return allElements(document.body).filter(
    (node): node is HTMLElement =>
      node instanceof HTMLElement && node.dataset.tierFit !== undefined,
  );
}

/**
 Return hardware-tier accordion rows without CSS selector queries.
@returns hardware-tier detail rows in DOM order
*/
function tierRows(): HTMLDetailsElement[] {
  return allElements(document.body).filter((node): node is HTMLDetailsElement =>
    node.classList.contains("tier"),
  );
}

describe("hardware tier reference", () => {
  test("marks only the smallest tier ceiling that covers the estimate", () => {
    loadDom();
    mountCalculator(document);
    const cells = tierFitCells();

    expect(cells.map((cell) => cell.dataset.tierFit)).toEqual([
      "24",
      "48",
      "96",
      "192",
      "100000",
    ]);
    // The default 7B needs 22.4 GB raw. Larger ceilings would also hold it,
    // but only the recommended 24 GB tier carries the check (and is exposed
    // to assistive tech) so the column answers which tier to use.
    expect(cells.map((cell) => cell.dataset.fit)).toEqual([
      "true",
      "false",
      "false",
      "false",
      "false",
    ]);
    expect(cells.map((cell) => cell.getAttribute("aria-hidden"))).toEqual([
      "false",
      "true",
      "true",
      "true",
      "true",
    ]);
  });

  test("clears the single-accelerator checks once the estimate outgrows them", () => {
    loadDom();
    mountCalculator(document);
    // 104B needs ~288.7 GB raw: beyond every single-accelerator ceiling,
    // still within the beyond-single row.
    fireInput("total-params", "104");

    const fits = tierFitCells().map((cell) => cell.dataset.fit);
    expect(fits).toEqual(["false", "false", "false", "false", "true"]);
  });

  test("clears every check when no model is loaded", () => {
    loadDom();
    mountCalculator(document);
    requireButton().click();

    const cells = tierFitCells();
    expect(cells.every((cell) => cell.dataset.fit === "false")).toBe(true);
    expect(
      cells.every((cell) => cell.getAttribute("aria-hidden") === "true"),
    ).toBe(true);
  });

  test("renders five collapsed rows sharing the exclusive accordion name", () => {
    loadDom();
    mountCalculator(document);

    const rows = tierRows();
    expect(rows).toHaveLength(5);
    expect(
      rows.every((row) => row.getAttribute("name") === "hardware-tier"),
    ).toBe(true);
    expect(rows.every((row) => !row.open)).toBe(true);
  });
});

describe("model presets", () => {
  test("renders a non-submitting chip for every catalog entry", () => {
    loadDom();
    mountCalculator(document);
    const chips = presetChips();

    expect(chips.map((chip) => chip.textContent.trim())).toEqual(
      MODEL_PRESETS.map((preset) => preset.label),
    );
    expect(chips.map((chip) => chip.dataset.preset)).toEqual(
      MODEL_PRESETS.map((preset) => preset.id),
    );
    for (const chip of chips) {
      // type="button" keeps a chip from submitting the reactive form.
      expect(chip.type).toBe("button");
    }
  });

  test("loads a dense model deployment into the form and estimate on click", () => {
    loadDom();
    mountCalculator(document);

    clickPreset("Llama 70B");

    expect(field("total-params").value).toBe("70");
    expect(field("workload-family").value).toBe("text_generation");
    expect(field("precision").value).toBe("16-bit");
    expect(field("moe-enabled")).toHaveProperty("checked", false);
    expect(out("total")).toBe("160.8 GB");
    expect(dataSlot("status-model").textContent).toBe("70B");
    expect(out("gpu-class")).toBe("192 GB hardware tier");
  });

  test("loads a mixture-of-experts preset with its active parameters", () => {
    loadDom();
    mountCalculator(document);

    clickPreset("Mixtral");

    const moe = field("moe-enabled");
    expect(moe).toHaveProperty("checked", true);
    expect(field("total-params").value).toBe("46.7");
    expect(field("active-params").value).toBe("12.9");
    expect(isRowHidden("active-params")).toBe(false);
    expect(dataSlot("status-model").textContent).toBe("46.7B MoE");
    expect(out("total")).toBe("108.8 GB");
  });

  test("computes the preset report from freshly revealed controls", () => {
    loadDom();
    mountCalculator(document);

    clickPreset("Mixtral");

    // The first render must already read the just-enabled Active Parameters
    // value: a stale read of the still-disabled control fell back to the
    // 1.3B default and showed a ~10x too-fast speed for one render.
    const speedAfterClick = out("speed");
    expect(speedAfterClick).toBe("186.0 tokens/sec");
    fireInput("total-params", field("total-params").value);
    expect(out("speed")).toBe(speedAfterClick);
  });

  test("applies a preset without submitting or navigating the form", () => {
    loadDom();
    mountCalculator(document);
    let submitCount = 0;
    inputsForm().addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });

    clickPreset("Gemma");

    expect(submitCount).toBe(0);
    expect(field("total-params").value).toBe("9");
    expect(out("total")).toBe("23.2 GB");
  });

  test("loads an image-diffusion preset that leaves the text-generation family", () => {
    loadDom();
    mountCalculator(document);

    clickPreset("SDXL");

    expect(field("workload-family").value).toBe("image_diffusion");
    expect(field("total-params").value).toBe("3.5");
    expect(field("precision").value).toBe("16-bit");
    // image_diffusion has no decoder KV cache, so the MoE control is not applicable.
    expect(field("moe-enabled")).toHaveProperty("checked", false);
    expect(out("total")).toBe("12.0 GB");
  });

  test("reset clears a loaded preset back to the empty estimate", () => {
    loadDom();
    mountCalculator(document);
    clickPreset("Llama 8B");
    expect(out("total")).toBe("21.0 GB");

    requireButton().click();

    expect(field("total-params").value).toBe("0");
    expect(out("total")).toBe("0.0 GB");
  });

  test("links the header MODEL word to each loaded preset's model page", () => {
    loadDom();
    mountCalculator(document);
    // The seed deployment matches no preset: local link, nothing highlighted.
    expect(dataSlot("status-model-link").getAttribute("href")).toBe("/");

    for (const preset of MODEL_PRESETS) {
      clickPreset(preset.label);
      expect(dataSlot("status-model-link").getAttribute("href")).toBe(
        preset.url,
      );
    }
  });

  test("keeps the chip of the still-matching preset green", () => {
    loadDom();
    mountCalculator(document);
    expect(pressedStates()).toEqual([
      "false",
      "false",
      "false",
      "false",
      "false",
    ]);

    clickPreset("Mixtral");

    expect(pressedStates()).toEqual([
      "false",
      "false",
      "true",
      "false",
      "false",
    ]);
  });

  test("drops the model link and highlight once an input diverges", () => {
    loadDom();
    mountCalculator(document);
    clickPreset("Llama 70B");
    expect(pressedStates()[1]).toBe("true");

    fireInput("total-params", "71");

    expect(dataSlot("status-model-link").getAttribute("href")).toBe("/");
    expect(pressedStates()[1]).toBe("false");
  });

  test("skips a stray non-HTML node added to the presets group after mount", () => {
    loadDom();
    mountCalculator(document);
    const stray = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    dataSlot("presets").append(stray);

    clickPreset("Gemma");

    expect(stray.getAttribute("aria-pressed")).toBeNull();
    expect(presetChips()[3]?.getAttribute("aria-pressed")).toBe("true");
  });

  test("reset drops the model link and highlight", () => {
    loadDom();
    mountCalculator(document);
    clickPreset("Gemma");
    expect(dataSlot("status-model-link").getAttribute("href")).toBe(
      "https://huggingface.co/google/gemma-2-9b",
    );

    requireButton().click();

    expect(dataSlot("status-model-link").getAttribute("href")).toBe("/");
    for (const chip of presetChips()) {
      expect(chip.getAttribute("aria-pressed")).toBe("false");
    }
  });
});

describe("headline stat chips", () => {
  test("renders four stat chips under the hero on mount", () => {
    loadDom();
    mountCalculator(document);

    // The seed 7B decoder deployment headlines weights, KV cache, the batch
    // count, and the fit meter's spare budget.
    expect(statChipCards().map((chip) => chip.label)).toEqual([
      "Model Weights",
      "KV Cache",
      "Concurrency",
      "Spare",
    ]);
    expect(outSlot("stat-chips").getAttribute("aria-busy")).toBeNull();
  });

  test("recomputes the chips when the workload family changes", () => {
    loadDom();
    mountCalculator(document);

    fireChange("workload-family", "image_diffusion");

    // Image diffusion has no decoder KV cache, so the working-memory chip
    // switches to activations without disturbing the surrounding chips.
    expect(statChipCards().map((chip) => chip.label)).toEqual([
      "Model Weights",
      "Activations",
      "Concurrency",
      "Spare",
    ]);
  });
});

describe("main entrypoint", () => {
  test("mounts against the document on import", async () => {
    loadDom();
    await import("./main");
    expect(out("total")).toBe("18.8 GB");
  });
});
