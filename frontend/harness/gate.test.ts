// Ports harness/tests/test_gate.py: preflight/gate checks and loop containment, plus the
// "gate shape" assertions that pin the frontend app bar (the role of test_gate's config checks).

import { afterEach, describe, expect, test } from "vitest";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMIT_CHECKS,
  FORBIDDEN_DIRS,
  FORBIDDEN_FILES,
  FORBIDDEN_PATTERNS,
  FULL_CHECKS,
  preferenceProblems,
  runChecks,
  runGate,
  runGit,
  runPreflight,
} from "./gate.ts";
import { makeRepo, runCommand, stageFile, stagedNames } from "./tmprepo.ts";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.join(FRONTEND, "..");
const noFailures = (): string[] => [];
const readFrontend = (relpath: string): string =>
  readFileSync(path.join(FRONTEND, relpath), "utf8");
const readRepo = (relpath: string): string =>
  readFileSync(path.join(REPO, relpath), "utf8");

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  Object.values(value).every((entry) => typeof entry === "string");

const readScripts = (): Record<string, string> => {
  const parsed: unknown = JSON.parse(readFrontend("package.json"));
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "scripts" in parsed &&
    isStringRecord(parsed.scripts)
  ) {
    return parsed.scripts;
  }
  throw new Error("package.json has no string scripts map");
};

afterEach(() => {
  delete process.env.RALPH_LOOP;
  delete process.env.GIT_DIR;
});

describe("runGit", () => {
  test("runs git in the repo and returns stdout", () => {
    const repo = makeRepo();
    stageFile(repo, "pkg/a.ts", "export const x = 1;\n");
    const names = runGit(repo, ["diff", "--cached", "--name-only"])
      .split("\n")
      .filter(Boolean);
    expect(names).toEqual(["pkg/a.ts"]);
  });

  test("ignores a poisoned GIT_DIR exported by a hook", () => {
    const repo = makeRepo();
    process.env.GIT_DIR = path.join(repo, "does-not-exist", ".git");
    stageFile(repo, "pkg/a.ts", "export const x = 1;\n");
    expect(stagedNames(repo)).toEqual(["pkg/a.ts"]);
  });

  test("throws when the git command fails", () => {
    const repo = makeRepo();
    const bogus = "deadbeef".repeat(5);
    expect(() => runGit(repo, ["cat-file", "-e", bogus])).toThrow();
  });
});

describe("runChecks", () => {
  test("reports only failing commands, named", () => {
    const failures = runChecks(makeRepo(), { boom: ["false"], fine: ["true"] });
    expect(failures).toHaveLength(1);
    expect(failures[0].startsWith("boom failed:")).toBe(true);
  });

  test("returns an empty list when everything passes", () => {
    expect(runChecks(makeRepo(), { ok: ["true"] })).toEqual([]);
  });
});

describe("gate constants", () => {
  test("forbidden collections pin the containment essentials", () => {
    for (const directory of [
      "harness",
      "frontend/harness",
      ".githooks",
      ".github",
    ]) {
      expect(FORBIDDEN_DIRS.has(directory)).toBe(true);
    }
    for (const file of [
      "pyproject.toml",
      "AGENTS.md",
      "frontend/package.json",
      "frontend/.markuplintrc.json",
      "frontend/.spectral.yml",
    ]) {
      expect(FORBIDDEN_FILES.has(file)).toBe(true);
    }
    for (const pattern of [
      "noqa",
      "eslint-disable",
      "ts-expect-error",
      "--no-verify",
      "hooksPath",
      "cov-fail-under",
    ]) {
      expect(FORBIDDEN_PATTERNS).toContain(pattern);
    }
  });

  test("checks use the public preflight and gate scripts", () => {
    expect(COMMIT_CHECKS.preflight).toEqual([
      "npm",
      "--prefix",
      "frontend",
      "run",
      "preflight",
    ]);
    expect(FULL_CHECKS.gate).toEqual([
      "npm",
      "--prefix",
      "frontend",
      "run",
      "gate",
    ]);
  });

  test("pre-commit stays fast and pre-push uses the full gate", () => {
    expect(Object.keys(COMMIT_CHECKS).toSorted()).toEqual(["preflight"]);
    expect(Object.keys(FULL_CHECKS)).toEqual(["gate"]);
    expect(Object.values(COMMIT_CHECKS).flat()).not.toContain("gate");
    expect(JSON.stringify(COMMIT_CHECKS)).not.toContain("semgrep");
    expect(JSON.stringify(COMMIT_CHECKS)).not.toContain("playwright");
  });
});

