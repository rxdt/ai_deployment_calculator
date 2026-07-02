// JavaScript port of harness/gate.py.
//
// 1) runPreflight: fast pre-commit checks plus agent containment.
// 2) runGate: full pre-push gate; mirrors what runs on GitHub.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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
const CHECK_TIMEOUT_MS = 30_000;
const SKIP_DIRECTORIES = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
  "scratchpad",
  "test-results",
]);

// Default config path per check.
export const DEFAULT_CONFIGS: Record<string, string> = {
  eslint: "harness/eslint.config.js",
  style: "harness/stylelint.config.js",
  html: "harness/.htmlvalidate.json",
  typecheck: "harness/tsconfig.app.json",
  cruise: "harness/.dependency-cruiser.cjs",
  deadcode: "harness/knip.json",
  spelling: "harness/cspell.json",
  workflow: "harness/.spectral.yml",
  coverage: "harness/vitest.config.js",
  e2e: "harness/playwright.config.js",
  lighthouse: "harness/lighthouserc.cjs",
};

// Fast checks every committer pays.
export const COMMIT_CHECKS: Record<string, string[]> = {
  format: [
    tool("prettier"),
    ".",
    "--check",
    "--ignore-path",
    "harness/.prettierignore",
  ],
  eslint: [
    tool("eslint"),
    ".",
    "--config",
    "harness/eslint.config.js",
    "--max-warnings=0",
  ],
  style: [
    tool("stylelint"),
    "frontend/src/**/*.css",
    "--config",
    "harness/stylelint.config.js",
    "--max-warnings=0",
    "--allow-empty-input",
  ],
  html: [
    tool("html-validate"),
    "--config",
    "harness/.htmlvalidate.json",
    "frontend/index.html",
  ],
};

// The full bar: app, harness tooling, dependency/security, and browser checks.
export const FULL_CHECKS: Record<string, string[]> = {
  ...COMMIT_CHECKS,
  typecheck: [tool("tsc"), "-p", "harness/tsconfig.app.json", "--noEmit"],
  harness_types: [tool("tsc"), "-p", "harness/tsconfig.json", "--noEmit"],
  markup: [tool("markuplint"), "frontend/**/*.html"],
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
  package_json: [tool("npmPkgJsonLint"), "."],
  architecture: [
    tool("depcruise"),
    "frontend/src",
    "--config",
    "harness/.dependency-cruiser.cjs",
    "--output-type",
    "err",
  ],
  deadcode: [tool("knip"), "--config", "harness/knip.json"],
  spelling: [
    tool("cspell"),
    ".",
    "--config",
    "harness/cspell.json",
    "--no-progress",
    "--no-summary",
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
  npm_audit: ["npm", "--prefix", "frontend", "audit", "--audit-level=high"],
  pnpm_audit: [
    tool("pnpm"),
    "--dir",
    "frontend",
    "audit",
    "--audit-level",
    "high",
  ],
  npm_signatures: ["npm", "--prefix", "frontend", "audit", "signatures"],
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
  versions: [tool("syncpack"), "lint", "frontend/package.json"],
  osv: ["osv-scanner", "-r", "."],
  build: ["npm", "--prefix", "frontend", "run", "build"],
  coverage: [
    tool("vitest"),
    "run",
    "--config",
    "harness/vitest.config.js",
    "--coverage",
  ],
  e2e: [tool("playwright"), "test", "--config", "harness/playwright.config.js"],
  size: [tool("size-limit")],
  lighthouse: [tool("lhci"), "autorun", "--config", "harness/lighthouserc.cjs"],
};

// process.env minus every GIT_* var, so a poisoned env can't redirect our Git calls.
/**

*/
export function gitSafeEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
}

