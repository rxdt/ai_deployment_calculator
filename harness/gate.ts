// JavaScript port of harness/gate.py.
//
// 1) runPreflight: fast pre-commit checks plus agent containment.
// 2) runGate: full pre-push gate; mirrors what runs on GitHub.

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import path from "node:path";

import {
  COMMIT_CHECKS,
  FORBIDDEN_BASENAMES,
  FORBIDDEN_DIRS,
  FORBIDDEN_FILES,
  FORBIDDEN_PATTERNS,
  FULL_CHECKS,
} from "./gate-data.js";
import { preferencesViolations } from "./preferences.js";

// Re-export the static data so consumers import everything gate-related from ./gate.js.
export {
  COMMIT_CHECKS,
  FORBIDDEN_BASENAMES,
  FORBIDDEN_DIRS,
  FORBIDDEN_FILES,
  FORBIDDEN_PATTERNS,
  FULL_CHECKS,
} from "./gate-data.js";

// Preflight fast checks must fail fast if they hang; the full gate has no timeout because its
// heavy checks (browser, build, coverage, networked audits) legitimately run for a long time.
const PREFLIGHT_TIMEOUT_MS = 30_000;

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
@param repo
@param args
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

// Per-run invariants shared by every check in a runChecks pass.
interface CheckContext {
  repo: string;
  environment: NodeJS.ProcessEnv;
  timeoutMs: number;
}

// A missing tool is a spawn ENOENT (error.code "ENOENT"). A young template must not fail a
// consumer who hasn't installed an external tool (semgrep/osv-scanner aren't npm) — so we SKIP
// the check, but warn LOUDLY on every run so ignoring it is the consumer's choice.
/**
@param result
@param binary
*/
function isToolMissing(
  result: SpawnSyncReturns<string>,
  binary: string,
): boolean {
  const code =
    result.error !== undefined && "code" in result.error
      ? result.error.code
      : undefined;
  if (code !== "ENOENT") {
    return false;
  }
  process.stderr.write(
    `\n⚠️  harness: SKIPPED — '${binary}' is not installed on this machine.\n` +
      `   install it to enable this check; it runs on every gate.\n\n`,
  );
  return true;
}

// Failure detail from a non-passing spawn; empty output falls back to the command. stdout/stderr
// are typed string but are undefined at runtime on ENOENT, so coalesce each.
/**
@param result
@param command
*/
function describeFailure(
  result: SpawnSyncReturns<string>,
  command: readonly string[],
): string {
  const error = result.error === undefined ? "" : String(result.error);
  const parts = [result.stdout, result.stderr, result.signal].map(
    (part) => part ?? "",
  );
  const output = `${parts.join("")}${error}`;
  return output.length > 0 ? output : command.join(" ");
}

/**
@param context
@param name
@param command
*/
function runOneCheck(
  context: CheckContext,
  name: string,
  command: readonly string[],
): string | undefined {
  const [executable, ...rest] = command;
  if (executable === undefined || executable.length === 0) {
    return `${name} failed:\nempty command`;
  }
  const result = spawnSync(executable, rest, {
    cwd: context.repo,
    encoding: "utf8",
    env: context.environment,
    // 0 => undefined => no timeout: the full gate must run long browser/build checks.
    timeout: context.timeoutMs > 0 ? context.timeoutMs : undefined,
  });
  if (isToolMissing(result, executable)) {
    return undefined;
  }
  if (
    result.status === 0 &&
    result.signal === null &&
    result.error === undefined
  ) {
    return undefined;
  }
  return `${name} failed:\n${describeFailure(result, command)}`;
}

/**
@param repo
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

// Match case-insensitively (both sides lowercased) so a case-insensitive filesystem (macOS:
// `Harness/gate.ts`) cannot slip a forbidden path past the FORBIDDEN_* sets.
/**
@param file
*/
export function isForbiddenPath(file: string): boolean {
  const lower = file.toLowerCase();
  const base = path.posix.basename(lower);
  return (
    [...FORBIDDEN_FILES].some((entry) => entry.toLowerCase() === lower) ||
    [...FORBIDDEN_BASENAMES].some((entry) => entry.toLowerCase() === base) ||
    [...FORBIDDEN_DIRS].some((entry) => {
      const directory = entry.toLowerCase();
      return lower === directory || lower.startsWith(`${directory}/`);
    })
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

// Forbidden patterns (eslint-disable, ts-ignore, .only(, …) are REPORTED, not unstaged: the file
// stays staged so the author sees exactly where the escape hatch is and must remove it themselves.
// A non-empty problem list fails preflight (and later the push), naming the pattern and its file.
/**
@param repo
@param change
*/
function bannedPatternProblems(repo: string, change: StagedChange): string[] {
  const file = change.paths.at(-1) ?? "";
  return stagedDiffAddedLines(repo, change.paths).flatMap((line) => {
    const lower = line.toLowerCase();
    return FORBIDDEN_PATTERNS.filter((pattern) =>
      lower.includes(pattern.toLowerCase()),
    ).map((pattern) => `forbidden pattern '${pattern}' in ${file}`);
  });
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
  return Object.entries(checks).flatMap(([name, command]) => {
    const failure = runOneCheck(context, name, command);
    return failure === undefined ? [] : [failure];
  });
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
    const changes = stagedChanges(repo);
    // Forbidden PATHS and symlinks are unstaged (kept out of the commit); forbidden PATTERNS are
    // only reported, so the author must remove the escape hatch before the commit/push can pass.
    const forbidden = new Set([
      ...changes.flatMap((change) =>
        change.paths.some((file) => isForbiddenPath(file)) ? change.paths : [],
      ),
      ...stagedSymlinks(repo),
    ]);
    if (forbidden.size > 0) {
      const files = [...forbidden].toSorted((a, b) => a.localeCompare(b));
      runGit(repo, ["reset", "-q", "HEAD", "--", ...files]);
      process.stderr.write(
        `harness kept forbidden paths out of the commit: ${files.join(", ")}\n`,
      );
    }
    problems.push(
      ...changes.flatMap((change) => bannedPatternProblems(repo, change)),
    );
    const staged = stagedNames(repo);
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
