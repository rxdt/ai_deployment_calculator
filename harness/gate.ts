// JavaScript port of harness/gate.py.
//
// 1) runPreflight: fast pre-commit checks plus agent containment.
// 2) runGate: full pre-push gate; mirrors what runs on GitHub.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { preferencesViolations } from "./preferences.js";

// A staged file is forbidden if a parent dir is here, or its exact path is in the file set.
export const FORBIDDEN_DIRS = new Set([
  "harness",
  "frontend/harness",
  ".githooks",
  ".github",
]);

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
  "harness/vitest.config.js",
  "harness/eslint.config.js",
  "harness/stylelint.config.js",
  "harness/knip.json",
  "harness/cspell.json",
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
] as const;

const HARNESS_BIN = "harness/node_modules/.bin";
const tool = (name: string): string => path.join(HARNESS_BIN, name);

// Default config path per check; `harness setup` overwrites these in harness/configs.json.
export const DEFAULT_CONFIGS: Record<string, string> = {
  eslint: "harness/eslint.config.js",
  style: "harness/stylelint.config.js",
  html: "harness/.htmlvalidate.json",
  frontend_types: "harness/tsconfig.app.json",
  architecture: "harness/.dependency-cruiser.cjs",
  dead_code: "harness/knip.json",
  spelling: "harness/cspell.json",
  workflow_api: "harness/.spectral.yml",
  coverage: "harness/vitest.config.js",
  e2e: "harness/playwright.config.js",
  lighthouse: "harness/lighthouserc.cjs",
};

// Fast checks every committer pays.
export const COMMIT_CHECKS: Record<string, string[]> = {
  format: [tool("prettier"), ".", "--check", "--ignore-path", "harness/.prettierignore"],
  eslint: [tool("eslint"), ".", "--config", "harness/eslint.config.js", "--max-warnings=0"],
  style: [tool("stylelint"), "**/*.css", "--config", "harness/stylelint.config.js", "--max-warnings=0", "--allow-empty-input"],
  html: [tool("html-validate"), "--config", "harness/.htmlvalidate.json", "**/*.html"],
};

// The full bar: app, harness tooling, dependency/security, and browser checks.
export const FULL_CHECKS: Record<string, string[]> = {
  ...COMMIT_CHECKS,
  frontend_types: [tool("tsc"), "-p", "harness/tsconfig.app.json", "--noEmit"],
  harness_types: [tool("tsc"), "-p", "harness/tsconfig.json", "--noEmit"],
  markup: [tool("markuplint"), "frontend/**/*.html"],
  schema: [tool("ajv"), "compile", "-s", "frontend/schemas/**/*.schema.json", "--spec=draft2020", "--strict=true", "--all-errors", "-c", "ajv-formats", "-c", "ajv-keywords"],
  package_json: [tool("npmPkgJsonLint"), "."],
  architecture: [tool("depcruise"), "frontend/src", "--config", "harness/.dependency-cruiser.cjs", "--output-type", "err"],
  dead_code: [tool("knip"), "--config", "harness/knip.json"],
  spelling: [tool("cspell"), ".", "--config", "harness/cspell.json", "--no-progress", "--no-summary"],
  workflow_api: [tool("spectral"), "lint", ".github/workflows/ci.yml", "--ruleset", "harness/.spectral.yml", "--fail-severity=warn"],
  sast: ["semgrep", "scan", "--config=p/typescript", "--config=p/javascript", "--config=p/security-audit", "--error", "--metrics=off"],
  secrets: [tool("secretlint"), "**/*", "--secretlintrc", "harness/.secretlintrc.json"],
  npm_audit: ["npm", "--prefix", "frontend", "audit", "--audit-level=high"],
  npm_signatures: ["npm", "--prefix", "frontend", "audit", "signatures"],
  lockfile: [tool("lockfile-lint"), "--path", "frontend/package-lock.json", "--type", "npm", "--allowed-hosts", "npm", "--validate-https"],
  versions: [tool("syncpack"), "lint", "frontend/package.json"],
  osv: ["osv-scanner", "-r", "."],
  build: ["npm", "--prefix", "frontend", "run", "build"],
  coverage: [tool("vitest"), "run", "--config", "harness/vitest.config.js", "--coverage"],
  e2e: [tool("playwright"), "test", "--config", "harness/playwright.config.js"],
  lighthouse: [tool("lhci"), "autorun", "--config", "harness/lighthouserc.cjs"],
};

// process.env minus every GIT_* var, so a poisoned env can't redirect our git calls.
export function gitSafeEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
}

// Run a git command in the repo and return its stdout.
export function runGit(repo: string, args: string[]): string {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: gitSafeEnvironment(),
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

// Run each named check; one failure entry per command that fails. The default config
// path token is swapped for the path resolved at `harness setup`.
export function runChecks(
  repo: string,
  checks: Record<string, string[]>,
): string[] {
  const environment = gitSafeEnvironment();
  const configFile = path.join(repo, "harness", "configs.json");
  const configs = existsSync(configFile)
    ? { ...DEFAULT_CONFIGS, ...(JSON.parse(readFileSync(configFile, "utf8")) as Record<string, string>) }
    : DEFAULT_CONFIGS;
  const failures: string[] = [];
  for (const [name, command] of Object.entries(checks)) {
    const [executable = "", ...rest] = command.map((token) =>
      token === DEFAULT_CONFIGS[name] ? configs[name] : token,
    );
    const result = spawnSync(executable, rest, { cwd: repo, encoding: "utf8", env: environment });
    if (result.status !== 0) {
      failures.push(`${name} failed:\n${result.stdout}${result.stderr}`);
    }
  }
  return failures;
}

// Pre-commit: fast lint/format for everyone. For agents in the loop (RALPH_LOOP) also
// drop forbidden staged paths and flag banned patterns + human-preference breaks.
export function runPreflight(
  repo: string,
  runner: typeof runChecks = runChecks,
): string[] {
  const problems: string[] = [];
  if (process.env.RALPH_LOOP === "1") {
    const staged = runGit(repo, ["diff", "--cached", "--name-only", "--no-renames", "--diff-filter=ACMRD"])
      .split("\n")
      .filter((line) => line.length > 0);
    const forbidden = staged
      .filter(
        (file) =>
          FORBIDDEN_FILES.has(file) ||
          [...FORBIDDEN_DIRS].some((dir) => file === dir || file.startsWith(`${dir}/`)),
      )
      .toSorted((left, right) => left.localeCompare(right));
    if (forbidden.length > 0) {
      runGit(repo, ["reset", "-q", "HEAD", "--", ...forbidden]);
      process.stderr.write(`harness kept forbidden paths out of the commit: ${forbidden.join(", ")}\n`);
    }
    const added = runGit(repo, ["diff", "--cached", "--unified=0"])
      .split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
    for (const line of added) {
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (line.toLowerCase().includes(pattern.toLowerCase())) {
          problems.push(`banned pattern '${pattern}' in line: ${line.slice(1).trim()}`);
        }
      }
    }
    for (const file of staged.toSorted((left, right) => left.localeCompare(right))) {
      const full = path.join(repo, file);
      if (file.endsWith(".ts") && existsSync(full)) {
        problems.push(...preferencesViolations(file, readFileSync(full, "utf8")));
      }
    }
  }
  problems.push(...runner(repo, COMMIT_CHECKS));
  return problems;
}

// Pre-push / CI: lint, format, types, security, build, 100% tests, browser checks.
export function runGate(
  repo: string,
  runner: typeof runChecks = runChecks,
): string[] {
  return runner(repo, FULL_CHECKS);
}
