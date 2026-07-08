// Ports harness/tests/test_gate.py: preflight/gate checks and loop containment, plus the
// "gate shape" assertions that pin the frontend app bar (the role of test_gate's config checks).

import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  COMMIT_CHECKS,
  FORBIDDEN_BASENAMES,
  FORBIDDEN_DIRS,
  FORBIDDEN_FILES,
  FORBIDDEN_PATTERNS,
  FULL_CHECKS,
  gitSafeEnvironment,
  isForbiddenPath,
  preferenceProblems,
  runChecks,
  runGate,
  runGit,
  runPreflight,
} from "./gate.js";
import { addRootScripts } from "./cli.js";

const HARNESS = import.meta.dirname;
const REPO = path.join(HARNESS, "..");
const readRepo = (relpath: string): string =>
  readFileSync(path.join(REPO, relpath), "utf8");
const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  Object.values(value).every((entry) => typeof entry === "string");
const readPackageScripts = (relpath: string): Record<string, string> => {
  const parsed: unknown = JSON.parse(readRepo(relpath));
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "scripts" in parsed &&
    isStringRecord(parsed.scripts)
  ) {
    return parsed.scripts;
  }
  throw new Error(`${relpath} has no string scripts map`);
};
const requiredForbiddenPattern = (pattern: string): string => {
  if (!(FORBIDDEN_PATTERNS as readonly string[]).includes(pattern)) {
    throw new Error(`${pattern} is not a forbidden pattern`);
  }
  return pattern;
};

// Harness-owned tools are invoked by bare name; the gate puts harness/node_modules/.bin on PATH.
const harnessTool = (name: string): string => name;
const commandText = (command: string[]): string => command.join(" ");
const withEmptyPath = <T>(callback: () => T): T => {
  const originalPath = process.env.PATH;
  process.env.PATH = mkdtempSync(
    path.join(tmpdir(), "missing-external-tool-path-"),
  );
  try {
    return callback();
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
  }
};
// POSIX single-quote escape: close the quote, emit an escaped quote, reopen. Declared outside the
// template below so it is not a nested template literal.
const escapedSingleQuote = String.raw`'\''`;
const shellQuote = (value: string): string => {
  const escaped = value.split("'").join(escapedSingleQuote);
  return `'${escaped}'`;
};
const checkToolNames = (checks: Record<string, string[]>): string[] =>
  Object.values(checks).map(([tool]) => {
    if (tool === undefined) {
      throw new Error("check command is empty");
    }
    return tool;
  });
const stubCheckTools = (
  repo: string,
  checks: Record<string, string[]>,
): string => {
  const bin = path.join(repo, "harness", "node_modules", ".bin");
  const log = path.join(repo, "stubbed-tools.log");
  mkdirSync(bin, { recursive: true });
  const uniqueTools = new Set(checkToolNames(checks));
  for (const tool of uniqueTools) {
    writeFileSync(
      path.join(bin, tool),
      `#!/bin/sh\nprintf '%s\\n' ${shellQuote(tool)} >> ${shellQuote(log)}\nexit 0\n`,
      { mode: 0o755 },
    );
  }
  return log;
};
const stubbedToolCalls = (log: string): string[] =>
  readFileSync(log, "utf8")
    .split("\n")
    .filter((line) => line.length > 0);
const writeHarnessCliWrapper = (repo: string): void => {
  const harnessDirectory = path.join(repo, "harness");
  const realHarnessUrl = pathToFileURL(path.join(HARNESS, "harness.mjs")).href;
  const realCliUrl = pathToFileURL(path.join(HARNESS, "cli.ts")).href;
  const runCli =
    `const { main } = await import(${JSON.stringify(realCliUrl)});` +
    "await main(process.argv.slice(1));";
  mkdirSync(harnessDirectory, { recursive: true });
  writeFileSync(
    path.join(harnessDirectory, "harness.mjs"),
    `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(${JSON.stringify(realHarnessUrl)});
const tsxLoader = require.resolve("tsx");
const child = spawn(process.execPath, [
  "--import",
  tsxLoader,
  "--eval",
  ${JSON.stringify(runCli)},
  "--",
  ...process.argv.slice(2),
], {
  cwd: process.cwd(),
  stdio: "inherit",
});

child.on("error", (error) => {
  process.stderr.write(\`harness: failed to launch JS CLI: \${error.message}\\n\`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal === null) {
    process.exitCode = code ?? 1;
    return;
  }
  process.kill(process.pid, signal);
});
`,
    { mode: 0o755 },
  );
};

