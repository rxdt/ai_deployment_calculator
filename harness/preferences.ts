// Checks for staged files based on human prefernces not caught by existing tools.
//
// OPTIONAL for humans to edit or delete.
//
// It parses staged files and reports owner-preference violations before they enter commits.
//
// Agents in the loop cannot edit this file: `/harness` is a FORBIDDEN_DIR in gate.ts.
//
// This module reflects the repo owner's personal style hates that ESLint/etc. cannot express:

import ts from "typescript";

const TS_DOM_SELECTOR_METHOD_NAMES = new Set([
  "closest",
  "matches",
  "querySelector",
  "querySelectorAll",
]);
const TS_LAYOUT_MEASUREMENT_METHOD_NAMES = new Set(["getBoundingClientRect"]);
const TS_ELEMENT_LAYOUT_READ_PROPERTY_NAMES = new Set([
  "offsetWidth",
  "offsetHeight",
  "offsetTop",
  "offsetLeft",
  "clientWidth",
  "clientHeight",
  "scrollWidth",
  "scrollHeight",
]);
const TS_WINDOW_LAYOUT_READ_PROPERTY_NAMES = new Set([
  "innerWidth",
  "innerHeight",
]);
const ALLOWED_TS_DOM_DATA_SELECTORS = new Set([
  '[data-action="reset"]',
  "[data-active]",
  "[data-families]",
  "[data-moe-families]",
  "[data-out]",
  '[data-out="breakdown"]',
  '[data-out="total"]',
  '[data-out="warnings"]',
  "[data-slot]",
  "[data-workload-label]",
]);
const CSS_ATTRIBUTE_SELECTOR_QUOTE_CHARACTERS = new Set(['"', "'"]);
/**
Depth-first visit of every node in the tree.
@param node - The current node.
@param visit - Callback invoked once per node.
*/
function walk(node: ts.Node, visit: (current: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => {
    walk(child, visit);
  });
}

/**
The 1-based source line a node starts on.
@param source - The parsed source file.
@param node - The node to locate.
@returns The 1-based line number.
*/
function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

type TsMemberAccess = ts.PropertyAccessExpression | ts.ElementAccessExpression;

// Note: ts.isPropertyAccessExpression/isElementAccessExpression already return true for the
// optional-chain variants (a?.b, a?.["b"] parse as *AccessExpression / *AccessChain, and the
// Chain nodes are a subtype the Expression predicates also match), so no separate isXxxChain
// check is needed — adding one would be dead, unreachable code.
/**
Whether a node is a member access (dot or bracket) that exposes a base `.expression`.
@param node - The AST node to inspect.
@returns True when the node is a property/element access.
*/
function isTsMemberAccess(node: ts.Node): node is TsMemberAccess {
  return (
    ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
  );
}

/**
Static member name from dot access or quoted bracket access.
@param node - The AST node to inspect.
@returns The member name, or undefined when the access is dynamic or not a member access.
*/
function staticTsMemberName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  return undefined;
}

/**
Whether a member access starts from the global window object.
@param node - The AST node to inspect.
@returns True when the node is window.name or window["name"].
*/
function isTsMemberBaseWindowIdentifier(node: TsMemberAccess): boolean {
  return ts.isIdentifier(node.expression) && node.expression.text === "window";
}

/**
Whether a selector is an attribute name this repo allows in TS DOM queries.
@param name - The attribute name to validate.
@returns True when the name is a simple lowercase data-* attribute.
*/
function isSimpleDataAttributeName(name: string): boolean {
  if (!name.startsWith("data-") || name.length === "data-".length) {
    return false;
  }
  for (const character of name.slice("data-".length)) {
    const isLowercase = character >= "a" && character <= "z";
    const isDigit = character >= "0" && character <= "9";
    if (!isLowercase && !isDigit && character !== "-") {
      return false;
    }
  }
  return true;
}

