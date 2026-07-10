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
