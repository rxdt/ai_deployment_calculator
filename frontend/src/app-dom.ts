import type { GpuCard } from "./types";

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
export function gpuExampleNodes(cards: readonly GpuCard[]): Node[] {
  return cards.flatMap((card, index) =>
    index === 0
      ? [gpuCardNode(card)]
      : [document.createTextNode(" / "), gpuCardNode(card)],
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
