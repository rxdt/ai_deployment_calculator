// JavaScript port of harness/gate.py, pointed at the frontend app bar.
//
// 1) runPreflight: fast pre-commit checks (format/lint) plus agent containment.
// 2) runGate: full pre-push gate; owns the project's quality bar.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { preferencesViolations } from "./preferences.js";

// A staged file is forbidden if one of its parent dirs is here, or its exact path is in the file set.
export const FORBIDDEN_DIRS = new Set<string>([
  "harness",
  "frontend/harness",
  ".githooks",
  ".github",
]);

export const FORBIDDEN_FILES = new Set<string>([
  "AGENTS.md",
  "PROMPT.md",
  "docs/plan.md",
  "harness/preferences.ts",
  "pyproject.toml",
  // tooling/config that would weaken the JS gate's thresholds or its checks
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
  "harness/biome.json",
  "harness/knip.json",
  "harness/cspell.json",
  "harness/.markuplintrc.json",
  "harness/.prettierrc.json",
  "harness/.prettierignore",
  "harness/.secretlintrc.json",
  "harness/.spectral.yml",
  "harness/.dependency-cruiser.cjs",
  "harness/playwright.config.js",
  "harness/lighthouserc.cjs",
  "harness/.htmlvalidate.json",
]);

// Escape hatches that disable a check; matched case-insensitively on added lines.
export const FORBIDDEN_PATTERNS: readonly string[] = [
  "noqa",
  "type: ignore",
  "type:ignore",
  "pyright: ignore",
  "pragma: no cover",
  "eslint-disable",
  "eslint-env",
  "stylelint-disable",
  "html-validate-disable",
  "markuplint-disable",
  "biome-ignore",
  "prettier-ignore",
  "ts-ignore",
  "ts-nocheck",
  "ts-expect-error",
  "v8 ignore",
  "istanbul ignore",
  "c8 ignore",
  "vitest ignore",
  "semgrep:ignore",
  "nosec",
  "secretlint-disable",
  "secretlint:disable",
  "cspell:disable",
  "cspell:ignore",
  "cspell:words",
  "--no-verify",
  "no-verify",
  "hooksPath",
  "core.hooksPath",
  "fail_under",
  "cov-fail-under",
  "coverage=false",
  "--coverage=false",
  "--coverage false",
  "passWithNoTests",
  "--passWithNoTests",
  ".only(",
  "test.only",
  "it.only",
  "describe.only",
  "test.skip",
  "it.skip",
  "describe.skip",
  "skipLibCheck",
  "strict\": false",
  "noImplicitAny\": false",
  "strictNullChecks\": false",
  "strictPropertyInitialization\": false",
  "noUncheckedIndexedAccess\": false",
  "exactOptionalPropertyTypes\": false",
  "useUnknownInCatchVariables\": false",
  "allowJs\": true",
  "checkJs\": false",
  "noEmit\": false",
  "noInlineConfig",
  "reportUnusedDisableDirectives\": \"off",
  "reportUnusedDisableDirectives: \"off",
  "max-warnings",
  "--quiet",
  "--ignore-pattern",
  "ignorePatterns",
  "globalIgnores",
  "audit-level=critical",
  "--audit-level=critical",
  "audit-level=none",
  "--ignore",
  "dependency-cruiser:disable",
  "depcruise: ignore",
  "knipignore",
  "lighthouse:skip",
  "lhci autorun --collect.numberOfRuns=0",
];

function comparePath(left: string, right: string): number {
  return left.localeCompare(right);
}

const HARNESS_BIN = "harness/node_modules/.bin";

function harnessTool(name: string): string {
  return path.join(HARNESS_BIN, name);
}

function commandUsesHarnessTool(command: string[]): boolean {
  return (
    command[0]?.startsWith(`${HARNESS_BIN}${path.sep}`) === true ||
    command[0] === HARNESS_BIN
  );
}

function commandUsesFrontendPackage(command: string[]): boolean {
  return (
    command[0] === "npm" &&
    command[1] === "--prefix" &&
    command[2] === "frontend"
  );
}

function commandUsesExternalGateTool(command: string[]): boolean {
  return command[0] === "semgrep" || command[0] === "osv-scanner";
}

const IGNORED_DISCOVERY_DIRECTORIES = new Set([
  ".agents",
  ".codex",
  ".git",
  ".lighthouseci",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "scratchpad",
  "test-results",
]);