/**

* @param argv
* @param cwd
*/
function runCommand(argv: string[], cwd: string): string {
  const [command, ...args] = argv;
  if (command === undefined) {
    throw new Error("missing command");
  }
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: gitSafeEnvironment(),
  });
  if (result.status !== 0) {
    throw new Error(`${argv.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

/**

*/
function makeRepo(): string {
  const repo = mkdtempSync(path.join(tmpdir(), "harness-"));
  runCommand(["git", "init", "-q"], repo);
  runCommand(["git", "config", "user.email", "harness@test.local"], repo);
  runCommand(["git", "config", "user.name", "harness-test"], repo);
  writeFileSync(path.join(repo, "README.md"), "seed\n");
  runCommand(["git", "add", "README.md"], repo);
  runCommand(["git", "commit", "-q", "-m", "seed"], repo);
  return repo;
}

/**

* @param repo
* @param relpath
* @param content
*/
function stageFile(repo: string, relpath: string, content: string): void {
  const target = path.join(repo, relpath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  runCommand(["git", "add", "--", relpath], repo);
}

/**

* @param repo
*/
function stagedNames(repo: string): string[] {
  return runGit(repo, ["diff", "--cached", "--name-only"])
    .split("\n")
    .filter((line) => line.length > 0);
}

interface FlatConfigBlock {
  files?: unknown;
  linterOptions?: Record<string, unknown>;
  rules?: Record<string, unknown>;
}

interface VitestConfig {
  test?: {
    coverage?: {
      include?: string[];
      thresholds?: Record<string, number>;
    };
  };
}

interface EslintResolvedConfig {
  linterOptions?: Record<string, unknown>;
  rules?: Record<string, unknown>;
}

interface PackageJson {
  name?: string;
  private?: boolean;
  scripts?: Record<string, string>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonObject = (relpath: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(readRepo(relpath));
  if (isPlainObject(parsed)) {
    return parsed;
  }
  throw new Error(`${relpath} is not a JSON object`);
};

const packageRoot = (
  relpath: string,
): {
  dependencies: Record<string, string> | undefined;
  devDependencies: Record<string, string> | undefined;
} => {
  const parsed = parseJsonObject(relpath);
  const { dependencies, devDependencies } = parsed;
  return {
    dependencies: isStringRecord(dependencies) ? dependencies : undefined,
    devDependencies: isStringRecord(devDependencies)
      ? devDependencies
      : undefined,
  };
};

const REQUIRED_INSTALLED_GATE_TOOLS: readonly {
  dependency: string;
  check: string;
  commandFragment?: string;
}[] = [
  {
    dependency: "prettier",
    check: "format",
    commandFragment: harnessTool("prettier"),
  },
  {
    dependency: "eslint",
    check: "eslint",
    commandFragment: harnessTool("eslint"),
  },
  {
    dependency: "stylelint",
    check: "style",
    commandFragment: harnessTool("stylelint"),
  },
  {
    dependency: "html-validate",
    check: "html",
    commandFragment: harnessTool("html-validate"),
  },
  {
    dependency: "typescript",
    check: "typecheck",
    commandFragment: harnessTool("tsc"),
  },
  {
    dependency: "markuplint",
    check: "markup",
    commandFragment: harnessTool("markuplint"),
  },
  {
    dependency: "ajv-cli",
    check: "schema",
    commandFragment: harnessTool("ajv"),
  },
  {
    dependency: "ajv-formats",
    check: "schema",
    commandFragment: "ajv-formats",
  },
  {
    dependency: "ajv-keywords",
    check: "schema",
    commandFragment: "ajv-keywords",
  },
  {
    dependency: "dependency-cruiser",
    check: "cruise",
    commandFragment: harnessTool("depcruise"),
  },
  {
    dependency: "knip",
    check: "deadcode",
    commandFragment: harnessTool("knip"),
  },
  {
    dependency: "cspell",
    check: "spelling",
    commandFragment: harnessTool("cspell"),
  },
  {
    dependency: "@stoplight/spectral-cli",
    check: "workflow",
    commandFragment: harnessTool("spectral"),
  },
  {
    dependency: "secretlint",
    check: "secrets",
    commandFragment: harnessTool("secretlint"),
  },
  {
    dependency: "vite",
    check: "build",
    commandFragment: "--dir frontend run build",
  },
  {
    dependency: "vitest",
    check: "coverage",
    commandFragment: harnessTool("vitest"),
  },
  {
    dependency: "@vitest/coverage-v8",
    check: "coverage",
    commandFragment: "--coverage",
  },
  {
    dependency: "@playwright/test",
    check: "e2e",
    commandFragment: harnessTool("playwright"),
  },
  {
    dependency: "@axe-core/playwright",
    check: "e2e",
    commandFragment: "harness/playwright.config.js",
  },
  {
    dependency: "@lhci/cli",
    check: "lighthouse",
    commandFragment: harnessTool("lhci"),
  },
  { dependency: "lighthouse", check: "lighthouse" },
];

const REQUIRED_CHECK_POLICIES: readonly {
  check: string;
  fragments: readonly string[];
}[] = [
  {
    check: "format",
    fragments: [
      harnessTool("prettier"),
      "frontend/",
      "harness/",
      "--check",
      "harness/.prettierignore",
      "--cache",
      ".cache_prettier",
    ],
  },
  {
    check: "eslint",
    fragments: [
      harnessTool("eslint"),
      ".",
      "harness/eslint.config.js",
      "--max-warnings=0",
    ],
  },
  {
    check: "style",
    fragments: [
      harnessTool("stylelint"),
      "frontend/**/*.css",
      "harness/stylelint.config.js",
      "--ignore-path",
      "harness/.stylelintignore",
      "--max-warnings=0",
      "--allow-empty-input",
    ],
  },
  {
    check: "html",
    fragments: [
      harnessTool("html-validate"),
      "harness/.htmlvalidate.json",
      "**/*.html",
    ],
  },
  {
    check: "typecheck",
    fragments: [
      harnessTool("tsc"),
      "harness/tsconfig.app.json",
      "--noEmit",
      "--incremental",
      ".cache_tsbuildinfo_app",
    ],
  },
  {
    check: "harnessTypes",
    fragments: [
      harnessTool("tsc"),
      "harness/tsconfig.harness.json",
      "--noEmit",
      "--incremental",
      ".cache_tsbuildinfo_harness",
    ],
  },
  {
    check: "markup",
    fragments: [harnessTool("markuplint"), "frontend/index.html"],
  },
  {
    check: "schema",
    fragments: [
      harnessTool("ajv"),
      "compile",
      "frontend/schemas/**/*.schema.json",
      "--strict=true",
      "ajv-formats",
      "ajv-keywords",
    ],
  },
  {
    check: "cruise",
    fragments: [
      harnessTool("depcruise"),
      "frontend/src",
      "harness/.dependency-cruiser.cjs",
      "err",
    ],
  },
  { check: "deadcode", fragments: [harnessTool("knip"), "harness/knip.json"] },
  {
    check: "spelling",
    fragments: [harnessTool("cspell"), ".", "harness/cspell.json"],
  },
  {
    check: "workflow",
    fragments: [
      harnessTool("spectral"),
      ".github/workflows/ci.yml",
      "harness/.spectral.yml",
      "--fail-severity=warn",
    ],
  },
  {
    check: "sast",
    fragments: [
      "semgrep",
      "scan",
      "p/typescript",
      "p/javascript",
      "p/security-audit",
      "--error",
    ],
  },
  {
    check: "secrets",
    fragments: [
      harnessTool("secretlint"),
      "**/*",
      "harness/.secretlintrc.json",
    ],
  },
  {
    check: "audit",
    fragments: ["pnpm", "--dir", "frontend", "audit", "--audit-level", "high"],
  },
  // Disabled with the osv check (see FULL_CHECKS in gate-data.ts):
  // {
  //   check: "osv",
  //   fragments: [
  //     "osv-scanner",
  //     "scan",
  //     "source",
  //     "--lockfile=frontend/pnpm-lock.yaml",
  //     "--lockfile=harness/pnpm-lock.yaml",
  //   ],
  // },
  {
    check: "build",
    fragments: ["pnpm", "--dir", "frontend", "run", "build"],
  },
  {
    check: "coverage",
    fragments: [
      harnessTool("vitest"),
      "harness/vitest.config.js",
      "--cache",
      "--coverage",
    ],
  },
  {
    check: "e2e",
    fragments: [
      harnessTool("playwright"),
      "test",
      "harness/playwright.config.js",
    ],
  },
  {
    check: "lighthouse",
    fragments: [harnessTool("lhci"), "autorun", "harness/lighthouserc.cjs"],
  },
];

const COMMIT_POLICY_CHECKS = new Set(["format", "eslint", "style", "html"]);

const pickChecks = (
  checks: Record<string, string[]>,
  names: readonly string[],
): Record<string, string[]> => {
  const picked: Record<string, string[]> = {};
  for (const name of names) {
    const command = checks[name];
    if (command === undefined) {
      throw new Error(`missing check ${name}`);
    }
    picked[name] = command;
  }
  return picked;
};

const checkCommand = (
  checks: Record<string, string[]>,
  name: string,
): string[] => {
  const command = checks[name];
  if (command === undefined) {
    throw new Error(`missing check ${name}`);
  }
  return command;
};

const failureFor = (failures: string[], name: string): string => {
  const failure = failures.find((entry) => entry.startsWith(`${name} failed:`));
  if (failure === undefined) {
    throw new Error(`${name} did not fail. Failures:\n${failures.join("\n")}`);
  }
  return failure;
};

const parsePackageJson = (contents: string): PackageJson => {
  const parsed: unknown = JSON.parse(contents);
  if (isPlainObject(parsed)) {
    return parsed;
  }
  throw new Error("package.json is not a JSON object");
};

const readPackageJsonInRepo = (repo: string): PackageJson =>
  parsePackageJson(readFileSync(path.join(repo, "package.json"), "utf8"));

const readHarnessPackageJsonInRepo = (repo: string): PackageJson =>
  parsePackageJson(
    readFileSync(path.join(repo, "harness", "package.json"), "utf8"),
  );

const makeInstallRepo = (scripts: Record<string, string>): string => {
  const repo = makeRepo();
  writeFileSync(
    path.join(repo, "package.json"),
    `${JSON.stringify(
      { name: "setup-target", private: true, scripts },
      null,
      2,
    )}\n`,
  );
  mkdirSync(path.join(repo, "frontend/node_modules"), { recursive: true });
  mkdirSync(path.join(repo, "harness/node_modules"), { recursive: true });
  // setup runs one workspace-aware `pnpm install` at the root; give the temp repo a workspace
  // manifest + dependency-free member manifests so that install is a trivial no-op offline.
  writeFileSync(
    path.join(repo, "pnpm-workspace.yaml"),
    "packages:\n  - frontend\n  - harness\n",
  );
  writeFileSync(
    path.join(repo, "frontend", "package.json"),
    `${JSON.stringify({ name: "setup-target-frontend", private: true }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(repo, "harness", "package.json"),
    `${JSON.stringify(
      {
        name: "setup-target-harness",
        private: true,
        type: "module",
        scripts: readPackageScripts("harness/package.json"),
      },
      null,
      2,
    )}\n`,
  );
  return repo;
};

const makePackageRootsRepo = (): string => {
  const repo = makeRepo();
  stageFile(repo, "frontend/package.json", '{"private":true}\n');
  stageFile(repo, "harness/package.json", '{"private":true}\n');
  return repo;
};

const importedEslintConfig = (): FlatConfigBlock[] => {
  const url = pathToFileURL(path.join(HARNESS, "eslint.config.js")).href;
  const output = runCommand(
    [
      process.execPath,
      "--input-type=module",
      "-e",
      `const module = await import(${JSON.stringify(url)});
const blocks = module.default.map(({ files, linterOptions, rules }) => ({ files, linterOptions, rules }));
console.log(JSON.stringify(blocks));`,
    ],
    REPO,
  );
  const parsed: unknown = JSON.parse(output);
  if (Array.isArray(parsed) && parsed.every((block) => isPlainObject(block))) {
    return parsed;
  }
  throw new Error("eslint config is not an array of objects");
};

const importedVitestConfig = (): VitestConfig => {
  const url = pathToFileURL(path.join(HARNESS, "vitest.config.js")).href;
  const output = runCommand(
    [
      process.execPath,
      "--input-type=module",
      "-e",
      `const module = await import(${JSON.stringify(url)});
console.log(JSON.stringify(module.default));`,
    ],
    REPO,
  );
  const parsed: unknown = JSON.parse(output);
  if (isPlainObject(parsed)) {
    return parsed;
  }
  throw new Error("vitest config is not a JSON object");
};

const resolvedEslintConfig = (): EslintResolvedConfig => {
  // This test spawns ESLint directly (not through the gate), so it needs the real binary path,
  // not the bare name the gate resolves via its PATH-prepended checkEnvironment.
  const output = runCommand(
    [
      "harness/node_modules/.bin/eslint",
      "--print-config",
      "sample.ts",
      "--config",
      "harness/eslint.config.js",
    ],
    REPO,
  );
  const parsed: unknown = JSON.parse(output);
  if (isPlainObject(parsed)) {
    return parsed;
  }
  throw new Error("resolved eslint config is not a JSON object");
};

afterEach(() => {
  vi.restoreAllMocks();
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
    expect(failures[0]).toMatch(/^boom failed:/u);
  });

  test("returns an empty list when everything passes", () => {
    expect(runChecks(makeRepo(), { ok: ["true"] })).toEqual([]);
  });

  test("runs checks from the repo root", () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo, "cwd-marker.txt"), "ok\n");
    const failures = runChecks(repo, {
      cwd: [
        process.execPath,
        "-e",
        "if (!require('node:fs').existsSync('cwd-marker.txt')) process.exit(7)",
      ],
    });
    expect(failures).toEqual([]);
  });

  test("strips GIT variables from spawned checks", () => {
    process.env.GIT_DIR = path.join(makeRepo(), "poisoned.git");
    const failures = runChecks(makeRepo(), {
      env: [
        process.execPath,
        "-e",
        "if (Object.keys(process.env).some((key) => key.startsWith('GIT_'))) process.exit(8)",
      ],
    });
    expect(failures).toEqual([]);
  });

  test("strips NODE_OPTIONS code-injection from spawned checks (F3)", () => {
    process.env.NODE_OPTIONS = "--require ./evil.js";
    try {
      const failures = runChecks(makeRepo(), {
        env: [
          process.execPath,
          "-e",
          "if (process.env['NODE_OPTIONS'] !== undefined) process.exit(8)",
        ],
      });
      expect(failures).toEqual([]);
    } finally {
      delete process.env.NODE_OPTIONS;
    }
  });

  test("includes stdout and stderr from a failing check", () => {
    const failures = runChecks(makeRepo(), {
      noisy: [
        process.execPath,
        "-e",
        "process.stdout.write('visible stdout'); process.stderr.write('visible stderr'); process.exit(9)",
      ],
    });
    expect(failures).toEqual(["noisy failed:\nvisible stdoutvisible stderr"]);
  });

  test("continues after a failed check and preserves failure order", () => {
    const failures = runChecks(makeRepo(), {
      first: [
        process.execPath,
        "-e",
        "process.stderr.write('first'); process.exit(2)",
      ],
      passing: [process.execPath, "-e", "process.exit(0)"],
      second: [
        process.execPath,
        "-e",
        "process.stderr.write('second'); process.exit(3)",
      ],
    });
    expect(failures.map((failure) => failure.split(" failed:", 1)[0])).toEqual([
      "first",
      "second",
    ]);
    expect(failures.join("\n")).toContain("first");
    expect(failures.join("\n")).toContain("second");
  });

  test("runs argv directly without shell expansion", () => {
    const failures = runChecks(makeRepo(), {
      literal: [
        process.execPath,
        "-e",
        "if (process.argv[1] !== '$HOME' || process.argv[2] !== '*.ts') process.exit(4)",
        "$HOME",
        "*.ts",
      ],
    });
    expect(failures).toEqual([]);
  });

  test("reports signal-terminated checks as failures", () => {
    const failures = runChecks(makeRepo(), {
      signal: [
        process.execPath,
        "-e",
        "process.stderr.write('terminating'); process.kill(process.pid, 'SIGTERM')",
      ],
    });
    const failure = failureFor(failures, "signal");
    expect(failure).toContain("terminating");
    expect(failure).toContain("SIGTERM");
  });

  test("times out a hung check instead of waiting for normal completion", () => {
    const started = Date.now();
    // Drive the timeout mechanism with an explicit small bound so the test stays fast and does not
    // depend on the tuned production default (PREFLIGHT_TIMEOUT_MS).
    const failures = runChecks(
      makeRepo(),
      {
        slow: [
          process.execPath,
          "-e",
          "setTimeout(() => process.exit(0), 20000)",
        ],
      },
      2000,
    );
    expect(Date.now() - started).toBeLessThan(12_000);
    expect(failureFor(failures, "slow")).toContain("ETIMEDOUT");
  }, 15_000);

  test("fails closed for malformed empty argv", () => {
    let failures: string[] = [];
    expect(() => {
      failures = runChecks(makeRepo(), { empty: [] });
    }).not.toThrow();
    expect(failureFor(failures, "empty").toLowerCase()).toContain("empty");
  });

  test("skips a missing binary (ENOENT) instead of failing, and warns loudly", () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    const failures = runChecks(makeRepo(), {
      missing: ["definitely-not-a-real-gate-binary"],
    });
    // A young template must not fail a consumer who hasn't installed an external tool: the check
    // is skipped (no problem), but the skip is announced loudly so it can never pass silently.
    expect(failures).toEqual([]);
    const warning = stderr.join("");
    expect(warning).toContain("SKIPPED");
    expect(warning).toContain("definitely-not-a-real-gate-binary");
  });

  test("skips a missing harness tool (ENOENT) regardless of staged packages", () => {
    const repo = makeRepo();
    stageFile(repo, "harness/package.json", '{"private":true}\n');
    const failures = runChecks(repo, {
      harnessToolCheck: [harnessTool("definitely-missing")],
    });
    expect(failures).toEqual([]);
  });

  test("fails closed when a present tool exits non-zero (not ENOENT)", () => {
    const failures = runChecks(makeRepo(), {
      failing: [process.execPath, "-e", "process.exit(7)"],
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^failing failed:/u);
    expect(failures[0]).not.toContain("undefinedundefined");
  });

  test.each(["semgrep", "osv-scanner"])(
    "skips external gate tool %s when it is not installed (ENOENT)",
    (tool) => {
      const repo = makeRepo();
      const failures = withEmptyPath(() =>
        runChecks(repo, {
          external: [tool, "--version"],
        }),
      );
      expect(failures).toEqual([]);
    },
  );
});