/**
Normalize an allowed single data-* selector to double-quoted form.
@param selector - The selector text from source.
@returns The normalized selector, or undefined when the selector is not a single data-* selector.
*/
function normalizeSingleDataAttributeSelector(
  selector: string,
): string | undefined {
  if (!selector.startsWith("[") || !selector.endsWith("]")) {
    return undefined;
  }
  const content = selector.slice(1, -1);
  const equalsIndex = content.indexOf("=");
  if (equalsIndex === -1) {
    return isSimpleDataAttributeName(content) ? `[${content}]` : undefined;
  }
  const name = content.slice(0, equalsIndex);
  const rawValue = content.slice(equalsIndex + 1);
  if (!isSimpleDataAttributeName(name) || rawValue.length < 2) {
    return undefined;
  }
  const quote = rawValue.slice(0, 1);
  if (
    !CSS_ATTRIBUTE_SELECTOR_QUOTE_CHARACTERS.has(quote) ||
    rawValue.slice(-1) !== quote
  ) {
    return undefined;
  }
  return `[${name}="${rawValue.slice(1, -1)}"]`;
}

/**
DOM selector preference problem introduced by a call expression, if any.
@param path - The file path, for the message.
@param source - The parsed source file.
@param node - The AST node to inspect.
@returns A problem message, or undefined when the selector is allowed.
*/
function tsDomSelectorPreferenceProblem(
  path: string,
  source: ts.SourceFile,
  node: ts.Node,
): string | undefined {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return undefined;
  }
  const method = node.expression.name.text;
  if (!TS_DOM_SELECTOR_METHOD_NAMES.has(method)) {
    return undefined;
  }

  const firstArgument = node.arguments.at(0);
  if (firstArgument === undefined) {
    return undefined;
  }
  const location = `${path}:${String(lineOf(source, node))}`;
  if (!ts.isStringLiteralLike(firstArgument)) {
    return `${location}: dynamic DOM selector; use an allowed data-* selector`;
  }
  const selector = firstArgument.text;
  const normalized = normalizeSingleDataAttributeSelector(selector);
  if (normalized !== undefined) {
    return ALLOWED_TS_DOM_DATA_SELECTORS.has(normalized)
      ? undefined
      : `${location}: unlisted data-* selector '${normalized}'`;
  }
  if (selector.includes(".")) {
    return `${location}: class selector in TypeScript DOM query; use an allowed data-* selector`;
  }
  return `${location}: complex DOM selector; use one allowed data-* selector`;
}

/**
Layout measurement preference problem introduced by a node, if any.
@param path - The file path, for the message.
@param source - The parsed source file.
@param node - The AST node to inspect.
@returns A problem message, or undefined when no direct layout measurement is found.
*/
function tsLayoutMeasurementPreferenceProblem(
  path: string,
  source: ts.SourceFile,
  node: ts.Node,
): string | undefined {
  const location = `${path}:${String(lineOf(source, node))}`;

  if (ts.isCallExpression(node)) {
    const method = staticTsMemberName(node.expression);
    if (
      method !== undefined &&
      TS_LAYOUT_MEASUREMENT_METHOD_NAMES.has(method)
    ) {
      return `${location}: direct layout measurement '${method}'; use CSS or a human-approved layout utility`;
    }
  }

  if (!isTsMemberAccess(node)) {
    return undefined;
  }
  const property = staticTsMemberName(node);
  if (property === undefined) {
    return undefined;
  }
  if (TS_ELEMENT_LAYOUT_READ_PROPERTY_NAMES.has(property)) {
    return `${location}: direct layout read '${property}'; use CSS or a human-approved layout utility`;
  }
  if (
    TS_WINDOW_LAYOUT_READ_PROPERTY_NAMES.has(property) &&
    isTsMemberBaseWindowIdentifier(node)
  ) {
    return `${location}: direct viewport read 'window.${property}'; use CSS or a human-approved layout utility`;
  }
  return undefined;
}

/**
Run every structural check on one TypeScript file in a single AST traversal.
@param path - The file path, for the message.
@param code - The file's source text.
@returns Every preference violation found.
*/
export function preferencesViolations(path: string, code: string): string[] {
  const source = ts.createSourceFile(
    path,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const problems: string[] = [];
  walk(source, (node) => {
    const problem = tsDomSelectorPreferenceProblem(path, source, node);
    if (problem !== undefined) {
      problems.push(problem);
    }
    const layoutProblem = tsLayoutMeasurementPreferenceProblem(
      path,
      source,
      node,
    );
    if (layoutProblem !== undefined) {
      problems.push(layoutProblem);
    }
  });
  return problems;
}