function packageHasSizeLimitConfig(packagePath: string): boolean {
  try {
    const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as Record<
      string,
      unknown
    >;
    return Object.hasOwn(parsed, "size-limit");
  } catch {
    return false;
  }
}

function discoverSizeLimitConfigs(repo: string): string[] {
  const discovered: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(path.join(repo, directory), {
      withFileTypes: true,
    })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DISCOVERY_DIRECTORIES.has(entry.name)) {
          visit(relative);
        }
        continue;
      }
      if (entry.isFile() && entry.name === "package.json") {
        const packagePath = path.join(repo, relative);
        if (packageHasSizeLimitConfig(packagePath)) {
          discovered.push(relative);
        }
      }
    }
  };
  visit("");
  return discovered.toSorted(comparePath);
}

function runSizeLimitChecks(
  repo: string,
  command: string[],
  environment: NodeJS.ProcessEnv,
): string[] {
  const failures: string[] = [];
  for (const configPath of discoverSizeLimitConfigs(repo)) {
    const result = spawnSync(
      command[0],
      [...command.slice(1), "--config", configPath],
      {
        cwd: repo,
        encoding: "utf8",
        env: environment,
      },
    );
    if (result.status !== 0) {
      failures.push(
        `size failed:\n${configPath}\n${result.stdout}${result.stderr}`,
      );
    }
  }
  return failures;
}

// Fast checks every committer pays: harness-owned policy, run from repo root.
export const COMMIT_CHECKS: Record<string, string[]> = {
  format: [
    harnessTool("prettier"),
    ".",
    "--check",
    "--ignore-path",
    "harness/.prettierignore",
  ],
  eslint: [
    harnessTool("eslint"),
    ".",
    "--config",
    "harness/eslint.config.js",
    "--max-warnings=0",
  ],
  style: [
    harnessTool("stylelint"),
    "**/*.css",
    "--config",
    "harness/stylelint.config.js",
    "--max-warnings=0",
    "--allow-empty-input",
  ],
  html: [
    harnessTool("html-validate"),
    "--config",
    "harness/.htmlvalidate.json",
    "**/*.html",
  ],
};

