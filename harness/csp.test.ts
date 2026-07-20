// Harness-owned CSP enforcement. GitHub Pages cannot set HTTP headers, so the
// Content-Security-Policy ships as a <meta> tag injected at build by the pinned
// cspMeta() plugin in vite.config.ts. That plugin lives in a FORBIDDEN file, but
// the built HTML it produces lives in agent-editable frontend/. This test is the
// tamper-resistant gate: it builds the site (to a throwaway temp dir, never
// frontend/) and asserts on the OUTPUT that (a) every page carries the exact
// pinned CSP, and (b) no page contains executable inline JS or any inline CSS.
// No off-the-shelf tool does this composite check for a static meta-CSP site, so
// it is hand-written per the documented norm. A loop agent cannot weaken it: the
// file is under harness/ (FORBIDDEN) and the policy is imported from vite.config.
// HTML is parsed with html-validate's typed parser (already a harness dep), so
// no jsdom/@types/jsdom dependency is needed.

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { type HtmlElement, Parser, StaticConfigLoader } from "html-validate";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { CSP_POLICY, cspMeta } from "./vite.config.js";

const HARNESS_CONFIG = path.resolve(import.meta.dirname, "vite.config.ts");

// <script> types whose body is data the browser parses, not JavaScript it
// executes; CSP script-src does not govern them, so they are allowed inline.
const DATA_SCRIPT_TYPES = new Set([
  "application/ld+json",
  "application/json",
  "importmap",
]);

// Build one parser for the suite. StaticConfigLoader.getConfigFor is synchronous
// but typed as possibly-async, so await it once.
/**

*/
async function makeParser(): Promise<Parser> {
  return new Parser(await new StaticConfigLoader().getConfigFor("page.html"));
}

// html-validate returns attribute values with HTML character references intact
// (unlike a browser DOM, which decodes them). The CSP policy only contains
// apostrophes, so decode the apostrophe references before comparing.
/**
@param value
*/
function decodeEntities(value: string): string {
  return value
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

// Read a string attribute value; html-validate returns an Attribute whose value
// may be a DynamicValue, which built (static) HTML never contains.
/**
@param element
@param name
*/
function attribute(element: HtmlElement, name: string): string | null {
  const value = element.getAttribute(name)?.value;
  return typeof value === "string" ? decodeEntities(value) : null;
}

// Inline event handlers (onclick, onload, …) are inline script that `script-src
// 'self'` blocks. Names are matched structurally (on + letters), not against a
// fixed list, so a new/rare handler cannot slip through.
/**
@param element
*/
function eventHandlerAttributes(element: HtmlElement): string[] {
  return element.attributes
    .map(({ key }) => key)
    .filter((key) => /^on[a-z]+$/i.test(key));
}

// URL-bearing attributes whose value can carry a script pseudo-scheme, another
// inline-script vector CSP blocks.
const URL_ATTRIBUTES = ["href", "src", "action", "formaction"];

// The banned pseudo-scheme, assembled from parts (not a literal) so the
// no-script-url rule does not flag this detector as itself a script URL.
const SCRIPT_SCHEME = ["java", "script:"].join("");

/**
@param element
*/
function javascriptUrlAttributes(element: HtmlElement): string[] {
  return URL_ATTRIBUTES.filter(
    (name) =>
      attribute(element, name)
        ?.trim()
        .toLowerCase()
        .startsWith(SCRIPT_SCHEME) === true,
  );
}

/**
@param script
*/
function isInlineExecutableScript(script: HtmlElement): boolean {
  if (script.hasAttribute("src")) {
    return false;
  }
  if (script.textContent.trim() === "") {
    return false;
  }
  const type = (attribute(script, "type") ?? "").trim().toLowerCase();
  return !DATA_SCRIPT_TYPES.has(type);
}

describe("cspMeta plugin", () => {
  // Cover the plugin in-process (a Vite build subprocess would not count toward
  // this file's coverage) and pin the exact tag it injects.
  test("injects the pinned CSP meta at the top of <head>", () => {
    const plugin = cspMeta();
    expect(plugin.name).toBe("csp-meta");
    const hook = plugin.transformIndexHtml;
    if (typeof hook !== "function") {
      throw new TypeError("expected a function transformIndexHtml hook");
    }
    // Reflect.apply calls the hook without a plugin-context `this` (unused here)
    // and without a narrowing type assertion.
    const result: unknown = Reflect.apply(hook, undefined, [
      "",
      { path: "/index.html", filename: "index.html" },
    ]);
    expect(result).toEqual([
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: CSP_POLICY,
        },
        injectTo: "head-prepend",
      },
    ]);
  });

  test("the pinned policy is pure 'self' with no inline escape hatches", () => {
    // A hash/nonce/'unsafe-inline' in script-src or style-src would re-permit the
    // very inline code this harness forbids. Guard the policy value itself.
    expect(CSP_POLICY).toContain("script-src 'self'");
    expect(CSP_POLICY).toContain("style-src 'self'");
    expect(CSP_POLICY).not.toContain("unsafe-inline");
    expect(CSP_POLICY).not.toContain("unsafe-eval");
    expect(CSP_POLICY).not.toContain("nonce-");
    expect(CSP_POLICY).not.toContain("sha256-");
  });
});

