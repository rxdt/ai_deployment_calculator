// AST-based structural style checks for staged TypeScript files — the JS port of harness/preferences.py, pointed at the frontend. OPTIONAL for humans to edit or delete.
//
// Agents in the loop cannot edit this file: `frontend/harness` is a FORBIDDEN_DIR in gate.ts.
//
// This module reflects the repo owner's personal style hates that ESLint/tsc cannot express:
// indiscriminate _underscore names and spread "splat" in calls/literals.
//
// NOTE: the Python "plain class must be Pydantic" rule has no faithful TS equivalent (there is
// no Pydantic in the browser app), so it is intentionally NOT ported. See blocker B in the report.

import ts from "typescript";

/**
Whether a name is a single-underscore name (a __dunder__ is exempt, e.g. __proto__).
@param name - The declared identifier text.
@returns True when the name starts with one underscore and is not a dunder.
*/
function isBadUnderscore(name: string): boolean {
  return name.startsWith("_") && !name.endsWith("__");
}

/**
The identifier a function, method, parameter, or variable declaration introduces.
@param node - The AST node to inspect.
@returns The declared name, or undefined when the node declares no plain identifier.
*/
function declaredName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
    return node.name?.text;
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (
    (ts.isParameter(node) || ts.isVariableDeclaration(node)) &&
    ts.isIdentifier(node.name)
  ) {
    return node.name.text;
  }
  return undefined;
}

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
The underscore-name problem a single node introduces, if any.
@param path - The file path, for the message.
@param source - The parsed source file.
@param node - The node to inspect.
@returns A problem message, or undefined when the node is clean.
*/
function underscoreProblem(
  path: string,
  source: ts.SourceFile,
  node: ts.Node,
): string | undefined {
  const name = declaredName(node);
  if (name !== undefined && isBadUnderscore(name)) {
    return `${path}:${String(lineOf(source, node))}: name '${name}' starts with underscore`;
  }
  return undefined;
}

/**
The spread "splat" problem a single node introduces, if any. Rest parameters and rest in
destructuring are signature/binding idioms and stay allowed.
@param path - The file path, for the message.
@param source - The parsed source file.
@param node - The node to inspect.
@returns A problem message, or undefined when the node is clean.
*/
function spreadProblem(
  path: string,
  source: ts.SourceFile,
  node: ts.Node,
): string | undefined {
  if (ts.isSpreadElement(node)) {
    return `${path}:${String(lineOf(source, node))}: spread; pass explicit values`;
  }
  if (ts.isSpreadAssignment(node)) {
    return `${path}:${String(lineOf(source, node))}: object spread; pass explicit properties`;
  }
  return undefined;
}

/**
No function, method, argument, or variable name starts with an underscore.
@param path - The file path, for the message.
@param source - The parsed source file.
@returns One problem per offending name.
*/
export function underscoreViolations(
  path: string,
  source: ts.SourceFile,
): string[] {
  const problems: string[] = [];
  walk(source, (node) => {
    const problem = underscoreProblem(path, source, node);
    if (problem !== undefined) {
      problems.push(problem);
    }
  });
  return problems;
}

/**
Spread "splat" in calls, array literals, or object literals; pass explicit values instead.
@param path - The file path, for the message.
@param source - The parsed source file.
@returns One problem per offending spread.
*/
export function spreadViolations(
  path: string,
  source: ts.SourceFile,
): string[] {
  const problems: string[] = [];
  walk(source, (node) => {
    const problem = spreadProblem(path, source, node);
    if (problem !== undefined) {
      problems.push(problem);
    }
  });
  return problems;
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
    for (const problem of [
      underscoreProblem(path, source, node),
      spreadProblem(path, source, node),
    ]) {
      if (problem !== undefined) {
        problems.push(problem);
      }
    }
  });
  return problems;
}