describe("runGate / runPreflight wiring", () => {
  test("runGate forwards FULL_CHECKS to the runner", () => {
    let seen: Record<string, string[]> | undefined;
    const failures = runGate(makeRepo(), (_repo, checks) => {
      seen = checks;
      return ["gate failed"];
    });
    expect(failures).toContain("gate failed");
    expect(seen).toBe(FULL_CHECKS);
  });

  test("runGate uses the real checks by default", () => {
    const result = runGate(makeRepo());
    expect(Array.isArray(result)).toBe(true);
  });

  test("without RALPH_LOOP, preflight just runs COMMIT_CHECKS", () => {
    let seen: Record<string, string[]> | undefined;
    const repo = makeRepo();
    stageFile(repo, "src/feature.ts", "export const y = 2;\n");
    const result = runPreflight(repo, (_repo, checks) => {
      seen = checks;
      return [];
    });
    expect(result).toEqual([]);
    expect(seen).toBe(COMMIT_CHECKS);
  });

  test("preflight surfaces a failing quality check", () => {
    const repo = makeRepo();
    stageFile(repo, "src/feature.ts", "export const y = 2;\n");
    const problems = runPreflight(repo, () => [
      "security failed:\nempty trust anchors",
    ]);
    const isSurfaced = problems.some((problem) =>
      problem.includes("security failed"),
    );
    expect(isSurfaced).toBe(true);
  });

  test("preflight uses the real checks by default", () => {
    const result = runPreflight(makeRepo());
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("loop containment", () => {
  test("rejects an empty commit", () => {
    process.env.RALPH_LOOP = "1";
    const problems = runPreflight(makeRepo(), noFailures);
    expect(problems).toContain("Empty commits are rejected. Stage real work.");
  });

  test("rejects a commit emptied by containment", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "pyproject.toml", "x = 1\n");
    const problems = runPreflight(repo, noFailures);
    expect(problems).toContain("Empty commits are rejected. Stage real work.");
    expect(stagedNames(repo)).not.toContain("pyproject.toml");
  });

  test("ejects a staged forbidden file but keeps legit work", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "frontend/package.json", '{ "x": 1 }\n');
    stageFile(repo, "src/feature.ts", "export const y = 2;\n");
    expect(runPreflight(repo, noFailures)).toEqual([]);
    expect(stagedNames(repo)).not.toContain("frontend/package.json");
    expect(stagedNames(repo)).toContain("src/feature.ts");
    const survived = readFileSync(
      path.join(repo, "frontend/package.json"),
      "utf8",
    );
    expect(survived).toContain('"x"'); // edit survives in the working tree
  });

  test.each([
    "harness/util.ts",
    "frontend/harness/x.ts",
    ".github/ci.yml",
    ".githooks/x",
  ])("ejects a staged file under forbidden dir %s", (target) => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, target, "value = 1\n");
    stageFile(repo, "src/feature.ts", "export const y = 2;\n");
    expect(runPreflight(repo, noFailures)).toEqual([]);
    expect(stagedNames(repo)).not.toContain(target);
    expect(stagedNames(repo)).toContain("src/feature.ts");
  });

  test("undoes a staged deletion of a forbidden file", () => {
    const repo = makeRepo();
    stageFile(repo, "pyproject.toml", "x = 1\n");
    runCommand(["git", "commit", "-q", "-m", "add pyproject"], repo);
    runCommand(["git", "rm", "-q", "pyproject.toml"], repo);
    stageFile(repo, "src/feature.ts", "export const y = 2;\n");
    process.env.RALPH_LOOP = "1";
    expect(runPreflight(repo, noFailures)).toEqual([]);
    expect(stagedNames(repo)).not.toContain("pyproject.toml");
    expect(stagedNames(repo)).toContain("src/feature.ts");
  });

  test("ejects multiple forbidden paths in one commit", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "pyproject.toml", "x = 1\n");
    stageFile(repo, "harness/util.ts", "export const value = 1;\n");
    stageFile(repo, "src/feature.ts", "export const y = 2;\n");
    expect(runPreflight(repo, noFailures)).toEqual([]);
    const staged = stagedNames(repo);
    expect(staged).not.toContain("pyproject.toml");
    expect(staged).not.toContain("harness/util.ts");
    expect(staged).toContain("src/feature.ts");
  });

  test("without the loop, a human may stage forbidden paths", () => {
    const repo = makeRepo();
    stageFile(repo, "harness/util.ts", "export const value = 1;\n");
    expect(runPreflight(repo, noFailures)).toEqual([]);
    expect(stagedNames(repo)).toContain("harness/util.ts");
  });

  test("an empty RALPH_LOOP value is treated as loop-off", () => {
    process.env.RALPH_LOOP = "";
    const repo = makeRepo();
    stageFile(repo, "harness/util.ts", "export const value = 1;\n");
    expect(runPreflight(repo, noFailures)).toEqual([]);
    expect(stagedNames(repo)).toContain("harness/util.ts"); // not ejected: containment stays off
  });

  test("checks staged .ts content when the worktree file is gone", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "src/gone.ts", "const _bad = 3;\n");
    runCommand(["rm", path.join(repo, "src/gone.ts")], repo);
    expect(preferenceProblems(repo, ["src/gone.ts"])).not.toEqual([]);
    const isFlagged = runPreflight(repo, noFailures).some((problem) =>
      problem.includes("'_bad'"),
    );
    expect(isFlagged).toBe(true);
  });

  test("skips staged deletions while checking sorted TypeScript paths", () => {
    const repo = makeRepo();
    stageFile(repo, "src/gone.ts", "export const gone = 1;\n");
    runCommand(["git", "commit", "-q", "-m", "add gone"], repo);
    stageFile(repo, "src/z.ts", "export const zed = 1;\n");
    runCommand(["git", "rm", "src/gone.ts"], repo);

    expect(
      preferenceProblems(repo, ["src/z.ts", "README.md", "src/gone.ts"]),
    ).toEqual([]);
  });

  test("checks clean staged content instead of dirty worktree content", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "src/mod.ts", "const good = 1;\n");
    writeFileSync(path.join(repo, "src/mod.ts"), "const _bad = 1;\n");
    expect(runPreflight(repo, noFailures)).toEqual([]);
  });

  test("ejects both sides of a rename when the destination is forbidden", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "src/feature.ts", "export const y = 2;\n");
    runCommand(["git", "commit", "-q", "-m", "add feature"], repo);
    mkdirSync(path.join(repo, "frontend/harness"), { recursive: true });
    runCommand(
      ["git", "mv", "src/feature.ts", "frontend/harness/feature.ts"],
      repo,
    );
    stageFile(repo, "src/keep.ts", "export const keep = 1;\n");
    expect(runPreflight(repo, noFailures)).toEqual([]);
    const staged = stagedNames(repo);
    expect(staged).not.toContain("src/feature.ts");
    expect(staged).not.toContain("frontend/harness/feature.ts");
    expect(staged).toContain("src/keep.ts");
  });

  test("does not run preferences on forbidden paths after dropping them", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "frontend/harness/x.ts", "const _bad = 1;\n");
    stageFile(repo, "src/keep.ts", "export const keep = 1;\n");
    expect(runPreflight(repo, noFailures)).toEqual([]);
    expect(stagedNames(repo)).toEqual(["src/keep.ts"]);
  });
});