describe("built site enforces the CSP end to end", () => {
  let outDirectory: string;
  let pages: { name: string; root: HtmlElement }[];

  beforeAll(async () => {
    const parser = await makeParser();
    // Build to an OS temp dir — never write frontend/dist (frontend is the loop's
    // domain; this harness test only reads what the build emits).
    outDirectory = mkdtempSync(path.join(tmpdir(), "harness-csp-"));
    await build({
      configFile: HARNESS_CONFIG,
      build: { outDir: outDirectory, emptyOutDir: true },
      logLevel: "warn",
    });
    // Recurse: an entry may build to a nested directory, and a page hidden in a
    // subdir must still be checked, not silently skipped.
    pages = readdirSync(outDirectory, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".html"))
      .map((name) => ({
        name,
        root: parser.parseHtml(
          readFileSync(path.join(outDirectory, name), "utf8"),
        ),
      }));
  }, 60_000);

  afterAll(() => {
    if (outDirectory) {
      rmSync(outDirectory, { recursive: true, force: true });
    }
  });

  test("the build emits every page", () => {
    // Guard against a silently-empty build making the assertions below vacuous.
    // This repo ships two build inputs: index.html, 404.html.
    expect(pages.length).toBeGreaterThanOrEqual(2);
  });

  test("every page carries the exact pinned CSP meta", () => {
    for (const { name, root } of pages) {
      const meta = root.querySelector(
        'meta[http-equiv="Content-Security-Policy"]',
      );
      expect(meta, `${name} is missing the CSP meta`).not.toBeNull();
      expect(
        meta === null ? null : attribute(meta, "content"),
        `${name} has a drifted CSP`,
      ).toBe(CSP_POLICY);
    }
  });

  test("no page contains executable inline <script> bodies", () => {
    for (const { name, root } of pages) {
      const offenders = root
        .querySelectorAll("script")
        .filter((script) => isInlineExecutableScript(script));
      expect(
        offenders.length,
        `${name} has ${String(offenders.length)} inline script body/bodies; move them to external files`,
      ).toBe(0);
    }
  });

  test("no page contains inline event-handler attributes (on*=)", () => {
    for (const { name, root } of pages) {
      const offenders = root
        .querySelectorAll("*")
        .flatMap((element) =>
          eventHandlerAttributes(element).map(
            (key) => `${element.tagName}[${key}]`,
          ),
        );
      expect(
        offenders,
        `${name} has inline event handlers: ${offenders.join(", ")}`,
      ).toEqual([]);
    }
  });

  test("no page contains javascript: URLs", () => {
    for (const { name, root } of pages) {
      const offenders = root
        .querySelectorAll("*")
        .flatMap((element) =>
          javascriptUrlAttributes(element).map(
            (key) => `${element.tagName}[${key}]`,
          ),
        );
      expect(
        offenders,
        `${name} has javascript: URLs: ${offenders.join(", ")}`,
      ).toEqual([]);
    }
  });

  test("no page contains inline CSS (<style> blocks or style= attributes)", () => {
    for (const { name, root } of pages) {
      expect(
        root.querySelectorAll("style").length,
        `${name} has an inline <style> block`,
      ).toBe(0);
      expect(
        root.querySelectorAll("[style]").length,
        `${name} has a style= attribute`,
      ).toBe(0);
    }
  });
});