describe("spelling check", () => {
  // Spelling is advisory (`--no-exit-code`): running cspell exactly as the gate's `spelling` check
  // does must NOT error, but must still WARN. This repo has real unknown words, so cspell reports
  // them yet exits 0. Spawns cspell directly with the real binary path (the gate resolves the bare
  // name via its PATH-prepended checkEnvironment, which this direct spawn does not set up).
  test("cspell warns about unknown words but does not fail the gate", () => {
    const [, ...args] = checkCommand(FULL_CHECKS, "spelling");
    const result = spawnSync("harness/node_modules/.bin/cspell", args, {
      cwd: REPO,
      encoding: "utf8",
      env: gitSafeEnvironment(),
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Unknown word");
  });
});

describe("gate constants", () => {
  test("forbidden collections pin the containment essentials", () => {
    expect([...FORBIDDEN_DIRS].toSorted((a, b) => a.localeCompare(b))).toEqual([
      ".githooks",
      ".github",
      "frontend/harness",
      "harness",
    ]);
    // Assert properties, not a duplicated copy of the source Set (a second hardcoded list
    // silently drifts). The hand-picked essentials that are NOT derivable from another source:
    expect([...FORBIDDEN_FILES]).toEqual(
      expect.arrayContaining([
        "AGENTS.md",
        "PROMPT.md",
        "docs/plan.md",
        "pyproject.toml",
        "package.json",
        "pnpm-lock.yaml",
        "frontend/package.json",
        "frontend/pnpm-lock.yaml",
        "frontend/tsconfig.json",
        "harness/preferences.ts",
        "harness/package.json",
        "harness/eslint.config.js",
        "harness/tsconfig.app.json",
      ]),
    );
    // A package.json anywhere is forbidden by basename.
    expect(FORBIDDEN_BASENAMES.has("package.json")).toBe(true);
    expect(FORBIDDEN_PATTERNS).toEqual(
      expect.arrayContaining([
        "eslint-disable",
        "ts-expect-error",
        "--no-verify",
        "skipLibCheck",
        "coverage=false",
        "lighthouse:skip",
      ]),
    );
  });

  test("commit checks are a strict fast subset of full checks", () => {
    expect(new Set(Object.keys(COMMIT_CHECKS))).toEqual(COMMIT_POLICY_CHECKS);
    for (const [name, command] of Object.entries(COMMIT_CHECKS)) {
      expect(checkCommand(FULL_CHECKS, name)).toBe(command);
    }
    expect(Object.keys(FULL_CHECKS).length).toBeGreaterThan(
      Object.keys(COMMIT_CHECKS).length,
    );
  });

  test.each(REQUIRED_CHECK_POLICIES)(
    "full gate includes %s with required scope and policy flags",
    ({ check, fragments }) => {
      const command = checkCommand(FULL_CHECKS, check);
      const text = commandText(command);
      for (const fragment of fragments) {
        expect(text, `${check} missing ${fragment}`).toContain(fragment);
      }
    },
  );

  test("full gate has no unclassified checks", () => {
    const classified = new Set(
      REQUIRED_CHECK_POLICIES.map(({ check }) => check),
    );
    expect(
      Object.keys(FULL_CHECKS).filter((check) => !classified.has(check)),
    ).toEqual([]);
  });

  test("commit checks do not include slow gate-only tools", () => {
    const text = JSON.stringify(COMMIT_CHECKS);
    expect(text).not.toContain("semgrep");
    expect(text).not.toContain("playwright");
    expect(text).not.toContain("vitest");
    expect(Object.values(COMMIT_CHECKS).flat()).not.toContain("gate");
  });

  test("every harness config path referenced by checks exists", () => {
    const configPaths = [
      "harness/.dependency-cruiser.cjs",
      "harness/.htmlvalidate.json",
      "harness/.prettierignore",
      "harness/.secretlintrc.json",
      "harness/.spectral.yml",
      "harness/cspell.json",
      "harness/eslint.config.js",
      "harness/knip.json",
      "harness/lighthouserc.cjs",
      "harness/playwright.config.js",
      "harness/stylelint.config.js",
      "harness/vitest.config.js",
    ];
    expect(
      configPaths.every((target) => existsSync(path.join(REPO, target))),
    ).toBe(true);
  });

  test("stylelint ignores generated css at any repo depth", () => {
    const configText = readRepo("harness/stylelint.config.js");
    expect(configText).toContain('"../**/coverage/**"');
    expect(configText).toContain('"../**/dist/**"');
    expect(configText).toContain('"../**/build/**"');
    expect(configText).toContain('"../**/.next/**"');
    expect(configText).toContain('"../**/node_modules/**"');
    expect(configText).toContain('"../**/scratchpad/**"');
  });

  test("typecheck gate uses harness-owned app tsconfig only", () => {
    const command = checkCommand(FULL_CHECKS, "typecheck");
    expect(command).toContain("harness/tsconfig.app.json");
    expect(command).toContain("--noEmit");
    expect(command).not.toContain("frontend/tsconfig.json");
    expect(FORBIDDEN_FILES.has("frontend/tsconfig.json")).toBe(true);
    expect(FORBIDDEN_FILES.has("harness/tsconfig.app.json")).toBe(true);
  });

  test("installed gate tooling has a concrete full-gate policy owner", () => {
    const { devDependencies } = packageRoot("harness/package.json");
    if (devDependencies === undefined) {
      throw new Error("harness/package.json has no devDependencies");
    }
    for (const {
      dependency,
      check,
      commandFragment,
    } of REQUIRED_INSTALLED_GATE_TOOLS) {
      expect(Object.hasOwn(devDependencies, dependency), dependency).toBe(true);
      expect(
        checkCommand(FULL_CHECKS, check),
        `${dependency} has no ${check} check`,
      ).toBeDefined();
      if (commandFragment !== undefined) {
        expect(
          commandText(checkCommand(FULL_CHECKS, check)),
          dependency,
        ).toContain(commandFragment);
      }
    }
  });
});

describe("runGate / runPreflight wiring", () => {
  test("runGate forwards FULL_CHECKS to the runner", () => {
    const repo = makeRepo();
    let seen: Record<string, string[]> | undefined;
    let seenRepo: string | undefined;
    const failures = runGate(repo, (runnerRepo, checks) => {
      seenRepo = runnerRepo;
      seen = checks;
      return ["gate failed"];
    });
    expect(failures).toContain("gate failed");
    expect(seenRepo).toBe(repo);
    expect(seen).toBe(FULL_CHECKS);
  });

  test("without RALPH_LOOP, preflight runs commit checks without containment", () => {
    let seen: Record<string, string[]> | undefined;
    const repo = makeRepo();
    stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
    let seenRepo: string | undefined;
    const result = runPreflight(repo, (runnerRepo, checks) => {
      seenRepo = runnerRepo;
      seen = checks;
      return [];
    });
    expect(result).toEqual([]);
    expect(seenRepo).toBe(repo);
    expect(seen).toBe(COMMIT_CHECKS);
  });

  test("preflight surfaces a failing quality check", () => {
    const repo = makeRepo();
    stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
    const problems = runPreflight(repo, () => [
      "security failed:\nempty trust anchors",
    ]);
    const isSurfaced = problems.some((problem) =>
      problem.includes("security failed"),
    );
    expect(isSurfaced).toBe(true);
  });

  test("runGate defaults to the configured full-check tools", () => {
    const repo = makeRepo();
    const log = stubCheckTools(repo, FULL_CHECKS);
    stageFile(repo, "frontend/package.json", '{"private":true}\n');
    stageFile(repo, "harness/package.json", '{"private":true}\n');
    expect(runGate(repo)).toEqual([]);
    expect(stubbedToolCalls(log)).toEqual(checkToolNames(FULL_CHECKS));
  });

  test("runPreflight defaults to the configured commit-check tools", () => {
    const repo = makeRepo();
    const log = stubCheckTools(repo, COMMIT_CHECKS);
    stageFile(repo, "harness/package.json", '{"private":true}\n');
    expect(runPreflight(repo)).toEqual([]);
    expect(stubbedToolCalls(log)).toEqual(checkToolNames(COMMIT_CHECKS));
  });

  test("gate resolves the repo-local harness bin when PATH is unset", () => {
    // Not just an empty PATH dir — PATH entirely unset must still coalesce to "" and resolve the
    // repo-local harness bin.
    const repo = makeRepo();
    const log = stubCheckTools(repo, FULL_CHECKS);
    const originalPath = process.env.PATH;
    delete process.env.PATH;
    try {
      expect(runGate(repo)).toEqual([]);
    } finally {
      if (originalPath !== undefined) process.env.PATH = originalPath;
    }
    expect(stubbedToolCalls(log)).toEqual(checkToolNames(FULL_CHECKS));
  });

  test("preflight runs commit checks while gate runs full checks", () => {
    let preflightChecks: Record<string, string[]> | undefined;
    let gateChecks: Record<string, string[]> | undefined;
    const preflightRepo = makeRepo();
    const gateRepo = makeRepo();
    let seenPreflightRepo: string | undefined;
    let seenGateRepo: string | undefined;

    expect(
      runPreflight(preflightRepo, (runnerRepo, checks) => {
        seenPreflightRepo = runnerRepo;
        preflightChecks = checks;
        return [];
      }),
    ).toEqual([]);
    expect(
      runGate(gateRepo, (runnerRepo, checks) => {
        seenGateRepo = runnerRepo;
        gateChecks = checks;
        return [];
      }),
    ).toEqual([]);
    expect(seenPreflightRepo).toBe(preflightRepo);
    expect(seenGateRepo).toBe(gateRepo);

    expect(preflightChecks).toBe(COMMIT_CHECKS);
    expect(gateChecks).toBe(FULL_CHECKS);
    for (const check of ["typecheck", "coverage", "e2e", "sast"]) {
      expect(preflightChecks?.[check]).toBeUndefined();
      expect(gateChecks?.[check]).toBe(FULL_CHECKS[check]);
    }
  });
});

describe("loop containment", () => {
  test("rejects an empty commit", () => {
    process.env.RALPH_LOOP = "1";
    const problems = runPreflight(makeRepo(), () => []);
    expect(problems).toContain("Empty commits are rejected. Stage real work.");
  });

  test("rejects a commit emptied by containment", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "pyproject.toml", "x = 1\n");
    const problems = runPreflight(repo, () => []);
    expect(problems).toContain("Empty commits are rejected. Stage real work.");
    expect(stagedNames(repo)).not.toContain("pyproject.toml");
  });

  test("ejects a staged forbidden file but keeps legit work", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(
      repo,
      "frontend/package.json",
      '{ "scripts": { "preflight": "true" } }\n',
    );
    stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).not.toContain("frontend/package.json");
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
    const survived = readFileSync(
      path.join(repo, "frontend/package.json"),
      "utf8",
    );
    expect(survived).toContain('"preflight"'); // edit survives in the working tree
  });

  test.each([
    "harness/gate.ts", // baseline, exact
    "Harness/gate.ts", // macOS case-fold on the dir
    "HARNESS/gate.ts",
    "harness/Gate.ts", // case-fold on the file
    "harness/./gate.ts", // redundant ./ segment
    "harness/../harness/gate.ts", // normalizes back into harness/
    "Harness/package.json", // case-folded forbidden basename
  ])("isForbiddenPath resists case/normalization bypass: %s", (variant) => {
    expect(isForbiddenPath(variant)).toBe(true);
  });

  test.each([
    "frontend/src/report.ts",
    "frontend/src/harnessed.ts", // 'harness' as a substring, not a dir
    "docs/harness-notes.md",
  ])("isForbiddenPath does not over-match legit path: %s", (allowed) => {
    expect(isForbiddenPath(allowed)).toBe(false);
  });

  test.each([
    "harness/package.json",
    "harness/gate.ts",
    "harness/harness.mjs",
    "harness/vitest.config.js",
  ])("ejects a staged file under forbidden dir %s", (target) => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, target, "value = 1\n");
    stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).not.toContain(target);
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
  });

  test.each([...FORBIDDEN_DIRS])(
    "ejects any staged file inside forbidden directory %s",
    (directory) => {
      process.env.RALPH_LOOP = "1";
      const repo = makeRepo();
      const target = `${directory}/agent-owned-change.txt`;
      stageFile(repo, target, "agent edit\n");
      stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
      expect(runPreflight(repo, () => [])).toEqual([]);
      expect(stagedNames(repo)).not.toContain(target);
      expect(stagedNames(repo)).toContain("frontend/src/report.ts");
    },
  );

  test.each([...FORBIDDEN_DIRS])(
    "ejects config-like files under forbidden directory %s by directory rule",
    (directory) => {
      process.env.RALPH_LOOP = "1";
      const repo = makeRepo();
      const targets = [
        `${directory}/config.py`,
        `${directory}/nested/tsconfig.json`,
        `${directory}/nested/eslint.config.js`,
      ];
      for (const target of targets) stageFile(repo, target, "strict = false\n");
      stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
      expect(runPreflight(repo, () => [])).toEqual([]);
      expect(stagedNames(repo)).toEqual(["frontend/src/report.ts"]);
    },
  );

  test("ejects a generated mix of forbidden files and nested forbidden-dir paths", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    const directories = [...FORBIDDEN_DIRS].toSorted((a, b) =>
      a.localeCompare(b),
    );
    const files = [...FORBIDDEN_FILES].toSorted((a, b) => a.localeCompare(b));
    const generated = [
      ...files.map((target, index) => ({
        target,
        content: `file-${String(index)}\n`,
      })),
      ...Array.from(Array.from({ length: 40 }).keys(), (index) => {
        const directory = directories[(index * 7) % directories.length] ?? "";
        return {
          target: `${directory}/generated-${String(index)}/config-${String(index % 5)}.json`,
          content: JSON.stringify({ strict: false, index }),
        };
      }),
    ];
    for (const { target, content } of generated)
      stageFile(repo, target, content);
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).toEqual(["frontend/src/report.ts"]);
  });

  test("ejects both sides of a copied change when the source is forbidden", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "harness/gate.ts", "export const locked = 1;\n");
    runCommand(["git", "commit", "-q", "-m", "add locked harness file"], repo);
    mkdirSync(path.join(repo, "frontend/src"), { recursive: true });
    copyFileSync(
      path.join(repo, "harness/gate.ts"),
      path.join(repo, "frontend/src/copied.ts"),
    );
    runCommand(["git", "add", "--", "frontend/src/copied.ts"], repo);
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).toEqual(["frontend/src/report.ts"]);
  });

  test.each([...FORBIDDEN_FILES])(
    "ejects exact forbidden file %s",
    (target) => {
      process.env.RALPH_LOOP = "1";
      const repo = makeRepo();
      stageFile(repo, target, "agent edit\n");
      stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
      expect(runPreflight(repo, () => [])).toEqual([]);
      expect(stagedNames(repo)).not.toContain(target);
      expect(stagedNames(repo)).toContain("frontend/src/report.ts");
    },
  );

  test("ejects a reintroduced frontend tsconfig override", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(
      repo,
      "frontend/tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: false }, include: ["src"] }),
    );
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).toEqual(["frontend/src/report.ts"]);
  });

  test("undoes a staged deletion of a forbidden file", () => {
    const repo = makeRepo();
    stageFile(repo, "pyproject.toml", "x = 1\n");
    runCommand(["git", "commit", "-q", "-m", "add pyproject"], repo);
    runCommand(["git", "rm", "-q", "pyproject.toml"], repo);
    stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
    process.env.RALPH_LOOP = "1";
    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).not.toContain("pyproject.toml");
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
  });

  test("ejects multiple forbidden paths in one commit", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "pyproject.toml", "x = 1\n");
    stageFile(repo, "harness/gate.ts", "export const value = 1;\n");
    stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
    expect(runPreflight(repo, () => [])).toEqual([]);
    const staged = stagedNames(repo);
    expect(staged).not.toContain("pyproject.toml");
    expect(staged).not.toContain("harness/gate.ts");
    expect(staged).toContain("frontend/src/report.ts");
  });
});

