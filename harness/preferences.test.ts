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

  test("flags direct layout measurement method calls", () => {
    const source = [
      "box.getBoundingClientRect();",
      "box?.getBoundingClientRect();",
      'box["getBoundingClientRect"]();',
    ].join("\n");

    expect(preferencesViolations("m.ts", source)).toEqual([
      "m.ts:1: direct layout measurement 'getBoundingClientRect'; use CSS or a human-approved layout utility",
      "m.ts:2: direct layout measurement 'getBoundingClientRect'; use CSS or a human-approved layout utility",
      "m.ts:3: direct layout measurement 'getBoundingClientRect'; use CSS or a human-approved layout utility",
    ]);
  });

  test("flags direct element layout reads", () => {
    const source = [
      "void box.offsetWidth;",
      "void box.offsetHeight;",
      "void box.offsetTop;",
      "void box.offsetLeft;",
      "void box.clientWidth;",
      "void box.clientHeight;",
      "void box.scrollWidth;",
      'void box["scrollHeight"];',
    ].join("\n");

    expect(preferencesViolations("m.ts", source)).toEqual([
      "m.ts:1: direct layout read 'offsetWidth'; use CSS or a human-approved layout utility",
      "m.ts:2: direct layout read 'offsetHeight'; use CSS or a human-approved layout utility",
      "m.ts:3: direct layout read 'offsetTop'; use CSS or a human-approved layout utility",
      "m.ts:4: direct layout read 'offsetLeft'; use CSS or a human-approved layout utility",
      "m.ts:5: direct layout read 'clientWidth'; use CSS or a human-approved layout utility",
      "m.ts:6: direct layout read 'clientHeight'; use CSS or a human-approved layout utility",
      "m.ts:7: direct layout read 'scrollWidth'; use CSS or a human-approved layout utility",
      "m.ts:8: direct layout read 'scrollHeight'; use CSS or a human-approved layout utility",
    ]);
  });

  test("flags direct viewport reads from window", () => {
    const source = [
      "void window.innerWidth;",
      'void window["innerHeight"];',
    ].join("\n");

    expect(preferencesViolations("m.ts", source)).toEqual([
      "m.ts:1: direct viewport read 'window.innerWidth'; use CSS or a human-approved layout utility",
      "m.ts:2: direct viewport read 'window.innerHeight'; use CSS or a human-approved layout utility",
    ]);
  });

  test("allows non-window viewport names and dynamic property access", () => {
    const source = [
      'const property = "offsetWidth";',
      "void box[property];",
      "void panel.innerWidth;",
    ].join("\n");

    expect(preferencesViolations("m.ts", source)).toEqual([]);
  });

  test("a compliant module produces no violations", () => {
    const source =
      'export function output(root: ParentNode): Element | null {\n  return root.querySelector("[data-out]");\n}\n';
    expect(preferencesViolations("m.ts", source)).toEqual([]);
  });
});
