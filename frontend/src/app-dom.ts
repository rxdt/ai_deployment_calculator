import { recommendedGpuClass } from "./result-format";
import { searchFromState } from "./state";
import type { FitMeter } from "./result-format";
import type { ModelPreset } from "./presets";
import type {
  FormState,
  GpuCard,
  HardwareRecommendation,
  ParallelismStrategy,
} from "./types";

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
Mirror the deployment into the address bar so the estimate stays shareable.
@param state - normalized calculator state
*/
export function writeUrlFromState(state: Readonly<FormState>): void {
  const search = searchFromState(state).toString();
  history.replaceState(null, "", `${location.pathname}?${search}`);
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
    return [element.name, element.checked ? "on" : "off"];
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
Seed every form control from a deployment's state values: checkboxes from the
booleans, every other input and select from the strings.
@param form - the calculator inputs form
@param values - state values keyed by camelCase FormState key
*/
export function fillFormValues(
  form: HTMLFormElement,
  values: ReadonlyMap<string, string | boolean>,
): void {
  for (const element of form.elements) {
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      element.checked = values.get(toStateKey(element.name)) === true;
    } else if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement
    ) {
      element.value = String(values.get(toStateKey(element.name)));
    }
  }
}

/**
@param form
*/
export function searchFromForm(form: HTMLFormElement): URLSearchParams {
  const search = new URLSearchParams();
  for (const element of form.elements) {
    const entry = controlEntry(element);
    if (entry !== null) {
      search.set(entry[0], entry[1]);
    }
  }
  return search;
}

