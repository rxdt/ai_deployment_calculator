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
  });
  return problems;
}