describe("loop containment (continued)", () => {
  test("without the loop, a human may stage forbidden paths", () => {
    const repo = makeRepo();
    stageFile(repo, "harness/gate.ts", "export const value = 1;\n");
    stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).toContain("harness/gate.ts");
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
  });

  test("only loop preflight unstages forbidden paths", () => {
    process.env.RALPH_LOOP = "1";
    const gateRepo = makeRepo();
    stageFile(gateRepo, "harness/gate.ts", "export const value = 1;\n");
    stageFile(gateRepo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runGate(gateRepo, () => [])).toEqual([]);
    expect(stagedNames(gateRepo)).toContain("harness/gate.ts");
    expect(stagedNames(gateRepo)).toContain("frontend/src/report.ts");

    delete process.env.RALPH_LOOP;
    const humanRepo = makeRepo();
    stageFile(humanRepo, "harness/gate.ts", "export const value = 1;\n");
    stageFile(humanRepo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runPreflight(humanRepo, () => [])).toEqual([]);
    expect(stagedNames(humanRepo)).toContain("harness/gate.ts");
    expect(stagedNames(humanRepo)).toContain("frontend/src/report.ts");

    process.env.RALPH_LOOP = "1";
    const loopRepo = makeRepo();
    stageFile(loopRepo, "harness/gate.ts", "export const value = 1;\n");
    stageFile(loopRepo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runPreflight(loopRepo, () => [])).toEqual([]);
    expect(stagedNames(loopRepo)).not.toContain("harness/gate.ts");
    expect(stagedNames(loopRepo)).toContain("frontend/src/report.ts");
  });

  test("an empty RALPH_LOOP value is treated as loop-off", () => {
    process.env.RALPH_LOOP = "";
    const repo = makeRepo();
    stageFile(repo, "harness/gate.ts", "export const value = 1;\n");
    stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).toContain("harness/gate.ts");
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
  });

  test.each(["0", "true", " 1 "])(
    "RALPH_LOOP=%s is treated as loop-off",
    (value) => {
      process.env.RALPH_LOOP = value;
      const repo = makeRepo();
      stageFile(repo, "harness/gate.ts", "export const value = 1;\n");
      stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
      expect(runPreflight(repo, () => [])).toEqual([]);
      expect(stagedNames(repo)).toContain("harness/gate.ts");
      expect(stagedNames(repo)).toContain("frontend/src/report.ts");
    },
  );

  test("loop preflight reports a forbidden pattern in an added line and keeps the file staged", () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    const target = "frontend/src/report.ts";
    const pattern = requiredForbiddenPattern("ts-ignore");
    const content = [
      ...Array.from(
        Array.from({ length: 100 }).keys(),
        (index) => `export const value${String(index)} = ${String(index)};\n`,
      ),
      `export const blocked = 1; // ${pattern}\n`,
    ].join("");

    // Without the loop there is no containment: the pattern is not scanned at all.
    delete process.env.RALPH_LOOP;
    const humanRepo = makeRepo();
    stageFile(humanRepo, target, content);
    expect(runPreflight(humanRepo, () => [])).toEqual([]);
    expect(stagedNames(humanRepo)).toEqual([target]);

    // In the loop the pattern is REPORTED (blocking the push) but the file stays staged and its
    // worktree content is untouched — no unstaging, no "kept forbidden paths" warning (that is only
    // for forbidden PATHS/symlinks).
    process.env.RALPH_LOOP = "1";
    const loopRepo = makeRepo();
    stageFile(loopRepo, target, content);
    expect(runPreflight(loopRepo, () => [])).toContain(
      `forbidden pattern '${pattern}' in ${target}`,
    );
    expect(stagedNames(loopRepo)).toEqual([target]);
    expect(readFileSync(path.join(loopRepo, target), "utf8")).toBe(content);
    expect(stderr.join("")).not.toContain("kept forbidden paths");
  });

  test.each(["harness/preferences.ts", "PROMPT.md"])(
    "ejects exact protected file %s under the loop",
    (target) => {
      process.env.RALPH_LOOP = "1";
      const repo = makeRepo();
      stageFile(repo, target, "updated\n");
      stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
      expect(runPreflight(repo, () => [])).toEqual([]);
      expect(stagedNames(repo)).not.toContain(target);
      expect(stagedNames(repo)).toContain("frontend/src/report.ts");
    },
  );

  test("ejects a staged deletion of harness HTML lint config", () => {
    const repo = makeRepo();
    stageFile(repo, "harness/.htmlvalidate.json", "{}\n");
    runCommand(["git", "commit", "-q", "-m", "add html config"], repo);
    runCommand(["git", "rm", "-q", "harness/.htmlvalidate.json"], repo);
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    process.env.RALPH_LOOP = "1";
    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).not.toContain("harness/.htmlvalidate.json");
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
  });

  test("checks staged .ts content when the worktree file is gone", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "frontend/src/state.ts", 'document.querySelector(".x");\n');
    runCommand(["rm", path.join(repo, "frontend/src/state.ts")], repo);
    expect(preferenceProblems(repo, ["frontend/src/state.ts"])).not.toEqual([]);
    const isFlagged = runPreflight(repo, () => []).some((problem) =>
      problem.includes("class selector"),
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
    stageFile(repo, "frontend/src/state.ts", "const good = 1;\n");
    writeFileSync(
      path.join(repo, "frontend/src/state.ts"),
      "const _bad = 1;\n",
    );
    expect(runPreflight(repo, () => [])).toEqual([]);
  });

  test("ejects both sides of a rename when the destination is forbidden", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
    runCommand(["git", "commit", "-q", "-m", "add feature"], repo);
    mkdirSync(path.join(repo, "harness"), { recursive: true });
    runCommand(
      ["git", "mv", "frontend/src/report.ts", "harness/gate.ts"],
      repo,
    );
    stageFile(repo, "frontend/src/state.ts", "export const keep = 1;\n");
    expect(runPreflight(repo, () => [])).toEqual([]);
    const staged = stagedNames(repo);
    expect(staged).not.toContain("frontend/src/report.ts");
    expect(staged).not.toContain("harness/gate.ts");
    expect(staged).toContain("frontend/src/state.ts");
  });

  test("ejects both sides of a rename when the source is forbidden", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "harness/gate.ts", "export const locked = 1;\n");
    runCommand(["git", "commit", "-q", "-m", "add locked harness file"], repo);
    mkdirSync(path.join(repo, "frontend/src"), { recursive: true });
    runCommand(
      ["git", "mv", "harness/gate.ts", "frontend/src/report.ts"],
      repo,
    );
    stageFile(repo, "frontend/src/state.ts", "export const keep = 1;\n");

    expect(runPreflight(repo, () => [])).toEqual([]);
    const staged = stagedNames(repo);
    expect(staged).not.toContain("harness/gate.ts");
    expect(staged).not.toContain("frontend/src/report.ts");
    expect(staged).toContain("frontend/src/state.ts");
  });

  test("does not run preferences on forbidden paths after dropping them", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "harness/gate.ts", "const _bad = 1;\n");
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).toEqual(["frontend/src/report.ts"]);
  });

  test("reports a banned add and keeps it staged alongside its staged deletion", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    const pattern = requiredForbiddenPattern("eslint-disable");
    stageFile(repo, "frontend/src/old.ts", "export const oldValue = 1;\n");
    runCommand(["git", "commit", "-q", "-m", "add old source"], repo);
    runCommand(["git", "rm", "-q", "frontend/src/old.ts"], repo);
    stageFile(
      repo,
      "frontend/src/new.ts",
      `export const newValue = 1; // ${pattern}\n`,
    );
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    // The banned add is reported (blocking the push); nothing is unstaged, so new.ts and the
    // old.ts deletion both remain staged for the author to resolve.
    expect(runPreflight(repo, () => [])).toContain(
      `forbidden pattern '${pattern}' in frontend/src/new.ts`,
    );
    expect(stagedNames(repo)).toContain("frontend/src/new.ts");
    expect(stagedNames(repo)).toContain("frontend/src/old.ts");
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
  });

  test("reports a rewritten rename with a banned added line", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    const pattern = requiredForbiddenPattern("ts-ignore");
    stageFile(repo, "frontend/src/old.ts", "export const oldValue = 1;\n");
    runCommand(["git", "commit", "-q", "-m", "add old source"], repo);
    runCommand(
      ["git", "mv", "frontend/src/old.ts", "frontend/src/new.ts"],
      repo,
    );
    writeFileSync(
      path.join(repo, "frontend/src/new.ts"),
      `export const newValue = 1; // ${pattern}\n`,
    );
    runCommand(["git", "add", "--", "frontend/src/new.ts"], repo);
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runPreflight(repo, () => [])).toContain(
      `forbidden pattern '${pattern}' in frontend/src/new.ts`,
    );
    expect(stagedNames(repo)).toContain("frontend/src/new.ts");
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
  });

  test("reports a git-detected rename against its destination, not its source path", () => {
    // A high-similarity rename (Git emits `R<score> src dest`) that appends a banned line.
    // The added line lives in the DESTINATION, so the report must name the destination — not
    // change.paths[0], which for a rename is the source path.
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    const pattern = requiredForbiddenPattern("ts-ignore");
    const body =
      "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n";
    stageFile(repo, "frontend/src/old.ts", body);
    runCommand(["git", "commit", "-q", "-m", "add old source"], repo);
    runCommand(
      ["git", "mv", "frontend/src/old.ts", "frontend/src/new.ts"],
      repo,
    );
    // Minimal edit keeps similarity high so Git records this as a rename (R), not delete+add.
    writeFileSync(
      path.join(repo, "frontend/src/new.ts"),
      `${body}// ${pattern}\n`,
    );
    runCommand(["git", "add", "--", "frontend/src/new.ts"], repo);
    const problems = runPreflight(repo, () => []);
    expect(problems).toContain(
      `forbidden pattern '${pattern}' in frontend/src/new.ts`,
    );
    expect(problems).not.toContain(
      `forbidden pattern '${pattern}' in frontend/src/old.ts`,
    );
  });

  test("reporting a banned file leaves it staged and its dirty worktree edits intact", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    const target = "frontend/src/state.ts";
    const pattern = requiredForbiddenPattern("noqa");
    stageFile(repo, target, `export const staged = 1; // ${pattern}\n`);
    writeFileSync(path.join(repo, target), "export const dirty = 2;\n");
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runPreflight(repo, () => [])).toContain(
      `forbidden pattern '${pattern}' in ${target}`,
    );
    expect(stagedNames(repo)).toContain(target);
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
    // Report-only never touches the worktree: the later dirty edit is preserved.
    expect(readFileSync(path.join(repo, target), "utf8")).toBe(
      "export const dirty = 2;\n",
    );
  });
});

