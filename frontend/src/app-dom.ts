import type { GpuCard, ParallelismStrategy } from "./types";

/**
 Convert a kebab-case wire name (HTML `name` attribute) to the camelCase
 FormState key used internally.
@param name - kebab-case wire name
@returns the camelCase state key
*/
export function toStateKey(name: string): string {
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
Build the hero example-card nodes, " / "-separated, for one recommended tier.
@param cards - the tier's example GPU cards
@returns interleaved card nodes and separators, ready to append
*/
function gpuExampleNodes(cards: readonly GpuCard[]): Node[] {
  return cards.flatMap((card, index) =>
    index === 0
      ? [gpuCardNode(card)]
      : [document.createTextNode(" / "), gpuCardNode(card)],
  );
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
Look up an element by its data-out value, matching the generic `[data-out]`
selector the repo allows rather than a per-value selector.
@param root - DOM root to search
@param name - data-out value
*/
function dataOut(root: ParentNode, name: string): HTMLElement | null {
  for (const node of root.querySelectorAll<HTMLElement>("[data-out]")) {
    if (node.dataset.out === name) {
      return node;
    }
  }
  return null;
}

// Render one recommended tier's concrete example cards onto the hero GPU card,
// then drop the whole "e.g. ..." row when the tier has none (no model, or an
// overflow recommendation with no single-card fit).
/**
@param root - DOM root to search
@param cards - the recommended tier's example GPU cards
*/
export function renderGpuExamples(
  root: ParentNode,
  cards: readonly GpuCard[],
): void {
  dataOut(root, "gpu-examples")?.replaceChildren(...gpuExampleNodes(cards));
  dataSlot(root, "gpu-examples-row")?.toggleAttribute(
    "hidden",
    cards.length === 0,
  );
}

// Fill the parallelism callout's links and reveal it only when strategies apply
// (no single card fits), so a single-GPU fit hides the callout entirely rather
// than leaving a bare header. Mirrors the hero GPU-examples wiring.
/**
@param root - DOM root to search
@param strategies - the multi-GPU parallelism strategies
*/
export function renderParallelismCallout(
  root: ParentNode,
  strategies: readonly ParallelismStrategy[],
): void {
  dataOut(root, "parallelism-links")?.replaceChildren(
    ...parallelismLinkNodes(strategies),
  );
  dataSlot(root, "parallelism")?.toggleAttribute(
    "hidden",
    strategies.length === 0,
  );
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
