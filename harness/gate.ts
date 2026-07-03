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

// Forbidden by basename anywhere in the tree (**/name): a package.json in any package can
// declare dependencies/scripts/size budgets the gate trusts, so none may be committed by an agent.
export const FORBIDDEN_BASENAMES = new Set(["package.json"]);

// User-config filenames `harness setup` could adopt to repoint a gate check. This is the single
// source of truth: CLI re-exports it, and every path here is folded into FORBIDDEN_FILES below so
// an agent can never commit one (setup would otherwise point the gate at a toothless config).
export const CONFIG_CANDIDATES: Record<string, readonly string[]> = {
  eslint: [
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
  ],
  style: ["stylelint.config.js", "stylelint.config.cjs", ".stylelintrc.json"],
  html: [".htmlvalidate.json", ".htmlvalidate.js"],
  typecheck: ["frontend/tsconfig.json", "tsconfig.json"],
  cruise: [
    ".dependency-cruiser.cjs",
    ".dependency-cruiser.js",
    ".dependency-cruiser.json",
  ],
  deadcode: ["knip.json", "knip.jsonc", "knip.config.ts"],
  spelling: ["cspell.json", "cspell.config.js", ".cspell.json"],
  workflow: [".spectral.yml", ".spectral.yaml", ".spectral.json"],
  coverage: [
    "vitest.config.ts",
    "vitest.config.js",
    "vite.config.ts",
    "vite.config.js",
  ],
  e2e: ["playwright.config.ts", "playwright.config.js"],
  lighthouse: ["lighthouserc.cjs", "lighthouserc.js", "lighthouserc.json"],
};

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
  // every user-config candidate is folded in below (single source: CONFIG_CANDIDATES), so an
  // agent can never commit a root config that `harness setup` would later point the gate at.
  ...Object.values(CONFIG_CANDIDATES).flat(),
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
// Preflight fast checks must fail fast if they hang; the full gate has no timeout because its
// heavy checks (browser, build, coverage, networked audits) legitimately run for a long time.
const PREFLIGHT_TIMEOUT_MS = 10_000;
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
    "**/*.css",
    "--config",
    "harness/stylelint.config.js",
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
export const FULL_CHECKS: Record<string, string[]> = {
  ...COMMIT_CHECKS,
  typecheck: [tool("tsc"), "-p", "harness/tsconfig.app.json", "--noEmit"],
  harnessTypes: [
    tool("tsc"),
    "-p",
    "harness/tsconfig.harness.json",
    "--noEmit",
  ],
  markup: [tool("markuplint"), "frontend/**/*.html", "--max-warnings", "0"],
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
  cruise: [
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

// Env vars that inject code into Node/npm subprocesses. `NODE_OPTIONS=--require ./evil.js` (and
// the npm-prefixed variants) run attacker code inside the very tools that judge the diff, with no
// trace in the repo. Stripped alongside GIT_* so neither Git calls nor checks can be redirected.
const UNSAFE_ENV_KEYS = new Set([
  "NODE_OPTIONS",
  "NODE_REPL_EXTERNAL_MODULE",
  "npm_config_node_options",
]);
const UNSAFE_ENV_PREFIXES = ["GIT_"];

// process.env minus GIT_* and code-injection vars, so a poisoned env can't redirect our Git calls
// or run arbitrary code inside the checks. PATH/HOME/NODE_* the toolchain needs are preserved.
/**

*/
export function gitSafeEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !UNSAFE_ENV_KEYS.has(key) &&
        UNSAFE_ENV_PREFIXES.every((prefix) => !key.startsWith(prefix)),
    ),
  );
}

// Run a Git command in the repo and return its stdout.
/**

* @param repo
* @param args
*/
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

/**

* @param repo
* @param directory
*/
function hasPackage(repo: string, directory: string): boolean {
  return existsSync(path.join(repo, directory, "package.json"));
}

