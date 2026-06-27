// Ports harness/tests/test_preferences.py to the TypeScript preference checks.

import { describe, expect, test } from "vitest";

import ts from "typescript";

import {
  preferencesViolations,
  spreadViolations,
  underscoreViolations,
} from "./preferences.ts";

const parse = (source: string): ts.SourceFile =>
  ts.createSourceFile(
    "m.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

describe("underscoreViolations", () => {
  test("flags function, parameter, and variable names", () => {
    const problems = underscoreViolations(
      "m.ts",
      parse("function _hidden(_arg) {\n  const _value = 1;\n}\n"),
    );
    expect(problems).toHaveLength(3);
    expect(problems.some((p) => p.includes("'_hidden'"))).toBe(true);
    expect(problems.some((p) => p.includes("'_arg'"))).toBe(true);
    expect(problems.some((p) => p.includes("'_value'"))).toBe(true);
  });

  test("flags a named function expression and a method", () => {
    const problems = underscoreViolations(
      "m.ts",
      parse(
        "const a = function _g() {};\nclass C {\n  _m() {}\n  ['k']() {}\n}\n",
      ),
    );
    expect(problems.some((p) => p.includes("'_g'"))).toBe(true);
    expect(problems.some((p) => p.includes("'_m'"))).toBe(true);
    expect(problems).toHaveLength(2); // computed method name and `a` are not flagged
  });

  test("flags the bare throwaway underscore", () => {
    expect(underscoreViolations("m.ts", parse("const _ = 1;\n"))).toEqual([
      "m.ts:1: name '_' starts with underscore",
    ]);
  });

  test("exempts __dunder__ names and clean names", () => {
    const source =
      "const __proto__ = {};\nfunction good(value) {\n  return value;\n}\n";
    expect(underscoreViolations("m.ts", parse(source))).toEqual([]);
  });

  test("ignores destructuring parameters (non-identifier names)", () => {
    expect(
      underscoreViolations(
        "m.ts",
        parse("function f({ a }) {\n  return a;\n}\n"),
      ),
    ).toEqual([]);
  });
});

describe("spreadViolations", () => {
  test("flags call, array, and object spread", () => {
    const problems = spreadViolations(
      "m.ts",
      parse("f(...items);\nconst a = [...xs];\nconst o = { ...src };\n"),
    );
    expect(problems).toEqual([
      "m.ts:1: spread; pass explicit values",
      "m.ts:2: spread; pass explicit values",
      "m.ts:3: object spread; pass explicit properties",
    ]);
  });

  test("allows rest parameters and rest in destructuring", () => {
    const source =
      "function f(...args) {\n  const [first, ...rest] = args;\n  return [first, rest];\n}\n";
    expect(spreadViolations("m.ts", parse(source))).toEqual([]);
  });
});

describe("preferencesViolations", () => {
  test("combines underscore and spread checks", () => {
    const problems = preferencesViolations("m.ts", "const _v = [...xs];\n");
    expect(problems).toContain("m.ts:1: name '_v' starts with underscore");
    expect(problems).toContain("m.ts:1: spread; pass explicit values");
  });

  test("a compliant module produces no violations", () => {
    const source =
      "export const VALUE = 1;\n\nexport function double(n: number): number {\n  return n * 2;\n}\n";
    expect(preferencesViolations("m.ts", source)).toEqual([]);
  });
});
