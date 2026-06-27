// JavaScript port of harness/gate.py, pointed at the frontend app bar.
//
// 1) runPreflight: fast pre-commit checks (format/lint) plus agent containment.
// 2) runGate: full pre-push gate; mirrors `npm run gate`, the project's quality bar.

import { spawnSync } from "node:child_process";

import { preferencesViolations } from "./preferences.ts";

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
  "pyproject.toml",
  "uv.lock",
  // tooling/config that would weaken the JS gate's thresholds or its checks
  "frontend/package.json",
  "frontend/package-lock.json",
  "frontend/tsconfig.json",
  "frontend/tsconfig.app.json",
  "frontend/vitest.config.js",
  "frontend/eslint.config.js",
  "frontend/stylelint.config.js",
  "frontend/biome.json",
  "frontend/knip.json",
  "frontend/cspell.json",
  "frontend/.prettierrc.json",
  "frontend/.secretlintrc.json",
  "frontend/.dependency-cruiser.cjs",
  "frontend/playwright.config.js",
  "frontend/scripts/validate-json.mjs",
  "frontend/ci.yml",
]);

// Escape hatches that disable a check; matched case-insensitively on added lines.
export const FORBIDDEN_PATTERNS: readonly string[] = [
  "noqa",
  "type: ignore",
  "type:ignore",
  "pyright: ignore",
  "pragma: no cover",
  "eslint-disable",
  "stylelint-disable",
  "biome-ignore",
  "prettier-ignore",
  "ts-ignore",
  "ts-nocheck",
  "ts-expect-error",
  "v8 ignore",
  "istanbul ignore",
  "cspell:disable",
  "--no-verify",
  "hooksPath",
  "fail_under",
  "cov-fail-under",
];

function comparePath(left: string, right: string): number {
  return left.localeCompare(right);
}

/**
Build the command that runs a frontend npm script the way CI runs it, from the repo root.
@param script - The package.json script name.
@returns The argv array for spawnSync.
*/
function npmCheck(script: string): string[] {
  return ["npm", "--prefix", "frontend", "run", script];
}

// Fast checks every committer pays: the linter and the formatter.
export const COMMIT_CHECKS: Record<string, string[]> = {
  format: npmCheck("format:check"),
  lint: npmCheck("lint:js:preflight"),
};

// The full bar: a single `npm run gate` already supersets format/lint and adds types,
// JSON checks, security, build, and the 100%-coverage Vitest + Playwright suites.
export const FULL_CHECKS: Record<string, string[]> = {
  gate: npmCheck("gate"),
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
@param diffLines - Lines from `git diff --cached --unified=0`.
@returns One problem per banned pattern on an added line.
*/
function bannedPatternProblems(diffLines: string[]): string[] {
  const problems: string[] = [];
  for (const line of diffLines) {
    if (!line.startsWith("+") || line.startsWith("+++")) {
      continue;
    }
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (line.toLowerCase().includes(pattern.toLowerCase())) {
        problems.push(
          `banned pattern '${pattern}' in line: ${line.slice(1).trim()}`,
        );
      }
    }
  }
  return problems;
}

/**
Pre-commit: fast lint/format for everyone. Under RALPH_LOOP also drop forbidden staged paths
and flag banned patterns + human-preference breaks.
@param repo - The repo root.
@param runner - The check runner (injectable for tests).
@returns Every problem found; empty means the commit may proceed.
*/
export function runPreflight(
  repo: string,
  runner: typeof runChecks = runChecks,
): string[] {
  const problems: string[] = [];
  // RALPH_LOOP enables agent containment; an empty value counts as off (matches preferences.py).
  const isInLoop = (process.env.RALPH_LOOP ?? "") !== "";
  if (isInLoop) {
    let changes = stagedChanges(repo);
    const dropped = stagedPaths(
      changes.filter((change) => forbiddenPaths(change).length > 0),
    );
    if (dropped.length > 0) {
      runGit(repo, ["reset", "-q", "HEAD", "--", ...dropped]);
      process.stderr.write(
        `harness kept forbidden paths out of the commit: ${dropped.join(", ")}\n`,
      );
      // The reset changed the index; re-read the surviving staged paths.
      changes = stagedChanges(repo);
    }
    const stagedDiff = runGit(repo, ["diff", "--cached", "--unified=0"])
      .split("\n")
      .filter((line) => line.length > 0);
    problems.push(...bannedPatternProblems(stagedDiff));
    if (stagedDiff.length === 0) {
      problems.push("Empty commits are rejected. Stage real work.");
    }
    const staged = stagedPaths(changes);
    problems.push(...preferenceProblems(repo, staged));
  }
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