// Run a Git command in the repo and return its stdout.
/**

* @param repo
* @param arguments_
*/
export function runGit(repo: string, arguments_: string[]): string {
  const result = spawnSync("git", ["-C", repo, ...arguments_], {
    encoding: "utf8",
    env: gitSafeEnvironment(),
  });
  if (result.status !== 0) {
    throw new Error(`git ${arguments_.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

/**

* @param repo
* @param directory
*/
function hasPackage(repo: string, directory: string): boolean {
  return existsSync(path.join(repo, directory, "package.json"));
}

/**

* @param repo
* @param command
*/
function shouldSkipCheck(repo: string, command: readonly string[]): boolean {
  const [executable = "", first = "", second = ""] = command;
  if (
    executable.startsWith(`${HARNESS_BIN}${path.sep}`) &&
    !hasPackage(repo, "harness")
  ) {
    return true;
  }
  if (
    executable === "npm" &&
    first === "--prefix" &&
    second === "frontend" &&
    !hasPackage(repo, "frontend")
  ) {
    return true;
  }
  return (executable === "semgrep" || executable === "osv-scanner") &&
    (!hasPackage(repo, "frontend") || !hasPackage(repo, "harness"));
}

/**

* @param name
* @param command
* @param detail
*/
function commandFailure(
  name: string,
  command: readonly string[],
  detail: string,
): string {
  return `${name} failed:\n${detail}`;
}

/**

* @param repo
* @param name
* @param command
* @param environment
*/
function runOneCheck(
  repo: string,
  name: string,
  command: readonly string[],
  environment: NodeJS.ProcessEnv,
): string | undefined {
  const [executable, ...rest] = command;
  if (executable === undefined || executable.length === 0) {
    return commandFailure(name, command, "empty command");
  }
  if (shouldSkipCheck(repo, command)) {
    return undefined;
  }
  const result = spawnSync(executable, rest, {
    cwd: repo,
    encoding: "utf8",
    env: environment,
    timeout: CHECK_TIMEOUT_MS,
  });
  if (
    result.status === 0 &&
    result.signal === null &&
    result.error === undefined
  ) {
    return undefined;
  }
  const error = result.error === undefined ? "" : String(result.error);
  const signal = result.signal === null ? "" : result.signal;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}${error}${signal}`;
  return commandFailure(
    name,
    command,
    output.length > 0 ? output : command.join(" "),
  );
}

/**

* @param repo
* @param relpath
*/
function readPackageJson(
  repo: string,
  relpath: string,
): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(path.join(repo, relpath), "utf8"),
    );
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**

* @param repo
* @param relpath
*/
function packageHasSizeLimit(repo: string, relpath: string): boolean {
  const parsed = readPackageJson(repo, relpath);
  return parsed !== undefined && Object.hasOwn(parsed, "size-limit");
}

/**

* @param repo
* @param directory
*/
function discoverSizePackages(repo: string, directory = ""): string[] {
  return readdirSync(path.join(repo, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRECTORIES.has(entry.name)
        ? []
        : discoverSizePackages(repo, relative);
    }
    return entry.isFile() &&
      entry.name === "package.json" &&
      relative !== "frontend/package.json" &&
      packageHasSizeLimit(repo, relative)
      ? [relative]
      : [];
  });
}

/**

* @param repo
* @param packagePath
*/
function writeSizeConfig(repo: string, packagePath: string): string {
  const parsed = readPackageJson(repo, packagePath) ?? {};
  const target = path.join(
    mkdtempSync(path.join(tmpdir(), "harness-size-")),
    "package.json",
  );
  writeFileSync(target, `${JSON.stringify(parsed)}\n`);
  return target;
}

/**

* @param repo
* @param name
* @param command
* @param environment
*/
function runSizeChecks(
  repo: string,
  name: string,
  command: readonly string[],
  environment: NodeJS.ProcessEnv,
): string[] {
  const packages = discoverSizePackages(repo).toSorted((left, right) =>
    left.localeCompare(right),
  );
  return packages.flatMap((packagePath) => {
    const config = writeSizeConfig(repo, packagePath);
    const failure = runOneCheck(
      repo,
      name,
      [...command, "--config", config],
      environment,
    );
    return failure === undefined ? [] : [`${failure}\n${packagePath}`];
  });
}

/**

* @param repo
*/
function stagedNames(repo: string): string[] {
  return runGit(repo, ["diff", "--cached", "--name-only"])
    .split("\n")
    .filter((line) => line.length > 0);
}

interface StagedChange {
  paths: string[];
  status: string;
}

/**

* @param repo
*/
function stagedChanges(repo: string): StagedChange[] {
  const fields = runGit(repo, [
    "diff",
    "--cached",
    "--name-status",
    "-z",
    "-M20%",
    "-C20%",
    "--find-copies-harder",
  ])
    .split("\0")
    .filter((field) => field.length > 0);
  const changes: StagedChange[] = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index] ?? "";
    index += 1;
    const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
    const paths = fields.slice(index, index + pathCount);
    index += pathCount;
    if (status.length > 0 && paths.length === pathCount) {
      changes.push({ paths, status });
    }
  }
  return changes;
}

/**

* @param file
*/
function forbiddenPath(file: string): boolean {
  return (
    FORBIDDEN_FILES.has(file) ||
    [...FORBIDDEN_DIRS].some(
      (dir) => file === dir || file.startsWith(`${dir}/`),
    )
  );
}

