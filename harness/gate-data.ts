// Static data for the gate: the containment denylists and the check registry. Split from gate.ts
// so the engine (git/spawn/containment logic) and its data each stay small and reviewable.

// A staged file is forbidden if a parent dir is here, or its exact path is in the file set.
export const FORBIDDEN_DIRS = new Set([
  "harness",
  "frontend/harness",
  ".githooks",
  ".github",
]);

// Forbidden by basename anywhere in the tree (**/name): a package.json in any package can
// declare dependencies/scripts/size budgets the gate trusts, so none may be committed by an agent.
export const FORBIDDEN_BASENAMES = new Set(["package.json"]);

export const FORBIDDEN_FILES = new Set([
  "AGENTS.md",
  "PROMPT.md",
  "docs/plan.md",
  "harness/preferences.ts",
  "pyproject.toml",
  // tooling/config that would weaken the gate's thresholds or its checks
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "frontend/package.json",
  "frontend/pnpm-lock.yaml",
  "frontend/tsconfig.json",
  "harness/package.json",
  "harness/pnpm-lock.yaml",
  "harness/tsconfig.json",
  "harness/tsconfig.app.json",
  "tsconfig.cruise.json",
  "harness/tsconfig.harness.json",
  "harness/vitest.config.js",
  "harness/eslint.config.js",
  "harness/stylelint.config.js",
  "harness/knip.json",
  "harness/cspell.json",
  "harness/.prettierrc.json",
  "harness/biome.json",
  "harness/.prettierignore",
  "harness/.secretlintrc.json",
  "harness/.spectral.yml",
  "harness/.dependency-cruiser.cjs",
  "harness/playwright.config.js",
  "harness/lighthouserc.cjs",
  "harness/.htmlvalidate.json",
]);

// Escape hatches addable in normal source; config-file hatches are moot (configs are forbidden).
export const FORBIDDEN_PATTERNS = [
  "eslint-disable",
  "stylelint-disable",
  "html-validate-disable",
  "biome-ignore",
  "prettier-ignore",
  "ts-ignore",
  "ts-nocheck",
  "ts-expect-error",
  "v8 ignore",
  "c8 ignore",
  "istanbul ignore",
  "vitest ignore",
  "semgrep:ignore",
  "nosec",
  "secretlint-disable",
  "cspell:disable",
  "cspell:ignore",
  "--no-verify",
  "hooksPath",
  ".only(",
  "test.only",
  "it.only",
  "describe.only",
  "test.skip",
  "it.skip",
  "describe.skip",
  "depcruise: ignore",
  "knipignore",
  "noqa",
  "skipLibCheck",
  "coverage=false",
  "lighthouse:skip",
] as const;

// SINGLE SOURCE OF TRUTH. Every gate check's command lives ONLY in harness/package.json scripts
// (top-level, visible, one place). Here we read that file and derive each check's argv, so the gate
// and the human `pnpm run <check>` cannot drift — a gate.test.ts test re-derives from disk and fails
// on any mismatch. The scripts prefix `cd .. &&` to run from the repo root (where the gate spawns);
// we strip that prefix and tokenize (respecting double-quoted globs). Tools resolve by BARE NAME:
// the gate prepends harness/node_modules/.bin to PATH (see checkEnvironment in gate.ts). Each script
// names its harness-owned config explicitly: the configs live in harness/ (FORBIDDEN) and are NOT
// ancestors of the linted files, so a tool's cosmiconfig walk-up would never find them — the
// --config flag in the script is what makes the protected config govern the check.
import { readFileSync } from "node:fs";

const packageJsonUrl = new URL("package.json", import.meta.url);

// Narrow a parsed package.json (unknown) to its scripts map without an unsafe assertion, keeping
// only string-valued entries (the only kind a script can be). Exported and pure so its malformed
// -input branches are unit-testable (the module-load caller below always passes valid JSON).
/**
@param parsed
*/
export function scriptsMap(parsed: unknown): Map<string, string> {
  if (typeof parsed !== "object" || parsed === null || !("scripts" in parsed)) {
    throw new TypeError("harness/package.json has no scripts object");
  }
  const { scripts } = parsed;
  if (typeof scripts !== "object" || scripts === null) {
    throw new TypeError("harness/package.json scripts is not an object");
  }
  const map = new Map<string, string>();
  for (const [name, value] of Object.entries(scripts)) {
    if (typeof value === "string") {
      map.set(name, value);
    }
  }
  return map;
}

const harnessScripts = scriptsMap(
  JSON.parse(readFileSync(packageJsonUrl, "utf8")),
);

// Tokenize a single shell command into argv, keeping `"quoted globs"` intact and unquoting them.
// Exported and pure so its empty-command branch is unit-testable. An empty string yields [].
/**
@param command
*/
export function tokenizeCommand(command: string): string[] {
  return (command.match(/"[^"]*"|\S+/g) ?? []).map((token) =>
    token.replaceAll(/^"|"$/g, ""),
  );
}

// Parse one package.json script into the argv the gate spawns: drop the leading `cd .. &&`
// root-return prefix, reject any remaining shell operator (a check must be ONE command, not a
// chained alias like `lint`), then tokenize.
/**
@param name
*/
export function checkCommand(name: string): string[] {
  const raw = harnessScripts.get(name);
  if (raw === undefined) {
    throw new Error(`no harness script named "${name}"`);
  }
  const command = raw.replace(/^\s*cd\s+\.\.\s+&&\s*/, "");
  if (/(?:^|\s)(?:&&|\|\||;|\|)(?:\s|$)/.test(command)) {
    throw new Error(
      `harness script "${name}" chains commands; a check must be one command`,
    );
  }
  return tokenizeCommand(command);
}

// Build a check record by deriving each named check's command from its harness script.
/**
@param names
*/
function checksFrom(names: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(names.map((name) => [name, checkCommand(name)]));
}

// Fast checks every committer pays; each is the identically-named harness/package.json script.
export const COMMIT_CHECK_NAMES = [
  "format",
  "eslint",
  "style",
  "html",
] as const;

// The full bar: the commit checks plus app types, harness types, schema, dependency/security, and
// browser checks. Order is the run order. Notable checks (rationale lives with their scripts):
//   typecheck    — app tsconfig (browser types, strict); pinned with -p so it can't be repointed.
//   harnessTypes — harness/*.ts incl. tests; separate tsconfig so vite/client resolves.
//   cruise       — targets frontend/src; uses harness/.dependency-cruiser.cjs.
//   spelling     — advisory: --no-exit-code prints typos but never fails the gate.
//   sast/audit   — semgrep/pnpm-audit; a missing tool now FAILS the gate (no silent skip).
// FOLLOW-UP (size budget): a per-package `size` check (size-limit) belongs here; the old size
// subsystem was removed in the library/template redesign. Re-adding it means a "size" name here,
// its script, and its tests (recover the shape from Git history at a721b9a).
export const FULL_CHECK_NAMES = [
  ...COMMIT_CHECK_NAMES,
  "typecheck",
  "harnessTypes",
  "schema",
  "cruise",
  "deadcode",
  "spelling",
  "workflow",
  "sast",
  "secrets",
  "audit",
  "build",
  "coverage",
  "e2e",
  "lighthouse",
] as const;

// Commands the gate spawns, each derived from its harness script — the one source of truth.
export const COMMIT_CHECKS: Record<string, string[]> =
  checksFrom(COMMIT_CHECK_NAMES);
export const FULL_CHECKS: Record<string, string[]> =
  checksFrom(FULL_CHECK_NAMES);
