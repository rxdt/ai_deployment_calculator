// Ports harness/tests/test_preferences.py to the TypeScript preference checks.

import { describe, expect, test } from "vitest";

import { preferencesViolations } from "./preferences.js";

describe("preferencesViolations", () => {
  test("allows explicit allowlisted data selectors", () => {
    const source = [
      'document.querySelector("[data-out]");',
      "root.querySelectorAll('[data-action=\"reset\"]');",
      'node.closest("[data-slot]");',
      'item.matches("[data-workload-label]");',
    ].join("\n");

    expect(preferencesViolations("m.ts", source)).toEqual([]);
  });

  test("flags class, complex, and non-data selectors", () => {
    const source = [
      'root.querySelector("form.inputs");',
      "root.querySelectorAll('[data-out=\"breakdown\"] li');",
      'document.querySelector("#row-template");',
    ].join("\n");

    expect(preferencesViolations("m.ts", source)).toEqual([
      "m.ts:1: class selector in TypeScript DOM query; use an allowed data-* selector",
      "m.ts:2: complex DOM selector; use one allowed data-* selector",
      "m.ts:3: complex DOM selector; use one allowed data-* selector",
    ]);
  });

  test("flags unlisted and dynamic data selectors", () => {
    const source = [
      'document.querySelector("[data-unknown]");',
      "document.querySelector(selector);",
    ].join("\n");

    expect(preferencesViolations("m.ts", source)).toEqual([
      "m.ts:1: unlisted data-* selector '[data-unknown]'",
      "m.ts:2: dynamic DOM selector; use an allowed data-* selector",
    ]);
  });

  test("reports DOM selector preference failures", () => {
    const problems = preferencesViolations(
      "m.ts",
      'document.querySelector(".results");\n',
    );
    expect(problems).toContain(
      "m.ts:1: class selector in TypeScript DOM query; use an allowed data-* selector",
    );
  });

  test("a compliant module produces no violations", () => {
    const source =
      'export function output(root: ParentNode): Element | null {\n  return root.querySelector("[data-out]");\n}\n';
    expect(preferencesViolations("m.ts", source)).toEqual([]);
  });
});