describe("banned patterns and preferences under loop", () => {
  test.each(["noqa", "type: ignore", "--no-verify", "eslint-disable"])(
    "flags banned pattern %s",
    (pattern) => {
      process.env.RALPH_LOOP = "1";
      const repo = makeRepo();
      stageFile(repo, "src/x.ts", `export const value = 1; // ${pattern}\n`);
      const problems = runPreflight(repo, noFailures);
      const isFlagged = problems.some((problem) =>
        problem.includes(`banned pattern '${pattern}'`),
      );
      expect(isFlagged).toBe(true);
    },
  );

  test("matches banned patterns case-insensitively", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "src/x.ts", "export const value = 1; // NoQA\n");
    const isFlagged = runPreflight(repo, noFailures).some((problem) =>
      problem.includes("banned pattern 'noqa'"),
    );
    expect(isFlagged).toBe(true);
  });

  test("flags a staged preference break (underscore name)", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "src/mod.ts", "const _bad = 1;\n");
    const isFlagged = runPreflight(repo, noFailures).some((problem) =>
      problem.includes("'_bad'"),
    );
    expect(isFlagged).toBe(true);
  });
});

describe("frontend gate shape", () => {
  test("package.json gate runs every public stage in order", () => {
    const scripts = readScripts();
    const { gate } = scripts;
    expect(gate).toContain("cd .. && .venv/bin/harness gate");
    for (const stage of [
      "preflight",
      "typecheck",
      "lint",
      "security",
      "build",
      "TEST",
    ]) {
      expect(gate).toContain(stage);
      expect(Object.hasOwn(scripts, stage)).toBe(true);
    }
    expect(gate.indexOf("preflight")).toBeLessThan(gate.indexOf("lint"));
    expect(gate.indexOf("typecheck")).toBeLessThan(gate.indexOf("security"));
    expect(gate.indexOf("security")).toBeLessThan(gate.indexOf("TEST"));
  });

  test("public check groups cover the installed tools", () => {
    const scripts = readScripts();
    expect(scripts.typecheck).toContain("tsc");
    expect(scripts.typecheck).toContain("--noEmit");
    expect(scripts.preflight).toContain("npm run format");
    expect(scripts.preflight).toContain("eslint src harness");
    expect(scripts.security).toContain("semgrep scan");
    expect(scripts.security).toContain("--error");
    expect(scripts.security).toContain("secretlint");
    expect(scripts.security).toContain("npm audit");
    expect(scripts.security).toContain("lockfile-lint");
    expect(scripts.security).toContain("syncpack");
    expect(scripts.lint).toContain("eslint .");
    expect(scripts.lint).toContain("stylelint");
    expect(scripts.lint).toContain("markuplint");
    expect(scripts.lint).toContain("biome lint");
    expect(scripts.lint).toContain("ajv compile");
    expect(scripts.lint).toContain("node scripts/validate-json.mjs");
    expect(scripts.lint).toContain("npmPkgJsonLint");
    expect(scripts.lint).toContain("depcruise");
    expect(scripts.lint).toContain("knip");
    expect(scripts.lint).toContain("cspell");
    expect(scripts.lint).toContain("spectral lint");
    expect(scripts.format).toContain("prettier");
    expect(scripts.format).toContain("--check");
  });

  test("historical check helpers are folded into public groups", () => {
    const scripts = readScripts();
    const foldedChecks = [
      ["api:lint", scripts.lint, "spectral lint"],
      ["deps:audit", scripts.security, "npm audit --audit-level=high"],
      ["deps:lockfile", scripts.security, "lockfile-lint"],
      ["deps:signatures", scripts.security, "npm audit signatures"],
      ["deps:versions", scripts.security, "syncpack lint"],
      ["format:check", scripts.format, "prettier . --check"],
      ["json:biome", scripts.lint, "biome lint ."],
      ["json:lint", scripts.lint, "eslint . --max-warnings=0"],
      ["json:package", scripts.lint, "npmPkgJsonLint ."],
      ["json:schema", scripts.lint, "node scripts/validate-json.mjs"],
      ["json:schema:compile", scripts.lint, "ajv compile"],
      ["lint:arch", scripts.lint, "depcruise src"],
      ["lint:css", scripts.lint, "stylelint"],
      ["lint:dead", scripts.lint, "knip"],
      ["lint:html", scripts.lint, 'markuplint "**/*.html"'],
      ["lint:js", scripts.lint, "eslint . --max-warnings=0"],
      ["lint:js:preflight", scripts.preflight, "eslint src harness"],
      ["lint:spell", scripts.lint, "cspell ."],
      ["security:sast", scripts.security, "semgrep scan"],
      ["security:secrets", scripts.security, "secretlint"],
      ["test:coverage", scripts.TEST, "vitest run --coverage"],
      ["test:e2e", scripts.TEST, "playwright test"],
      ["test:harness", scripts.TEST, "harness/vitest.config.ts"],
      ["test:unit", scripts.test, "vitest run"],
    ] as const;

    for (const [oldScript, publicGroup, expectedCommand] of foldedChecks) {
      expect(publicGroup, `${oldScript} was dropped`).toContain(
        expectedCommand,
      );
    }
  });

  test("npm script menu stays small and professional", () => {
    const scripts = readScripts();
    expect(Object.keys(scripts).toSorted()).toEqual([
      "TEST",
      "build",
      "dev",
      "format",
      "gate",
      "lint",
      "preflight",
      "preview",
      "security",
      "setup:e2e",
      "test",
      "test:coverage",
      "test:e2e",
      "typecheck",
    ]);
    for (const hidden of [
      "gate:checks",
      "gate:python-harness",
      "harness:gate",
      "harness:preflight",
      "test:harness",
      "test:related",
    ]) {
      expect(Object.hasOwn(scripts, hidden)).toBe(false);
    }
    expect(scripts.gate).not.toContain("harness/cli.ts");
  });

  test("vitest coverage thresholds are all 100", () => {
    const config = readFrontend("vitest.config.js").replaceAll(/\s/gu, "");
    for (const metric of ["branches", "functions", "lines", "statements"]) {
      expect(config).toContain(`${metric}:100`);
    }
  });

  test("eslint enables the security plugin and bans explicit any", () => {
    const config = readFrontend("eslint.config.js");
    expect(config).toContain("eslint-plugin-security");
    expect(config).toContain("no-explicit-any");
  });

  test("GitHub CI runs Python checks before the frontend gate", () => {
    const ci = readRepo(".github/workflows/ci.yml");
    expect(ci).toContain("uv run --no-sync ruff check .");
    expect(ci).toContain("uv run --no-sync pyright");
    expect(ci).toContain("uv run --no-sync pytest --cov");
    expect(ci).toContain("npm --prefix frontend run gate");
  });

  test("frontend CI reference is clearly inactive and runs the full gate", () => {
    const ci = readFrontend("ci.yml");
    expect(ci).toContain("Reference copy only");
    expect(ci).toContain("npm run gate");
    expect(ci).not.toContain("npm run TEST");
    expect(ci).not.toContain("npm run test:harness");
  });

  test("git hooks are two simple entrypoints", () => {
    const hooks = readdirSync(path.join(REPO, ".githooks")).toSorted();
    expect(hooks).toEqual(["pre-commit", "pre-push"]);
    expect(readRepo(".githooks/pre-commit")).toContain(
      ".venv/bin/harness preflight",
    );
    expect(readRepo(".githooks/pre-push")).toContain(".venv/bin/harness gate");
  });

  test("pre-push and GitHub CI use the same local gate backstop", () => {
    const prePush = readRepo(".githooks/pre-push");
    const githubCi = readRepo(".github/workflows/ci.yml");
    const packageGate = readScripts().gate;
    expect(prePush).toContain(".venv/bin/harness gate");
    expect(githubCi).toContain("npm --prefix frontend run gate");
    expect(packageGate).toContain("cd .. && .venv/bin/harness gate");
    expect(packageGate).not.toContain("harness/cli.ts gate");
  });

  test("local gates and CI both load preference checks", () => {
    expect(readRepo("harness/gate.py")).toContain("preferences_violations");
    expect(readFrontend("harness/gate.ts")).toContain("preferencesViolations");
  });
});
