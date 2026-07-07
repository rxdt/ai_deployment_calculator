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

// Harness-owned tools are invoked by BARE NAME. The gate runs checks with harness/node_modules/
// .bin prepended to PATH (see checkEnvironment in gate.ts), so `eslint`/`prettier`/… resolve
// wherever pnpm links them — no hard-coded path, robust across install layouts.
const tool = (name: string): string => name;
// Fast checks every committer pays. Each check names its harness-owned config explicitly: the
// configs live in harness/ (protected as FORBIDDEN_FILES) and are NOT ancestors of the linted
// files, so the tools' own cosmiconfig walk-up would never find them — the --config flag is what
// makes the protected config actually govern the check.
export const COMMIT_CHECKS: Record<string, string[]> = {
  format: [
    tool("prettier"),
    ".",
    "--check",
    "--ignore-path",
    "harness/.prettierignore",
    "--cache",
    "--cache-location",
    ".cache_prettier",
  ],
  eslint: [
    tool("eslint"),
    ".",
    "--config",
    "harness/eslint.config.js",
    "--cache",
    "--cache-location",
    ".",
    "--max-warnings=0",
  ],
  style: [
    tool("stylelint"),
    // Scope to frontend so the glob never descends into node_modules (~19k dirs) and
    // hangs past the preflight timeout. stylelint's ignore lists (ignoreFiles /
    // --ignore-pattern / --ignore-path) filter AFTER glob expansion, so they cannot
    // prevent the walk — only a frontend-rooted glob can. All project CSS lives under
    // frontend/. The --ignore-path is defense in depth (node_modules, dist, scratchpad…).
    "frontend/**/*.css",
    "--config",
    "harness/stylelint.config.js",
    "--ignore-path",
    "harness/.stylelintignore",
    "--cache",
    "--cache-location",
    ".cache_stylelint",
    "--max-warnings=0",
    "--allow-empty-input",
  ],
  html: [
    tool("html-validate"),
    "--config",
    "harness/.htmlvalidate.json",
    "**/*.html",
  ],
};

// The full bar: app, harness tooling, dependency/security, and browser checks.
//
// FOLLOW-UP (size budget): a per-package `size` check (size-limit) belongs here. The previous size
// subsystem was removed during the library/template redesign; without it an agent can sneak
// new/oversized files into a bundle without tripping a budget. Re-adding it means a `size` entry
// here plus its tests (removed from gate.test.ts — recover the shape from Git history at a721b9a).
export const FULL_CHECKS: Record<string, string[]> = {
  ...COMMIT_CHECKS,
  // The harness-owned app tsconfig governs the typecheck (browser types, strict flags); pinned
  // with -p so an agent can't repoint it at a weaker project tsconfig.
  typecheck: [
    tool("tsc"),
    "-p",
    "harness/tsconfig.app.json",
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
  cruise: [
    tool("depcruise"),
    "frontend/src",
    "--config",
    "harness/.dependency-cruiser.cjs",
    "--output-type",
    "err",
  ],
  deadcode: [tool("knip"), "--config", "harness/knip.json"],
  // Spelling is advisory: --no-exit-code makes cspell print issues but always exit 0, so a typo
  // (or a domain word not yet in the allowlist) warns loudly without ever failing the gate.
  spelling: [
    tool("cspell"),
    ".",
    "--config",
    "harness/cspell.json",
    "--no-progress",
    "--no-summary",
    "--no-exit-code",
  ],
  workflow: [
    tool("spectral"),
    "lint",
    ".github/workflows/ci.yml",
    "--ruleset",
    "harness/.spectral.yml",
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
  secrets: [
    tool("secretlint"),
    "**/*",
    "--secretlintrc",
    "harness/.secretlintrc.json",
  ],
  // pnpm audit reads the pnpm-lock.yaml; --dir targets the frontend package. Covers the same
  // dependency-vulnerability surface npm audit did before the pnpm migration.
  audit: ["pnpm", "--dir", "frontend", "audit", "--audit-level", "high"],
  // No `lockfile` (lockfile-lint) check: lockfile-lint has no pnpm-lock parser (npm/yarn only),
  // and pnpm already blocks the injection vector it guarded — pnpm refuses to install packages in
  // pnpm-lock.yaml that are absent from package.json, and the lock does not carry alternative HTTP
  // tarball sources for registry packages. No `npmSignatures`: `pnpm audit signatures` needs an
  // installed-package context the gate can't give cleanly; osv + pnpm audit cover dependency risk.
  // No `versions` (syncpack) check: this is a TEMPLATE — packages intentionally track `latest`, so
  // enforcing cross-package version consistency fights the intent. Downstream repos may re-add it.
  // Disabled: this is a template — deps track `latest`, so transitive-dep CVEs
  // are noise here. Downstream repos that pin versions should re-enable.
  // osv: [
  //   "osv-scanner",
  //   "scan",
  //   "source",
  //   "--lockfile=frontend/pnpm-lock.yaml",
  //   "--lockfile=harness/pnpm-lock.yaml",
  // ],
  build: ["pnpm", "--dir", "frontend", "run", "build"],
  coverage: [
    tool("vitest"),
    "run",
    "--config",
    "harness/vitest.config.js",
    "--cache",
    "--coverage",
  ],
  // Disabled: e2e/playwright not needed for this workflow.
  // e2e: [tool("playwright"), "test", "--config", "harness/playwright.config.js"],
  // Disabled: nothing to audit yet, and lhci autorun spins up a server/browser that hangs the gate.
  // lighthouse: [tool("lhci"), "autorun", "--config", "harness/lighthouserc.cjs"],
};