// Build the hero node for one example GPU: a new-tab link when the card has a
// product page, otherwise plain muted text. Links carry rel="noopener
// noreferrer" so the opened page cannot reach back through window.opener.
/**
@param card - the example GPU card
@returns an anchor for a linked card, or a text node for a name-only card
*/
function gpuCardNode(card: Readonly<GpuCard>): Node {
  if (card.url === undefined) {
    return document.createTextNode(card.name);
  }
  const link = document.createElement("a");
  link.href = card.url;
  link.textContent = card.name;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

/**
Pick an arbitrary index below the given length. The clock's sub-millisecond
digits stand in for the lint-banned Math.random: the pick is cosmetic, and the
microseconds elapsed before a render vary freely across loads and edits.
@param length - the number of choices
@returns an integer in [0, length), or NaN when there are no choices
*/
function randomIndex(length: number): number {
  return Math.floor(performance.now() * 1000) % length;
}

/**
Pick the single example card the hero shows for a tier: one concrete product
anchors the class without listing the whole catalog. The pick is random so
repeat visitors see the tier's breadth over time.
@param cards - the tier's example GPU cards
@returns the picked card's node, ready to append; empty for no cards
*/
function gpuExampleNodes(cards: readonly GpuCard[]): Node[] {
  const pick = cards[randomIndex(cards.length)];
  return pick === undefined ? [] : [gpuCardNode(pick)];
}

// Build one parallelism-strategy link: a new-tab anchor to the framework's
// docs. rel="noopener noreferrer" keeps the opened page from reaching back
// through window.opener, matching the hero GPU links.
/**
@param strategy - the parallelism strategy
@returns an anchor to the strategy's docs
*/
function parallelismLinkNode(strategy: Readonly<ParallelismStrategy>): Node {
  const link = document.createElement("a");
  link.href = strategy.url;
  link.textContent = strategy.label;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

/**
Build the sharding-callout strategy links, " · "-separated.
@param strategies - the multi-GPU parallelism strategies
@returns interleaved link nodes and separators, ready to append
*/
function parallelismLinkNodes(
  strategies: readonly ParallelismStrategy[],
): Node[] {
  return strategies.flatMap((strategy, index) =>
    index === 0
      ? [parallelismLinkNode(strategy)]
      : [document.createTextNode(" · "), parallelismLinkNode(strategy)],
  );
}

/**
Look up an element by its data-slot value.
@param root - DOM root to search
@param name - data-slot value
*/
export function dataSlot(root: ParentNode, name: string): HTMLElement | null {
  for (const node of root.querySelectorAll<HTMLElement>("[data-slot]")) {
    if (node.dataset.slot === name) {
      return node;
    }
  }
  return null;
}

/**
Render the hero fit meter bar and its USAGE/CAPACITY scale row. A tight fit
turns the bar amber; the caption's "Tight fit" prefix carries the same signal
for anyone not perceiving the color. Overflow pegs the bar full and red. The
scale row is hidden directly (not via a CSS sibling selector, which WebKit
does not re-evaluate when data-over flips): nothing to label on a hidden bar,
and no capacity to label on an overflowed one.
@param root - DOM root to search
@param meter - the fit reading, or null when there is nothing to measure
*/
export function renderFitMeterBar(
  root: ParentNode,
  meter: Readonly<FitMeter> | null,
): void {
  const bar = dataSlot(root, "fit-meter");
  if (!(bar instanceof HTMLMeterElement)) {
    throw new TypeError("Missing fit meter");
  }
  const scale = dataSlot(root, "fit-scale");
  if (scale === null) {
    throw new Error("Missing data slot: fit-scale");
  }
  bar.hidden = meter === null;
  bar.value = meter?.fillPercent ?? 0;
  bar.classList.toggle("fit-meter--tight", meter?.isTight === true);
  bar.dataset.over = String(meter?.isOverflow === true);
  scale.hidden = meter === null || meter.isOverflow;
}

/**
Reflect the still-matching preset in the chrome: the header MODEL word links
to the preset's model page when possible, and the matching chip keeps its green
highlight via aria-pressed, which also carries the state to assistive tech.
@param root - DOM root holding the header model link
@param chips - the presets group whose children are the chip buttons
@param preset - the still-matching preset, if any
*/
export function renderPresetSelection(
  root: ParentNode,
  chips: HTMLElement,
  preset: ModelPreset | undefined,
): void {
  const link = dataSlot(root, "status-model-link");
  if (!(link instanceof HTMLAnchorElement)) {
    throw new TypeError("Missing model link");
  }
  if (preset === undefined) {
    link.href = "/";
    link.removeAttribute("target");
    link.removeAttribute("rel");
  } else {
    link.href = preset.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  for (const chip of chips.children) {
    if (chip instanceof HTMLElement) {
      chip.setAttribute(
        "aria-pressed",
        String(chip.dataset.preset === preset?.id),
      );
    }
  }
}

// Render one example card for the recommended tier onto the hero GPU card,
// then drop the whole "e.g. ..." row when the tier has none (no model, or an
// overflow recommendation with no single-card fit). The row wraps exactly one
// output slot, so its `[data-out]` child is the example-card target. The tier
// signature stored on the row limits re-picking to actual tier changes, so
// typing (which re-renders on every keystroke) never reshuffles the example.
/**
@param root - DOM root to search
@param cards - the recommended tier's example GPU cards
*/
export function renderGpuExamples(
  root: ParentNode,
  cards: readonly GpuCard[],
): void {
  const row = dataSlot(root, "gpu-examples-row");
  const tier = cards.map((card) => card.name).join(" / ");
  if (row === null || row.dataset.exampleTier === tier) {
    return;
  }
  row.dataset.exampleTier = tier;
  row.querySelector("[data-out]")?.replaceChildren(...gpuExampleNodes(cards));
  row.toggleAttribute("hidden", cards.length === 0);
}

/**
Mark each hardware-tier row's fit cell: a tier fits when the estimate's
minimum raw memory does not exceed the row's capacity ceiling. With no
estimate (no model loaded), every check clears.
@param root - DOM root to search
@param minimumRawVram - the formatted minimum raw memory, e.g. "22.4 GB"
*/
export function renderTierFits(root: ParentNode, minimumRawVram: string): void {
  const required = Number(minimumRawVram.replace(" GB", ""));
  const cells = [...root.querySelectorAll<HTMLElement>("[data-tier-fit]")];
  const ceilings = cells.map((cell) => Number(cell.dataset.tierFit));
  // Check only the smallest ceiling that covers the requirement: the estimate
  // technically "fits" every larger tier too, but marking them all turns the
  // column into noise where it should answer which tier to use.
  const best = Math.min(...ceilings.filter((ceiling) => required <= ceiling));
  for (const [index, cell] of cells.entries()) {
    const isFit = required > 0 && ceilings[index] === best;
    cell.dataset.fit = String(isFit);
    cell.setAttribute("aria-hidden", String(!isFit));
  }
}

/**
Render the recommended class into the hero slot: tier labels keep the bold
mono readout, while sentence-length guidance (overflow, no model) drops to
the quiet body face via the prose modifier class.
@param slot - the hero gpu-class output element
@param fit - the computed hardware recommendation
*/
export function renderGpuClass(
  slot: HTMLElement,
  fit: Readonly<HardwareRecommendation>,
): void {
  slot.textContent = recommendedGpuClass(fit.recommendedTier);
  slot.classList.toggle("hero-value--prose", fit.usableVramOnClass === "n/a");
}

// Fill the parallelism callout's links and reveal it only when strategies apply
// (no single card fits), so a single-GPU fit hides the callout entirely rather
// than leaving a bare header. The callout wraps exactly one output slot, so its
// `[data-out]` child is the links target. Mirrors the hero GPU-examples wiring.
/**
@param root - DOM root to search
@param strategies - the multi-GPU parallelism strategies
*/
export function renderParallelismCallout(
  root: ParentNode,
  strategies: readonly ParallelismStrategy[],
): void {
  const callout = dataSlot(root, "parallelism");
  callout
    ?.querySelector("[data-out]")
    ?.replaceChildren(...parallelismLinkNodes(strategies));
  callout?.toggleAttribute("hidden", strategies.length === 0);
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
export function setHiddenWithControls(
  node: HTMLElement,
  isHidden: boolean,
): void {
  node.hidden = isHidden;
  setDescendantControlsDisabled(node, isHidden);
}