describe("banned patterns and preferences under loop", () => {
  test.each(FORBIDDEN_PATTERNS)(
    "reports a staged file that adds banned pattern %s and keeps it staged",
    (pattern) => {
      process.env.RALPH_LOOP = "1";
      const repo = makeRepo();
      stageFile(
        repo,
        "frontend/src/state.ts",
        `export const value = 1; // ${pattern}\n`,
      );
      stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
      // Banned PATTERNS are reported (blocking the commit), not unstaged: the author must remove
      // the escape hatch themselves; the file stays staged so they see exactly where it is.
      expect(runPreflight(repo, () => [])).toContain(
        `forbidden pattern '${pattern}' in frontend/src/state.ts`,
      );
      expect(stagedNames(repo)).toContain("frontend/src/state.ts");
      expect(stagedNames(repo)).toContain("frontend/src/report.ts");
    },
  );

  test("reports a banned TypeScript suppression and keeps the file staged", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    const pattern = requiredForbiddenPattern("ts-ignore");
    stageFile(
      repo,
      "frontend/src/state.ts",
      `export const value = 1; // @${pattern}\n`,
    );
    const problems = runPreflight(repo, () => []);
    expect(problems).toContain(
      `forbidden pattern '${pattern}' in frontend/src/state.ts`,
    );
    expect(stagedNames(repo)).toContain("frontend/src/state.ts");
  });

  test("matches banned patterns case-insensitively", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    const pattern = requiredForbiddenPattern("noqa");
    stageFile(
      repo,
      "frontend/src/state.ts",
      `export const value = 1; // ${pattern.toUpperCase()}\n`,
    );
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    // The uppercase NOQA still matches; it is reported (lowercased pattern name) and stays staged.
    expect(runPreflight(repo, () => [])).toContain(
      `forbidden pattern '${pattern}' in frontend/src/state.ts`,
    );
    expect(stagedNames(repo)).toContain("frontend/src/state.ts");
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
  });

  test("ignores banned patterns that appear only in removed lines", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(
      repo,
      "frontend/src/state.ts",
      `export const value = 1; // ${requiredForbiddenPattern("noqa")}\n`,
    );
    runCommand(["git", "commit", "-q", "-m", "add legacy suppression"], repo);
    stageFile(repo, "frontend/src/state.ts", "export const value = 2;\n");
    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).toEqual(["frontend/src/state.ts"]);
  });

  test("ignores banned patterns that appear only in diff context", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(
      repo,
      "frontend/src/state.ts",
      [
        "export const before = 1;\n",
        `export const legacy = 1; // ${requiredForbiddenPattern("ts-expect-error")}\n`,
        "export const after = 1;\n",
      ].join(""),
    );
    runCommand(["git", "commit", "-q", "-m", "add legacy context"], repo);
    stageFile(
      repo,
      "frontend/src/state.ts",
      [
        "export const before = 2;\n",
        `export const legacy = 1; // ${requiredForbiddenPattern("ts-expect-error")}\n`,
        "export const after = 1;\n",
      ].join(""),
    );
    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).toEqual(["frontend/src/state.ts"]);
  });

  test("reports only the file whose ADDED line has a banned pattern, not legacy content", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    const legacyPattern = requiredForbiddenPattern("noqa");
    const addedPattern = requiredForbiddenPattern("ts-ignore");
    stageFile(
      repo,
      "frontend/src/legacy.ts",
      `export const legacy = 1; // ${legacyPattern}\n`,
    );
    runCommand(["git", "commit", "-q", "-m", "add legacy suppression"], repo);
    stageFile(
      repo,
      "frontend/src/state.ts",
      `export const value = 1; // ${addedPattern}\n`,
    );
    stageFile(
      repo,
      "frontend/src/legacy.ts",
      [
        `export const legacy = 1; // ${legacyPattern}\n`,
        "export const clean = 1;\n",
      ].join(""),
    );

    const problems = runPreflight(repo, () => []);
    // Only state.ts adds a banned pattern; legacy.ts's noqa is pre-existing context, so it is not
    // re-flagged. Both files stay staged (patterns are reported, never unstaged).
    expect(problems).toContain(
      `forbidden pattern '${addedPattern}' in frontend/src/state.ts`,
    );
    expect(problems).not.toContain(
      `forbidden pattern '${legacyPattern}' in frontend/src/legacy.ts`,
    );
    expect(stagedNames(repo)).toEqual([
      "frontend/src/legacy.ts",
      "frontend/src/state.ts",
    ]);
  });

  test("reports every file that adds a banned pattern in one preflight", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    const patternA = requiredForbiddenPattern("ts-nocheck");
    const patternB = requiredForbiddenPattern("prettier-ignore");
    stageFile(
      repo,
      "frontend/src/a.ts",
      `export const a = 1; // ${patternA}\n`,
    );
    stageFile(
      repo,
      "frontend/src/b.ts",
      `export const b = 1; // ${patternB}\n`,
    );
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    const problems = runPreflight(repo, () => []);
    expect(problems).toContain(
      `forbidden pattern '${patternA}' in frontend/src/a.ts`,
    );
    expect(problems).toContain(
      `forbidden pattern '${patternB}' in frontend/src/b.ts`,
    );
    // Every file stays staged; nothing is unstaged for a pattern hit.
    expect(stagedNames(repo)).toEqual([
      "frontend/src/a.ts",
      "frontend/src/b.ts",
      "frontend/src/report.ts",
    ]);
  });

  test("does not flag banned words that appear only in a filename", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "frontend/src/noqa.ts", "export const clean = 1;\n");

    const problems = runPreflight(repo, () => []);

    expect(problems).not.toEqual(
      expect.arrayContaining([expect.stringContaining("banned pattern")]),
    );
  });

  test("flags a staged preference break (disallowed DOM selector)", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "frontend/src/state.ts", 'document.querySelector(".x");\n');
    const isFlagged = runPreflight(repo, () => []).some((problem) =>
      problem.includes("class selector"),
    );
    expect(isFlagged).toBe(true);
  });
});