// A package.json that Git knows (in the index OR committed in HEAD) but is missing on disk was
// DELETED. Skipping checks because a known package.json vanished is the fail-open bug an agent
// exploits to disable whole check families (sast/osv/audit/build/coverage) by "cleaning up" a
// file — `git rm` removes it from the index, so we must also consult HEAD. Deletion fails closed.
/**

@param repo
@param directory
*/
function isPackageDeleted(repo: string, directory: string): boolean {
  const relpath = path.posix.join(directory, "package.json");
  if (existsSync(path.join(repo, directory, "package.json"))) {
    return false;
  }
  const isInIndex = runGit(repo, ["ls-files", "--", relpath]).trim().length > 0;
  if (isInIndex) {
    return true;
  }
  // ls-tree throws on a repo with no commits; a package.json cannot be "deleted from HEAD" there.
  try {
    return (
      runGit(repo, ["ls-tree", "--name-only", "HEAD", "--", relpath]).trim()
        .length > 0
    );
  } catch {
    return false;
  }
}

/**

* @param repo
* @param command
*/
function shouldSkipCheck(repo: string, command: readonly string[]): boolean {
  const [executable = "", first = "", second = ""] = command;
  // Fail closed: a DELETED (tracked-but-missing) package.json must never let a check skip. Only a
  // never-scaffolded template (absent AND untracked) legitimately skips its package-scoped checks.
  if (isPackageDeleted(repo, "harness") || isPackageDeleted(repo, "frontend")) {
    return false;
  }
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
  return (
    (executable === "semgrep" || executable === "osv-scanner") &&
    (!hasPackage(repo, "frontend") || !hasPackage(repo, "harness"))
  );
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

// Per-run invariants shared by every check in a runChecks pass.
interface CheckContext {
  repo: string;
  environment: NodeJS.ProcessEnv;
  timeoutMs: number;
}

// Flags whose FOLLOWING argument is a harness enforcement file the check reads. A missing such
// file must fail with a clear message, not an obscure tool crash — otherwise an agent can neuter a
// check by deleting/never-creating its config (the tsconfig.harness.json landmine) and the next
// run inherits a cryptic red gate that masks the weakening as an environment error.
const CONFIG_FLAGS = new Set([
  "--config",
  "-c",
  "-p",
  "--project",
  "-s",
  "--ruleset",
  "--secretlintrc",
  "--ignore-path",
  "--secretlintignore",
]);

// The referenced harness config file that is missing, if any. Only checks `harness/...` paths, so
// a check's own repo-relative source targets (e.g. globs) are never mistaken for enforcement files.
/**

@param repo
@param command
*/
function missingReferencedConfig(
  repo: string,
  command: readonly string[],
): string | undefined {
  for (let index = 0; index + 1 < command.length; index += 1) {
    const flag = command[index] ?? "";
    if (!CONFIG_FLAGS.has(flag)) {
      continue;
    }
    const reference = command[index + 1] ?? "";
    if (!reference.startsWith("harness/")) {
      continue;
    }
    if (!existsSync(path.join(repo, reference))) {
      return reference;
    }
  }
  return undefined;
}

/**

* @param context
* @param name
* @param command
*/
function runOneCheck(
  context: CheckContext,
  name: string,
  command: readonly string[],
): string | undefined {
  const [executable, ...rest] = command;
  if (executable === undefined || executable.length === 0) {
    return commandFailure(name, command, "empty command");
  }
  if (shouldSkipCheck(context.repo, command)) {
    return undefined;
  }
  const missingConfig = missingReferencedConfig(context.repo, command);
  if (missingConfig !== undefined) {
    return commandFailure(
      name,
      command,
      `enforcement config missing: ${missingConfig} (a referenced harness config file does not exist)`,
    );
  }
  const result = spawnSync(executable, rest, {
    cwd: context.repo,
    encoding: "utf8",
    env: context.environment,
    // 0 => undefined => no timeout: the full gate must run long browser/build checks.
    timeout: context.timeoutMs > 0 ? context.timeoutMs : undefined,
  });
  if (
    result.status === 0 &&
    result.signal === null &&
    result.error === undefined
  ) {
    return undefined;
  }
  const error = result.error === undefined ? "" : String(result.error);
  const signal = result.signal ?? "";
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
function isSizeLimited(repo: string, relpath: string): boolean {
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
      isSizeLimited(repo, relative)
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
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "harness-size-"));
  const target = path.join(temporaryDirectory, "package.json");
  writeFileSync(target, `${JSON.stringify(parsed)}\n`);
  return target;
}

