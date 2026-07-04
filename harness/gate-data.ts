// Static data for the gate: the containment denylists and the check registry. Split from gate.ts
// so the engine (git/spawn/containment logic) and its data each stay small and reviewable.

import path from "node:path";

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
  "frontend/package.json",
  "frontend/package-lock.json",
  "frontend/tsconfig.json",
  "harness/package.json",
  "harness/package-lock.json",
  "harness/tsconfig.json",
  "harness/tsconfig.app.json",
  "harness/tsconfig.harness.json",
  "harness/vitest.config.js",
  "harness/eslint.config.js",
  "harness/stylelint.config.js",
  "harness/knip.json",
  "harness/cspell.json",
  "harness/.markuplintrc.json",
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
  "markuplint-disable",
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

const HARNESS_BIN = "harness/node_modules/.bin";
const tool = (name: string): string => path.join(HARNESS_BIN, name);

// Fast checks every committer pays. Tools auto-discover the project's own config (cosmiconfig),
// falling back to their built-in defaults; the gate supplies only scope + policy flags.
export const COMMIT_CHECKS: Record<string, string[]> = {
  format: [
    tool("prettier"),
    ".",
    "--check",
    "--cache",
    "--cache-location",
    ".cache_prettier",
  ],
  eslint: [
    tool("eslint"),
    ".",
    "--cache",
    "--cache-location",
    ".",
    "--max-warnings=0",
  ],
  style: [
    tool("stylelint"),
    "**/*.css",
    "--cache",
    "--cache-location",
    ".cache_stylelint",
    "--max-warnings=0",
    "--allow-empty-input",
  ],
  html: [tool("html-validate"), "**/*.html"],
};

// The full bar: app, harness tooling, dependency/security, and browser checks.
export const FULL_CHECKS: Record<string, string[]> = {
  ...COMMIT_CHECKS,
  // The project's own tsconfig.json governs its typecheck; the harness only enforces --noEmit.
  typecheck: [
    tool("tsc"),
    "--noEmit",
    "--incremental",
    "--tsBuildInfoFile",
    ".cache_tsbuildinfo_app",
  ],
  harnessTypes: [
    tool("tsc"),
    "-p",
    "harness/tsconfig.harness.json",
    "--noEmit",
    "--incremental",
    "--tsBuildInfoFile",
    ".cache_tsbuildinfo_harness",
  ],
  // Only lint our own source HTML. Broad globs sweep vendor/built report HTML we do not ship.
  markup: [tool("markuplint"), "frontend/index.html", "--max-warnings", "0"],
  schema: [
    tool("ajv"),
    "compile",
    "-s",
    "frontend/schemas/**/*.schema.json",
    "--spec=draft2020",
    "--strict=true",
    "--all-errors",
    "-c",
    "ajv-formats",
    "-c",
    "ajv-keywords",
  ],
  packageJson: [tool("npmPkgJsonLint"), "."],
  cruise: [tool("depcruise"), "frontend/src", "--output-type", "err"],
  deadcode: [tool("knip")],
  spelling: [tool("cspell"), ".", "--no-progress", "--no-summary"],
  workflow: [
    tool("spectral"),
    "lint",
    ".github/workflows/ci.yml",
    "--fail-severity=warn",
  ],
  sast: [
    "semgrep",
    "scan",
    "--config=p/typescript",
    "--config=p/javascript",
    "--config=p/security-audit",
    "--error",
    "--metrics=off",
  ],
  secrets: [tool("secretlint"), "**/*"],
  npmAudit: ["npm", "--prefix", "frontend", "audit", "--audit-level=high"],
  pnpmAudit: [
    tool("pnpm"),
    "--dir",
    "frontend",
    "audit",
    "--audit-level",
    "high",
  ],
  npmSignatures: ["npm", "--prefix", "frontend", "audit", "signatures"],
  lockfile: [
    tool("lockfile-lint"),
    "--path",
    "frontend/package-lock.json",
    "--type",
    "npm",
    "--allowed-hosts",
    "npm",
    "--validate-https",
  ],
  versions: [tool("syncpack"), "lint"],
  osv: [
    "osv-scanner",
    "scan",
    "source",
    "--lockfile=frontend/package-lock.json",
    "--lockfile=harness/package-lock.json",
  ],
  build: ["npm", "--prefix", "frontend", "run", "build"],
  coverage: [tool("vitest"), "run", "--coverage"],
  e2e: [tool("playwright"), "test"],
  lighthouse: [tool("lhci"), "autorun"],
};