describe("harness setup script merging", () => {
  test("adds missing root harness scripts without changing existing scripts", () => {
    const repo = makeInstallRepo({ build: "vite build" });

    expect(addRootScripts(repo)).toBe(0);
    const scripts = readPackageJsonInRepo(repo).scripts ?? {};
    expect(scripts.build).toBe("vite build");
    expect(scripts.gate).toBe("node harness/harness.mjs gate");
    expect(scripts.setup).toBe("node harness/harness.mjs setup");
    expect(scripts.lint).toBe("pnpm --prefix harness run lint");
    expect(scripts.loop).toBe("node harness/harness.mjs loop");
    expect(scripts.status).toBe("node harness/harness.mjs status");
    expect(scripts.test).toBe("pnpm --prefix harness run test:coverage");
    expect(scripts["test:file"]).toBe("pnpm --prefix harness run test:file --");
    expect(Object.hasOwn(scripts, "run")).toBe(false);
  });

  test("preserves existing test and lint scripts with namespaced aliases", () => {
    const repo = makeInstallRepo({
      gate: "node custom-gate.js",
      lint: "eslint app",
      test: "node custom-test.js",
    });

    expect(addRootScripts(repo)).toBe(0);
    const scripts = readPackageJsonInRepo(repo).scripts ?? {};
    expect(scripts.gate).toBe("node custom-gate.js");
    expect(scripts.lint).toBe("eslint app");
    expect(scripts.test).toBe("node custom-test.js");
    expect(scripts["harness:lint"]).toBe("pnpm --prefix harness run lint");
    expect(scripts["harness:test"]).toBe(
      "pnpm --prefix harness run test:coverage",
    );
  });

  test("preserves every existing root script name and only aliases test and lint", () => {
    const repo = makeInstallRepo({
      gate: "node project-gate.js",
      install: "node project-install.js",
      lint: "eslint src",
      loop: "node project-loop.js",
      run: "node project-run.js",
      status: "node project-status.js",
      test: "node project-test.js",
      "test:file": "node project-test-file.js",
    });

    expect(addRootScripts(repo)).toBe(0);
    const scripts = readPackageJsonInRepo(repo).scripts ?? {};
    expect(scripts.gate).toBe("node project-gate.js");
    expect(scripts.install).toBe("node project-install.js");
    expect(scripts.setup).toBe("node harness/harness.mjs setup");
    expect(scripts.lint).toBe("eslint src");
    expect(scripts.loop).toBe("node project-loop.js");
    expect(scripts.run).toBe("node project-run.js");
    expect(scripts.status).toBe("node project-status.js");
    expect(scripts.test).toBe("node project-test.js");
    expect(scripts["test:file"]).toBe("node project-test-file.js");
    expect(scripts["harness:lint"]).toBe("pnpm --prefix harness run lint");
    expect(scripts["harness:test"]).toBe(
      "pnpm --prefix harness run test:coverage",
    );
    expect(Object.hasOwn(scripts, "harness:gate")).toBe(false);
    expect(Object.hasOwn(scripts, "harness:setup")).toBe(false);
    expect(Object.hasOwn(scripts, "harness:loop")).toBe(false);
    expect(Object.hasOwn(scripts, "harness:run")).toBe(false);
    expect(Object.hasOwn(scripts, "harness:status")).toBe(false);
    expect(Object.hasOwn(scripts, "harness:test:file")).toBe(false);
  });

  test("does not create a runtime config sidecar", () => {
    const repo = makeInstallRepo({});

    expect(addRootScripts(repo)).toBe(0);
    expect(existsSync(path.join(repo, "harness", "configs.json"))).toBe(false);
  });

  test("leaves harness scripts unchanged when no user config exists", () => {
    const repo = makeInstallRepo({});
    const before = readHarnessPackageJsonInRepo(repo).scripts ?? {};

    expect(addRootScripts(repo)).toBe(0);
    expect(readHarnessPackageJsonInRepo(repo).scripts).toEqual(before);
  });
});

// Containment matches on path strings and reads staged content as text. A staged symlink
// slips through: its path is not forbidden, and its "content" is just the link target, so a
// source-looking file can point at a protected file (harness/gate.ts) or escape the repo
// entirely (/etc/passwd). The loop must resolve or reject symlinks, not treat them as source.
const linkRepo = (
  target: string,
  linkPath = "frontend/src/evil.ts",
): string => {
  process.env.RALPH_LOOP = "1";
  const repo = makeRepo();
  const absoluteLink = path.join(repo, linkPath);
  mkdirSync(path.dirname(absoluteLink), { recursive: true });
  symlinkSync(target, absoluteLink);
  runCommand(["git", "add", "--", linkPath], repo);
  stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
  return repo;
};