/**

* @param context
* @param name
* @param command
*/
function runSizeChecks(
  context: CheckContext,
  name: string,
  command: readonly string[],
): string[] {
  const packages = discoverSizePackages(context.repo).toSorted((left, right) =>
    left.localeCompare(right),
  );
  return packages.flatMap((packagePath) => {
    const config = writeSizeConfig(context.repo, packagePath);
    const failure = runOneCheck(context, name, [
      ...command,
      "--config",
      config,
    ]);
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

// Staged symlinks (Git mode 120000). A symlink's path may look like ordinary source while it
// points at a protected file or outside the repo, so the loop must eject it, not read it as text.
/**

* @param repo
*/
function stagedSymlinks(repo: string): string[] {
  return runGit(repo, ["ls-files", "--stage", "-z"])
    .split("\0")
    .filter((entry) => entry.length > 0)
    .flatMap((entry) => {
      const [meta = "", file = ""] = entry.split("\t");
      return meta.startsWith("120000") ? [file] : [];
    });
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
    const status = fields.at(index) ?? "";
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

// Canonicalize a staged path so case-insensitive filesystems (macOS: `Harness/gate.ts`),
// `./`-segments, backslashes, and NFC/NFD Unicode variants cannot slip a forbidden path past the
// exact-string sets. The FORBIDDEN_* entries are already lowercase POSIX, so we match against the
// canonical lowercase form. We match the ORIGINAL and the canonical form (belt and suspenders).
/**

@param file
*/
function canonicalMatchPath(file: string): string {
  return path.posix
    .normalize(file.replaceAll("\\", "/"))
    .normalize("NFC")
    .toLowerCase();
}

/**

@param file
*/
export function isForbiddenPath(file: string): boolean {
  const canonical = canonicalMatchPath(file);
  const forbiddenFiles = new Set(
    [...FORBIDDEN_FILES].map((entry) => canonicalMatchPath(entry)),
  );
  const forbiddenBasenames = new Set(
    [...FORBIDDEN_BASENAMES].map((entry) => entry.toLowerCase()),
  );
  const forbiddenDirectories = [...FORBIDDEN_DIRS].map((entry) =>
    canonicalMatchPath(entry),
  );
  return (
    FORBIDDEN_FILES.has(file) ||
    FORBIDDEN_BASENAMES.has(path.posix.basename(file)) ||
    forbiddenFiles.has(canonical) ||
    forbiddenBasenames.has(path.posix.basename(canonical)) ||
    forbiddenDirectories.some(
      (directory) =>
        canonical === directory || canonical.startsWith(`${directory}/`),
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
  return stagedChanges(repo).flatMap((change) =>
    change.paths.some((file) => isForbiddenPath(file)) ? change.paths : [],
  );
}

/**

* @param repo
* @param files
*/
function unStageFiles(repo: string, files: readonly string[]): void {
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
function unStageBannedPatternFiles(repo: string): void {
  const files = new Set<string>();
  const changes = stagedChanges(repo);
  const deletedPaths = changes.flatMap((change) =>
    change.status.startsWith("D") ? change.paths : [],
  );
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
  unStageFiles(
    repo,
    [...files].toSorted((left, right) => left.localeCompare(right)),
  );
}

/**

* @param repo
* @param files
*/
export function preferenceProblems(
  repo: string,
  files: readonly string[],
): string[] {
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
* @param timeoutMs
*/
export function runChecks(
  repo: string,
  checks: Record<string, string[]>,
  timeoutMs: number = PREFLIGHT_TIMEOUT_MS,
): string[] {
  const context: CheckContext = {
    repo,
    environment: gitSafeEnvironment(),
    timeoutMs,
  };
  const failures: string[] = [];
  for (const [name, command] of Object.entries(checks)) {
    const checkFailures =
      name === "size"
        ? runSizeChecks(context, name, command)
        : [runOneCheck(context, name, command)].filter(
            (failure): failure is string => failure !== undefined,
          );
    failures.push(...checkFailures);
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
  if (process.env["RALPH_LOOP"] === "1") {
    unStageFiles(repo, forbiddenPathsFromDiff(repo));
    unStageFiles(
      repo,
      stagedNames(repo)
        .filter((file) => isForbiddenPath(file))
        .toSorted((left, right) => left.localeCompare(right)),
    );
    unStageFiles(
      repo,
      stagedSymlinks(repo).toSorted((left, right) => left.localeCompare(right)),
    );
    unStageBannedPatternFiles(repo);
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
  // 0 = no per-check timeout: the full gate runs long browser/build/coverage checks.
  return runner(repo, FULL_CHECKS, 0);
}