// The full bar: frontend app, harness tooling, dependency/security, and browser checks.
export const FULL_CHECKS: Record<string, string[]> = {
  ...COMMIT_CHECKS,
  frontend_types: [
    harnessTool("tsc"),
    "-p",
    "harness/tsconfig.app.json",
    "--noEmit",
  ],
  harness_types: [harnessTool("tsc"), "-p", "harness/tsconfig.json", "--noEmit"],
  markup: [harnessTool("markuplint"), "frontend/**/*.html"],
  schema: [
    harnessTool("ajv"),
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
  package_json: [harnessTool("npmPkgJsonLint"), "."],
  architecture: [
    harnessTool("depcruise"),
    "frontend/src",
    "--config",
    "harness/.dependency-cruiser.cjs",
    "--output-type",
    "err",
  ],
  dead_code: [harnessTool("knip"), "--config", "harness/knip.json"],
  spelling: [
    harnessTool("cspell"),
    ".",
    "--config",
    "harness/cspell.json",
    "--no-progress",
    "--no-summary",
  ],
  workflow_api: [
    harnessTool("spectral"),
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
    harnessTool("secretlint"),
    "**/*",
    "--secretlintrc",
    "harness/.secretlintrc.json",
  ],
  npm_audit: ["npm", "--prefix", "frontend", "audit", "--audit-level=high"],
  pnpm_audit: [
    harnessTool("pnpm"),
    "--dir",
    "frontend",
    "audit",
    "--audit-level",
    "high",
  ],
  pnpm_approve_builds: [
    harnessTool("pnpm"),
    "--dir",
    "frontend",
    "approve-builds",
    "--all",
  ],
  npm_signatures: ["npm", "--prefix", "frontend", "audit", "signatures"],
  lockfile: [
    harnessTool("lockfile-lint"),
    "--path",
    "frontend/package-lock.json",
    "--type",
    "npm",
    "--allowed-hosts",
    "npm",
    "--validate-https",
  ],
  versions: [harnessTool("syncpack"), "lint", "frontend/package.json"],
  osv: ["osv-scanner", "-r", "."],
  build: ["npm", "--prefix", "frontend", "run", "build"],
  coverage: [
    harnessTool("vitest"),
    "run",
    "--config",
    "harness/vitest.config.js",
    "--coverage",
  ],
  e2e: [
    harnessTool("playwright"),
    "test",
    "--config",
    "harness/playwright.config.js",
  ],
  size: [harnessTool("size-limit")],
  lighthouse: [
    harnessTool("lhci"),
    "autorun",
    "--config",
    "harness/lighthouserc.cjs",
  ],
};

const cachedSafeEnvironment: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

/**
A copy of the environment with every GIT_* var stripped, so a poisoned hook env
cannot redirect our Git calls. Computed once (process.env is stable for our run).
@returns The sanitized environment.
*/
export function gitSafeEnvironment(): NodeJS.ProcessEnv {
  return cachedSafeEnvironment;
}

/**
Run a Git command in the repo and return its stdout.
@param repo - The repo root.
@param gitArguments - Arguments after `git -C <repo>`.
@returns The command's stdout.
*/
export function runGit(repo: string, gitArguments: string[]): string {
  const result = spawnSync("git", ["-C", repo, ...gitArguments], {
    encoding: "utf8",
    env: gitSafeEnvironment(),
  });
  if (result.status !== 0) {
    throw new Error(`git ${gitArguments.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

/**
Run each named check command; return one failure entry per command that fails.
@param repo - The directory to run the checks in.
@param checks - A map of check name to argv.
@returns One message per failing check.
*/
export function runChecks(
  repo: string,
  checks: Record<string, string[]>,
): string[] {
  const environment = gitSafeEnvironment();
  const failures: string[] = [];
  for (const [name, command] of Object.entries(checks)) {
    const hasFrontendPackage = existsSync(
      path.join(repo, "frontend", "package.json"),
    );
    const hasHarnessPackage = existsSync(
      path.join(repo, "harness", "package.json"),
    );
    if (commandUsesFrontendPackage(command) && !hasFrontendPackage) {
      continue;
    }
    if (commandUsesHarnessTool(command) && !hasHarnessPackage) {
      continue;
    }
    if (
      commandUsesExternalGateTool(command) &&
      (!hasFrontendPackage || !hasHarnessPackage)
    ) {
      continue;
    }
    if (name === "size") {
      failures.push(...runSizeLimitChecks(repo, command, environment));
      continue;
    }
    const result = spawnSync(command[0], command.slice(1), {
      cwd: repo,
      encoding: "utf8",
      env: environment,
    });
    if (result.status !== 0) {
      failures.push(`${name} failed:\n${result.stdout}${result.stderr}`);
    }
  }
  return failures;
}

/**
Every parent directory of a repo-relative path, e.g. "frontend/harness" for "frontend/harness/x.ts".
@param target - The repo-relative path.
@returns The ancestor directories, deepest first.
*/
function ancestorDirectories(target: string): string[] {
  const parts = target.split("/");
  const parents: string[] = [];
  for (let depth = parts.length - 1; depth > 0; depth -= 1) {
    parents.push(parts.slice(0, depth).join("/"));
  }
  return parents;
}

/**
The staged paths that the agent loop is not allowed to commit.
@param staged - The staged repo-relative paths.
@returns The forbidden subset, sorted.
*/
function forbiddenPaths(staged: Iterable<string>): string[] {
  const forbidden: string[] = [];
  for (const target of staged) {
    if (
      FORBIDDEN_FILES.has(target) ||
      ancestorDirectories(target).some((directory) =>
        FORBIDDEN_DIRS.has(directory),
      )
    ) {
      forbidden.push(target);
    }
  }
  return forbidden.toSorted(comparePath);
}

/**
Parse `git diff --name-status` output and return every path involved in each staged change.
For renames/copies this includes both the source and destination.
@param statusLines - Lines from `git diff --cached --name-status -M`.
@returns The changed path groups.
*/
function stagedPathGroups(statusLines: string[]): string[][] {
  return statusLines.map((line) => {
    const columns = line.split("\t");
    const [status] = columns;
    const isRenameOrCopy = status.startsWith("R") || status.startsWith("C");
    const end = isRenameOrCopy ? columns.length : 2;
    return columns.slice(1, end).filter((target) => target.length > 0);
  });
}

/**
Staged paths from Git, preserving rename/copy pairs.
@param repo - The repo root.
@returns One path group per staged change.
*/
function stagedChanges(repo: string): string[][] {
  return stagedPathGroups(
    runGit(repo, [
      "diff",
      "--cached",
      "--name-status",
      "-M",
      "--diff-filter=ACMRD",
    ])
      .split("\n")
      .filter((line) => line.length > 0),
  );
}

/**
Every staged path from a set of staged change groups.
@param changes - Path groups from `stagedChanges`.
@returns Unique staged paths, sorted.
*/
function stagedPaths(changes: Iterable<Iterable<string>>): string[] {
  return [...new Set([...changes].flatMap((change) => [...change]))].toSorted(
    comparePath,
  );
}

function unstagePaths(repo: string, targets: string[], message: string): void {
  if (targets.length === 0) {
    return;
  }
  runGit(repo, ["reset", "-q", "HEAD", "--", ...targets]);
  process.stderr.write(`${message}: ${targets.join(", ")}\n`);
}

/**
Read a file's staged content from the Git index.
@param repo - The repo root.
@param target - The repo-relative path.
@returns The staged file content, or undefined for deletions/non-file entries.
*/
function stagedText(repo: string, target: string): string | undefined {
  try {
    return runGit(repo, ["show", `:${target}`]);
  } catch {
    return undefined;
  }
}

/**
Run human-preference checks on each staged TypeScript file as it exists in the index.
@param repo - The repo root.
@param staged - The staged repo-relative paths.
@returns Every preference violation found.
*/
export function preferenceProblems(
  repo: string,
  staged: Iterable<string>,
): string[] {
  const problems: string[] = [];
  const sorted = [...staged].toSorted(comparePath);
  for (const target of sorted) {
    const text = target.endsWith(".ts") ? stagedText(repo, target) : undefined;
    if (text !== undefined) {
      problems.push(...preferencesViolations(target, text));
    }
  }
  return problems;
}

/**
Flag every banned escape hatch added by this commit.
@param target - The staged file being checked.
@param diffLines - Lines from `git diff --cached --unified=0`.
@returns One problem per banned pattern on an added line.
*/
function bannedPatternProblems(target: string, diffLines: string[]): string[] {
  const problems: string[] = [];
  for (const line of diffLines) {
    if (!line.startsWith("+") || line.startsWith("+++")) {
      continue;
    }
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (line.toLowerCase().includes(pattern.toLowerCase())) {
        problems.push(
          `${target}: banned pattern '${pattern}' in line: ${line
            .slice(1)
            .trim()}`,
        );
      }
    }
  }
  return problems;
}

function stagedAddedLinesContainForbiddenPattern(
  repo: string,
  target: string,
): boolean {
  const diffLines = runGit(repo, [
    "diff",
    "--cached",
    "--unified=0",
    "--",
    target,
  ])
    .split("\n")
    .filter((line) => line.length > 0);
  return bannedPatternProblems(target, diffLines).length > 0;
}

function containmentDropPaths(repo: string, changes: string[][]): string[] {
  const drops = new Set<string>();
  for (const change of changes) {
    if (forbiddenPaths(change).length > 0) {
      for (const target of change) drops.add(target);
      continue;
    }
    for (const target of change) {
      if (stagedAddedLinesContainForbiddenPattern(repo, target)) {
        drops.add(target);
      }
    }
  }
  return [...drops].toSorted(comparePath);
}

/**
Apply agent-loop staged containment: remove forbidden paths and files adding
escape hatches, then check surviving TypeScript files against preferences.
@param repo - The repo root.
@returns Every problem found; empty means staged containment passed.
*/
function stagedContainmentProblems(repo: string): string[] {
  const initialChanges = stagedChanges(repo);
  const dropped = containmentDropPaths(repo, initialChanges);
  unstagePaths(repo, dropped, "harness kept forbidden paths out of the commit");

  const staged = stagedPaths(stagedChanges(repo));
  const problems: string[] = [];
  if (staged.length === 0) {
    problems.push("Empty commits are rejected. Stage real work.");
  }
  problems.push(...preferenceProblems(repo, staged));
  return problems;
}

/**
Pre-commit: fast lint/format for everyone. RALPH_LOOP=1 adds agent containment.
@param repo - The repo root.
@param runner - The check runner (injectable for tests).
@returns Every problem found; empty means the commit may proceed.
*/
export function runPreflight(
  repo: string,
  runner: typeof runChecks = runChecks,
): string[] {
  const problems =
    process.env.RALPH_LOOP === "1" ? stagedContainmentProblems(repo) : [];
  problems.push(...runner(repo, COMMIT_CHECKS));
  return problems;
}

/**
Pre-push / CI: the whole frontend gate (types, lint, format, build, 100% tests).
@param repo - The repo root.
@param runner - The check runner (injectable for tests).
@returns Every failing check; empty means the push may proceed.
*/
export function runGate(
  repo: string,
  runner: typeof runChecks = runChecks,
): string[] {
  return runner(repo, FULL_CHECKS);
}