describe("symlink and path-traversal containment", () => {
  test("ejects a source-looking symlink that points at a forbidden file", () => {
    const repo = makeRepo();
    process.env.RALPH_LOOP = "1";
    mkdirSync(path.join(repo, "harness"), { recursive: true });
    writeFileSync(
      path.join(repo, "harness/gate.ts"),
      "export const locked = 1;\n",
    );
    mkdirSync(path.join(repo, "frontend/src"), { recursive: true });
    symlinkSync(
      "../../harness/gate.ts",
      path.join(repo, "frontend/src/evil.ts"),
    );
    runCommand(["git", "add", "--", "frontend/src/evil.ts"], repo);
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");

    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).not.toContain("frontend/src/evil.ts");
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
  });

  test("ejects a symlink that escapes the repository", () => {
    const repo = linkRepo("/etc/passwd");

    expect(runPreflight(repo, () => [])).toEqual([]);
    expect(stagedNames(repo)).not.toContain("frontend/src/evil.ts");
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
  });
});

describe("frontend gate shape", () => {
  // No shims. Every harness source module must carry real logic, not merely forward to another
  // module. A shim is a file whose body — after stripping comments, blanks, and imports — is only
  // re-exports (`export ... from "..."`) or a lone pass-through call. Such files exist only to
  // dodge coverage or indirection and are banned outright: delete them and inline their one use.
  test("no harness source module is a pure re-export or forwarding shim", () => {
    const sources = readdirSync(HARNESS).filter(
      (name) =>
        /\.(?:ts|mjs|cjs|js)$/u.test(name) &&
        !name.endsWith(".test.ts") &&
        !name.includes(".config.") &&
        !name.endsWith("rc.cjs"),
    );
    expect(sources.length).toBeGreaterThan(0);

    const shims: string[] = [];
    for (const name of sources) {
      const withoutComments = readFileSync(path.join(HARNESS, name), "utf8")
        .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
        .split("\n")
        .map((line) => {
          const comment = line.indexOf("//");
          return (comment === -1 ? line : line.slice(0, comment)).trim();
        })
        .filter((line) => line.length > 0);
      const body = withoutComments.filter((line) => {
        const isModuleLink =
          (line.startsWith("import ") || line.startsWith("export ")) &&
          line.includes(" from ");
        return !isModuleLink;
      });
      // A re-export-only file has no body once `... from ...` lines are removed.
      const isReExportOnly = body.length === 0;
      // A forwarding shim's entire executable body is one delegating call, e.g.
      // `await main(process.argv.slice(2));` or `run(process.argv);` — an optional `await`
      // then a bare `identifier(` with nothing else (no control flow, no other statements).
      const only = (body.length === 1 ? body[0] : "") ?? "";
      const call = only.startsWith("await ")
        ? only.slice("await ".length)
        : only;
      const isForwardingOnly =
        /^[A-Za-z_$][\w$]*\(/u.test(call) && only.endsWith(";");
      if (isReExportOnly || isForwardingOnly) shims.push(name);
    }

    expect(shims, `shim module(s) found: ${shims.join(", ")}`).toEqual([]);
  });

  test("file inputs referenced by full checks exist", () => {
    for (const target of [
      ".github/workflows/ci.yml",
      "frontend/index.html",
      "frontend/pnpm-lock.yaml",
      "frontend/package.json",
      "harness/tsconfig.app.json",
    ]) {
      expect(existsSync(path.join(REPO, target)), target).toBe(true);
    }
  });

  test("full gate selects heavy, networked, and browser checks for package repos", () => {
    const repo = makePackageRootsRepo();
    let selected: Record<string, string[]> | undefined;
    let seenRepo: string | undefined;
    const failures = runGate(repo, (runnerRepo, checks) => {
      seenRepo = runnerRepo;
      selected = pickChecks(checks, [
        "audit",
        "build",
        "coverage",
        "e2e",
        "lighthouse",
        // "osv", // disabled in gate-data.ts
        "sast",
      ]);
      return [];
    });
    expect(failures).toEqual([]);
    expect(seenRepo).toBe(repo);
    if (selected === undefined) {
      throw new Error("runGate did not invoke the runner");
    }
    const chosen = selected;
    expect(Object.keys(chosen).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "audit",
      "build",
      "coverage",
      "e2e",
      "lighthouse",
      // "osv", // disabled in gate-data.ts
      "sast",
    ]);
    expect(commandText(checkCommand(chosen, "build"))).toBe(
      "pnpm --dir frontend run build",
    );
    expect(commandText(checkCommand(chosen, "coverage"))).toContain(
      "harness/vitest.config.js --cache --coverage",
    );
    expect(commandText(checkCommand(chosen, "e2e"))).toContain(
      "harness/playwright.config.js",
    );
    expect(commandText(checkCommand(chosen, "lighthouse"))).toContain(
      "harness/lighthouserc.cjs",
    );
    expect(commandText(checkCommand(chosen, "audit"))).toBe(
      "pnpm --dir frontend audit --audit-level high",
    );
    expect(commandText(checkCommand(chosen, "sast"))).toContain(
      "semgrep scan --config=p/typescript --config=p/javascript --config=p/security-audit --error --metrics=off",
    );
    // Disabled in gate-data.ts:
    // expect(commandText(checkCommand(chosen, "osv"))).toBe(
    //   "osv-scanner scan source --lockfile=frontend/pnpm-lock.yaml --lockfile=harness/pnpm-lock.yaml",
    // );
  });

  test.each([
    {
      check: "format",
      tool: "prettier",
      required: [
        "frontend/",
        "harness/",
        "--check",
        "harness/.prettierignore",
        "--cache",
        ".cache_prettier",
      ],
    },
    {
      check: "eslint",
      tool: "eslint",
      required: [".", "--config harness/eslint.config.js", "--max-warnings=0"],
    },
    {
      check: "style",
      tool: "stylelint",
      required: [
        "frontend/**/*.css",
        "--config harness/stylelint.config.js",
        "--max-warnings=0",
        "--allow-empty-input",
      ],
    },
    {
      check: "html",
      tool: "html-validate",
      required: ["--config harness/.htmlvalidate.json", "**/*.html"],
    },
    {
      check: "markup",
      tool: "markuplint",
      required: ["frontend/index.html", "--max-warnings 0"],
    },
    {
      check: "typecheck",
      tool: "tsc",
      required: [
        "-p harness/tsconfig.app.json",
        "--noEmit",
        "--incremental",
        ".cache_tsbuildinfo_app",
      ],
    },
    {
      check: "schema",
      tool: "ajv",
      required: [
        "compile",
        "frontend/schemas/**/*.schema.json",
        "--strict=true",
        "ajv-formats",
        "ajv-keywords",
      ],
    },
    {
      check: "cruise",
      tool: "depcruise",
      required: [
        "frontend/src",
        "--config harness/.dependency-cruiser.cjs",
        "--output-type err",
      ],
    },
    {
      check: "workflow",
      tool: "spectral",
      required: [
        "lint",
        ".github/workflows/ci.yml",
        "--ruleset harness/.spectral.yml",
        "--fail-severity=warn",
      ],
    },
    {
      check: "secrets",
      tool: "secretlint",
      required: ["**/*", "--secretlintrc harness/.secretlintrc.json"],
    },
    {
      check: "spelling",
      tool: "cspell",
      required: [".", "--config harness/cspell.json"],
    },
  ])(
    "$check command is scoped to $tool policy inputs",
    ({ check, required }) => {
      const text = commandText(checkCommand(FULL_CHECKS, check));
      for (const fragment of required) {
        expect(text, `${check} missing ${fragment}`).toContain(fragment);
      }
    },
  );

  test("knip scans repo TypeScript and JavaScript entrypoints", () => {
    const config = parseJsonObject("harness/knip.json");
    expect(config.ignoreDependencies).toEqual([
      "@secretlint/secretlint-rule-preset-recommend",
    ]);
    expect(config.ignoreBinaries).toEqual(["semgrep"]);
    expect(config.include).toEqual([
      "files",
      "exports",
      "nsExports",
      "types",
      "nsTypes",
    ]);
    // knip maps each pnpm workspace so imports resolve to the right package.json; the harness
    // workspace names cli.ts, its configs, tests, and the lighthouse config as entrypoints.
    // The frontend workspace names its unit tests as entrypoints so knip does not report
    // test-only exports (or the test files themselves) as unused.
    expect(config.workspaces).toEqual({
      frontend: {
        entry: ["src/**/*.test.ts"],
        project: ["src/**/*.ts"],
      },
      harness: {
        entry: [
          "cli.ts",
          "*.config.{js,cjs,mjs,ts}",
          "*.test.ts",
          "lighthouserc.cjs",
        ],
        project: ["*.ts", "*.{js,cjs,mjs}"],
      },
    });
    expect(existsSync(path.join(HARNESS, "tmprepo.ts"))).toBe(false);
  });

  test("root script menu is the stable command surface", () => {
    const scripts = readPackageScripts("package.json");
    expect(Object.keys(scripts).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [
        "build",
        "dev",
        "gate",
        "harness:lint",
        "harness:test",
        "lint",
        "loop",
        "preflight",
        "preview",
        "setup",
        "status",
        "test",
        "test:file",
      ],
    );
    expect(scripts.test).toBe("pnpm --filter ./harness coverage");
    expect(scripts["test:file"]).toBe("pnpm --filter ./harness test:file --");
    expect(scripts.lint).toBe("pnpm --filter ./harness lint");
    expect(scripts.gate).toBe("node harness/harness.mjs gate");
    expect(scripts.preflight).toBe("node harness/harness.mjs preflight");
  });

  test("harness package scripts use bounded repo file targets", () => {
    const scripts = readPackageScripts("harness/package.json");
    // Harness npm scripts run via `pnpm run`, which puts the workspace node_modules/.bin on PATH,
    // so tools are invoked by bare name (the pnpm-idiomatic form) — no hard-coded .bin path.
    expect(scripts.eslint).toBe(
      "cd .. && eslint . --config harness/eslint.config.js --cache --cache-location . --max-warnings=0 --debug",
    );
    expect(scripts.style).toBe(
      'cd .. && stylelint "frontend/**/*.css" --config harness/stylelint.config.js --ignore-path harness/.stylelintignore --max-warnings=0 --allow-empty-input --formatter verbose',
    );
    expect(scripts.html).toBe(
      'cd .. && html-validate --config harness/.htmlvalidate.json "**/*.html"',
    );
    expect(scripts.typecheck).toBe(
      "pnpm typecheck:harness && pnpm typecheck:project",
    );
    expect(scripts["typecheck:project"]).toBe(
      "cd .. && tsc -p harness/tsconfig.app.json --noEmit",
    );
    expect(scripts["typecheck:frontend"]).toBe("pnpm typecheck:project");
    expect(scripts["typecheck:frontend"]).not.toContain(
      "frontend/tsconfig.json",
    );
    expect(scripts["lint:design"]).toBe("cd .. && designmd lint DESIGN.md");
  });

  test("harness app tsconfig owns the repo TypeScript include set and strict flags", () => {
    const config = parseJsonObject("harness/tsconfig.app.json") as {
      compilerOptions?: Record<string, unknown>;
      exclude?: unknown;
      include?: unknown;
    };
    expect(config.include).toEqual(["../**/*.ts", "*.ts"]);
    expect(config.exclude).toEqual(
      expect.arrayContaining(["../harness/**", "../**/node_modules/**"]),
    );
    expect(config.compilerOptions).toEqual(
      expect.objectContaining({
        strict: true,
        noImplicitReturns: true,
        noUncheckedSideEffectImports: true,
        noUncheckedIndexedAccess: true,
        useUnknownInCatchVariables: true,
        exactOptionalPropertyTypes: true,
      }),
    );
  });

  test("harness leaf tsconfig keeps the required harness compiler settings", () => {
    const harnessConfig = parseJsonObject("harness/tsconfig.harness.json") as {
      compilerOptions?: Record<string, unknown>;
      include?: unknown;
    };

    expect(harnessConfig.include).toEqual(["*.ts", "../**/tests/**/*.ts"]);
    expect(harnessConfig.compilerOptions).toEqual(
      expect.objectContaining({
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
        noUncheckedIndexedAccess: true,
      }),
    );
  });

  test("frontend keeps app scripts and delegates checks to harness", () => {
    const scripts = readPackageScripts("frontend/package.json");
    expect(Object.keys(scripts).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [
        "build",
        "dev",
        "lint",
        "preview",
        "setup:e2e",
        "test",
        "test:coverage",
        "test:e2e",
        "test:file",
        "typecheck",
      ],
    );
    expect(scripts.build).toBe("vite build");
    expect(scripts.dev).toContain("vite");
    expect(scripts.test).toBe("pnpm test:coverage");
    expect(scripts["test:coverage"]).toContain("../harness");
    expect(scripts.lint).toContain("../harness");
    for (const hidden of [
      "gate:checks",
      "gate:python-harness",
      "harness:gate",
      "harness:preflight",
      "preflight",
      "security",
      "TEST",
      "test:harness",
      "test:related",
      "typecheck:harness",
    ]) {
      expect(Object.hasOwn(scripts, hidden)).toBe(false);
    }
  });

  // (Removed: "package lock matches manifest root dependencies" — that npm-lock invariant is now
  // enforced by pnpm itself at install time; pnpm refuses to install packages absent from
  // package.json, and pnpm-lock.yaml's shape is not the npm packages[""] map this test parsed.)

  test("vitest coverage thresholds are all 100 in exported config", () => {
    const config = importedVitestConfig();
    // Coverage is scoped to the source roots (harness engine + frontend app src), never the
    // whole repo — a bare `**/*.ts` sweeps libraries, generated fixtures, and a local
    // .pnpm-store, which both double-runs suites and tanks the 100% thresholds.
    expect(config.test?.coverage?.include).toEqual([
      "harness/*.ts",
      "frontend/src/**/*.ts",
    ]);
    expect(config.test?.coverage?.thresholds).toEqual({
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    });
  });

  test("eslint resolved config applies strict source rules to harness gate", () => {
    const config = resolvedEslintConfig();
    const rules = config.rules ?? {};
    const expectRuleError = (name: string): void => {
      const rule = rules[name];
      expect(Array.isArray(rule) ? rule[0] : rule).toBe(2);
    };

    for (const rule of [
      "max-lines",
      "max-lines-per-function",
      "max-depth",
      "max-params",
      "complexity",
      "max-statements",
      "sonarjs/cognitive-complexity",
      "@typescript-eslint/no-explicit-any",
      "@typescript-eslint/no-unsafe-assignment",
      "@typescript-eslint/strict-boolean-expressions",
      "no-eval",
      "security/detect-eval-with-expression",
      "security/detect-non-literal-fs-filename",
    ]) {
      expectRuleError(rule);
    }
    expect(config.linterOptions?.reportUnusedDisableDirectives).toBe(2);
  });

  test("eslint config limits directory-specific weakening to harness tooling", () => {
    const config = importedEslintConfig();
    const directorySpecificBlocks = config.filter((block) =>
      Array.isArray(block.files)
        ? block.files.some((file) =>
            /(?:^|\/)(?:frontend|harness)\//u.test(String(file)),
          )
        : false,
    );
    expect(directorySpecificBlocks).toHaveLength(1);
    expect(directorySpecificBlocks[0]?.files).toEqual(["harness/**/*.ts"]);
    expect(directorySpecificBlocks[0]?.rules).toEqual(
      expect.objectContaining({
        "sonarjs/no-os-command-from-path": "off",
        "security/detect-non-literal-fs-filename": "off",
      }),
    );
  });

  test("eslint exported config rejects unused disable comments", () => {
    const config = importedEslintConfig();
    const hasPolicy = config.some(
      (block) => block.linterOptions?.reportUnusedDisableDirectives === "error",
    );
    expect(hasPolicy).toBe(true);
  });

  test("eslint exported config blocks production imports from tests", () => {
    const config = importedEslintConfig();
    const sourceBlock = config.find((block) =>
      Array.isArray(block.rules?.["no-restricted-imports"]),
    );
    const patternsMatcher: unknown = expect.arrayContaining([
      expect.objectContaining({
        group: ["*.test", "*.test.*", "*.spec", "*.spec.*"],
      }),
    ]);
    expect(sourceBlock?.rules?.["no-restricted-imports"]).toEqual([
      "error",
      expect.objectContaining({
        patterns: patternsMatcher,
      }),
    ]);
  });

  test("git hooks are two simple entrypoints", () => {
    const hooks = readdirSync(path.join(REPO, ".githooks")).toSorted((a, b) =>
      a.localeCompare(b),
    );
    expect(hooks).toEqual(["pre-commit", "pre-push"]);
    expect(readRepo(".githooks/pre-commit")).toBe(
      "#!/bin/sh\nset -eu\n\nnode harness/harness.mjs preflight\n",
    );
    expect(readRepo(".githooks/pre-push")).toBe(
      "#!/bin/sh\nset -eu\n\nnode harness/harness.mjs gate\n",
    );
  });

  // Smoke test: the pre-commit hook must actually EXECUTE and ENFORCE containment end-to-end, not
  // merely contain the right text. Wire a temp repo to the real hook + CLI, then drive real
  // `git commit`s under RALPH_LOOP=1 with quality-tool binaries stubbed in the temp repo.
  test("the pre-commit hook executes and enforces containment on real commits", () => {
    const repo = makeRepo();
    writeHarnessCliWrapper(repo);
    stubCheckTools(repo, COMMIT_CHECKS);
    mkdirSync(path.join(repo, ".githooks"), { recursive: true });
    writeFileSync(
      path.join(repo, ".githooks", "pre-commit"),
      readRepo(".githooks/pre-commit"),
      { mode: 0o755 },
    );
    runCommand(["git", "config", "core.hooksPath", ".githooks"], repo);

    const commit = (
      message: string,
    ): { status: number | null; stderr: string } => {
      const result = spawnSync("git", ["commit", "-q", "-m", message], {
        cwd: repo,
        encoding: "utf8",
        env: { ...gitSafeEnvironment(), RALPH_LOOP: "1" },
      });
      return { status: result.status ?? 1, stderr: result.stderr };
    };

    // A forbidden pattern (an eslint-disable escape hatch) in a staged add: the running hook must
    // report it and fail, so the work never becomes a commit.
    stageFile(
      repo,
      "frontend/src/sneaky.ts",
      "export const value = 1; // eslint-disable-next-line\n",
    );
    const patternBlocked = commit("sneak an escape hatch");
    expect(patternBlocked.status).not.toBe(0);
    expect(patternBlocked.stderr).toContain("forbidden pattern");
    expect(runGit(repo, ["log", "--oneline"])).not.toContain(
      "sneak an escape hatch",
    );

    // A forbidden PATH is unstaged by the hook; with nothing real left to commit, the loop's
    // empty-commit guard also fails the hook — the protected file never lands. (pyproject.toml is a
    // FORBIDDEN_FILE and sits at the repo root, so staging it can't write through the harness/ link.)
    runCommand(["git", "restore", "--staged", "frontend/src/sneaky.ts"], repo);
    rmSync(path.join(repo, "frontend/src/sneaky.ts"));
    stageFile(repo, "pyproject.toml", "[tool.evil]\n");
    const pathBlocked = commit("slip in a protected path");
    expect(pathBlocked.status).not.toBe(0);
    expect(runGit(repo, ["log", "--oneline"])).not.toContain(
      "slip in a protected path",
    );
    // The protected path was ejected from the index rather than committed.
    expect(stagedNames(repo)).not.toContain("pyproject.toml");
  }, 60_000);

  test("pre-push and GitHub CI use the JavaScript gate", () => {
    const prePush = readRepo(".githooks/pre-push");
    const githubCi = readRepo(".github/workflows/ci.yml");
    expect(prePush).toBe(
      "#!/bin/sh\nset -eu\n\nnode harness/harness.mjs gate\n",
    );
    expect(githubCi).toContain("node harness/harness.mjs gate");
    expect(githubCi).not.toContain("npmp gate");
  });

  test("GitHub CI installs the root workspace before the gate", () => {
    const githubCi = readRepo(".github/workflows/ci.yml");
    expect(githubCi).toContain("cache-dependency-path: pnpm-lock.yaml");
    expect(githubCi).toContain("run: pnpm install --frozen-lockfile");
    expect(githubCi).not.toContain("**/pnpm-lock.yaml");
    expect(githubCi).not.toContain("package-lock.json");
  });

  test("GitHub CI runs browser setup and gate through the harness", () => {
    const githubCi = readRepo(".github/workflows/ci.yml");
    expect(githubCi).toContain(
      "run: pnpm --prefix harness run setup:e2e -- chromium",
    );
    expect(githubCi).toContain("run: node harness/harness.mjs gate");
  });
});
