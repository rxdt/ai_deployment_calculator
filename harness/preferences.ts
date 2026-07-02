// Checks for staged files based on human prefernces not caught by existing tools.
//
// OPTIONAL for humans to edit or delete.
//
// It parses staged files and reports owner-preference violations before they enter commits.
//
// Agents in the loop cannot edit this file: `frontend/harness` is a FORBIDDEN_DIR in gate.ts.
//
// This module reflects the repo owner's personal style hates that ESLint/etc. cannot express:

import ts from "typescript";


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