/**

* @param repo
* @param paths
*/
function stagedDiffAddedLines(
  repo: string,
  paths: readonly string[],
): string[] {
  if (paths.length === 0) {
    return [];
  }
  return runGit(repo, ["diff", "--cached", "--unified=0", "--", ...paths])
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
}

/**

* @param repo
* @param file
*/
function stagedContent(repo: string, file: string): string | undefined {
  const result = spawnSync("git", ["-C", repo, "show", `:${file}`], {
    encoding: "utf8",
    env: gitSafeEnvironment(),
  });
  return result.status === 0 ? result.stdout : undefined;
}

/**

* @param repo
*/
function forbiddenPathsFromDiff(repo: string): string[] {
  return stagedChanges(repo)
    .filter((change) => change.paths.some(forbiddenPath))
    .flatMap((change) => change.paths);
}

/**

* @param repo
* @param files
*/
function dropStaged(repo: string, files: readonly string[]): void {
  if (files.length === 0) {
    return;
  }
  runGit(repo, ["reset", "-q", "HEAD", "--", ...files]);
  process.stderr.write(
    `harness kept forbidden paths out of the commit: ${files.join(", ")}\n`,
  );
}

/**

* @param repo
*/
function dropBannedPatternFiles(repo: string): void {
  const files = new Set<string>();
  const changes = stagedChanges(repo);
  const deletedPaths = changes
    .filter((change) => change.status.startsWith("D"))
    .flatMap((change) => change.paths);
  for (const change of changes) {
    const addedLines = stagedDiffAddedLines(repo, change.paths);
    const hasBannedPattern = addedLines.some((line) =>
      FORBIDDEN_PATTERNS.some((pattern) =>
        line.toLowerCase().includes(pattern.toLowerCase()),
      ),
    );
    if (hasBannedPattern) {
      for (const file of change.paths) {
        files.add(file);
      }
      if (change.status.startsWith("A")) {
        for (const file of deletedPaths) {
          files.add(file);
        }
      }
    }
  }
  dropStaged(
    repo,
    [...files].toSorted((left, right) => left.localeCompare(right)),
  );
}

/**

* @param repo
* @param files
*/
function preferenceProblems(repo: string, files: readonly string[]): string[] {
  return files
    .toSorted((left, right) => left.localeCompare(right))
    .flatMap((file) => {
      const content = file.endsWith(".ts")
        ? stagedContent(repo, file)
        : undefined;
      return content === undefined ? [] : preferencesViolations(file, content);
    });
}

// Run each named check; one failure entry per command that fails.
/**

* @param repo
* @param checks
*/
export function runChecks(
  repo: string,
  checks: Record<string, string[]>,
): string[] {
  const environment = gitSafeEnvironment();
  const failures: string[] = [];
  for (const [name, command] of Object.entries(checks)) {
    failures.push(
      ...(name === "size"
        ? runSizeChecks(repo, name, command, environment)
        : [runOneCheck(repo, name, command, environment)].filter(
            (failure): failure is string => failure !== undefined,
          )),
    );
  }
  return failures;
}

// Pre-commit: fast lint/format for everyone. For agents in the loop (RALPH_LOOP) also
// drop forbidden staged paths and flag banned patterns + human-preference breaks.
/**

* @param repo
* @param runner
*/
export function runPreflight(
  repo: string,
  runner: typeof runChecks = runChecks,
): string[] {
  const problems: string[] = [];
  if (process.env.RALPH_LOOP === "1") {
    dropStaged(repo, forbiddenPathsFromDiff(repo));
    dropStaged(
      repo,
      stagedNames(repo)
        .filter(forbiddenPath)
        .toSorted((left, right) => left.localeCompare(right)),
    );
    dropBannedPatternFiles(repo);
    const staged = stagedNames(repo).toSorted((left, right) =>
      left.localeCompare(right),
    );
    if (staged.length === 0) {
      problems.push("Empty commits are rejected. Stage real work.");
    }
    problems.push(...preferenceProblems(repo, staged));
  }
  problems.push(...runner(repo, COMMIT_CHECKS));
  return problems;
}

// Pre-push / CI: lint, format, types, security, build, 100% tests, browser checks.
/**

* @param repo
* @param runner
*/
export function runGate(
  repo: string,
  runner: typeof runChecks = runChecks,
): string[] {
  return runner(repo, FULL_CHECKS);
}
