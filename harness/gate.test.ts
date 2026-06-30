// Ports harness/tests/test_gate.py: preflight/gate checks and loop containment, plus the
// "gate shape" assertions that pin the frontend app bar (the role of test_gate's config checks).

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  COMMIT_CHECKS,
  FORBIDDEN_DIRS,
  FORBIDDEN_FILES,
  FORBIDDEN_PATTERNS,
  FULL_CHECKS,
  gitSafeEnvironment,
  preferenceProblems,
  runChecks,
  runGate,
  runGit,
  runPreflight,
} from "./gate.js";

const HARNESS = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HARNESS, "..");
const readRepo = (relpath: string): string =>
  readFileSync(path.join(REPO, relpath), "utf8");
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
  if (!FORBIDDEN_PATTERNS.includes(pattern)) {
    throw new Error(`${pattern} is not a forbidden pattern`);
  }
  return pattern;
};

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  Object.values(value).every((entry) => typeof entry === "string");

const harnessTool = (name: string): string =>
  path.join("harness/node_modules/.bin", name);
const commandText = (command: string[]): string => command.join(" ");

function runCommand(argv: string[], cwd: string): string {
  const [command, ...arguments_] = argv;
  if (command === undefined) {
    throw new Error("missing command");
  }
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: gitSafeEnvironment(),
  });
  if (result.status !== 0) {
    throw new Error(`${argv.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

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

function stageFile(repo: string, relpath: string, content: string): void {
  const target = path.join(repo, relpath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  runCommand(["git", "add", "--", relpath], repo);
}

function stagedNames(repo: string): string[] {
  return runGit(repo, ["diff", "--cached", "--name-only"])
    .split("\n")
    .filter((line) => line.length > 0);
}

type FlatConfigBlock = {
  files?: unknown;
  linterOptions?: Record<string, unknown>;
  rules?: Record<string, unknown>;
};

type VitestConfig = {
  test?: {
    coverage?: {
      include?: string[];
      thresholds?: Record<string, number>;
    };
  };
};

type EslintResolvedConfig = {
  linterOptions?: Record<string, unknown>;
  rules?: Record<string, unknown>;
};

type PackageJson = {
  name?: string;
  private?: boolean;
  scripts?: Record<string, string>;
};

const parseJsonObject = (relpath: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(readRepo(relpath));
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error(`${relpath} is not a JSON object`);
};

const packageRoot = (
  relpath: string,
): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} => {
  const parsed = parseJsonObject(relpath);
  const dependencies = parsed.dependencies;
  const devDependencies = parsed.devDependencies;
  return {
    dependencies: isStringRecord(dependencies) ? dependencies : undefined,
    devDependencies: isStringRecord(devDependencies)
      ? devDependencies
      : undefined,
  };
};

const lockRootPackage = (
  relpath: string,
): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} => {
  const parsed = parseJsonObject(relpath);
  const packages = parsed.packages;
  if (
    typeof packages !== "object" ||
    packages === null ||
    Array.isArray(packages)
  ) {
    throw new Error(`${relpath} has no packages object`);
  }
  const root = (packages as Record<string, unknown>)[""];
  if (typeof root !== "object" || root === null || Array.isArray(root)) {
    throw new Error(`${relpath} has no root package entry`);
  }
  const rootPackage = root as Record<string, unknown>;
  return {
    dependencies: isStringRecord(rootPackage.dependencies)
      ? rootPackage.dependencies
      : undefined,
    devDependencies: isStringRecord(rootPackage.devDependencies)
      ? rootPackage.devDependencies
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
    check: "frontend_types",
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
    dependency: "npm-package-json-lint",
    check: "package_json",
    commandFragment: harnessTool("npmPkgJsonLint"),
  },
  {
    dependency: "dependency-cruiser",
    check: "architecture",
    commandFragment: harnessTool("depcruise"),
  },
  {
    dependency: "knip",
    check: "dead_code",
    commandFragment: harnessTool("knip"),
  },
  {
    dependency: "cspell",
    check: "spelling",
    commandFragment: harnessTool("cspell"),
  },
  {
    dependency: "@stoplight/spectral-cli",
    check: "workflow_api",
    commandFragment: harnessTool("spectral"),
  },
  {
    dependency: "secretlint",
    check: "secrets",
    commandFragment: harnessTool("secretlint"),
  },
  {
    dependency: "pnpm",
    check: "pnpm_audit",
    commandFragment: harnessTool("pnpm"),
  },
  {
    dependency: "lockfile-lint",
    check: "lockfile",
    commandFragment: harnessTool("lockfile-lint"),
  },
  {
    dependency: "syncpack",
    check: "versions",
    commandFragment: harnessTool("syncpack"),
  },
  {
    dependency: "vite",
    check: "build",
    commandFragment: "npm --prefix frontend run build",
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
    dependency: "size-limit",
    check: "size",
    commandFragment: harnessTool("size-limit"),
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
      ".",
      "--check",
      "harness/.prettierignore",
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
      "**/*.css",
      "harness/stylelint.config.js",
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
    check: "frontend_types",
    fragments: [harnessTool("tsc"), "harness/tsconfig.app.json", "--noEmit"],
  },
  {
    check: "harness_types",
    fragments: [harnessTool("tsc"), "harness/tsconfig.json", "--noEmit"],
  },
  {
    check: "markup",
    fragments: [harnessTool("markuplint"), "frontend/**/*.html"],
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
  { check: "package_json", fragments: [harnessTool("npmPkgJsonLint"), "."] },
  {
    check: "architecture",
    fragments: [
      harnessTool("depcruise"),
      "frontend/src",
      "harness/.dependency-cruiser.cjs",
      "err",
    ],
  },
  { check: "dead_code", fragments: [harnessTool("knip"), "harness/knip.json"] },
  {
    check: "spelling",
    fragments: [harnessTool("cspell"), ".", "harness/cspell.json"],
  },
  {
    check: "workflow_api",
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
    check: "npm_audit",
    fragments: ["npm", "--prefix", "frontend", "audit", "--audit-level=high"],
  },
  {
    check: "pnpm_audit",
    fragments: [harnessTool("pnpm"), "--dir", "frontend", "audit", "high"],
  },
  {
    check: "pnpm_approve_builds",
    fragments: [
      harnessTool("pnpm"),
      "--dir",
      "frontend",
      "approve-builds",
      "--all",
    ],
  },
  {
    check: "npm_signatures",
    fragments: ["npm", "--prefix", "frontend", "audit", "signatures"],
  },
  {
    check: "lockfile",
    fragments: [
      harnessTool("lockfile-lint"),
      "frontend/package-lock.json",
      "--allowed-hosts",
      "npm",
      "--validate-https",
    ],
  },
  {
    check: "versions",
    fragments: [harnessTool("syncpack"), "lint", "frontend/package.json"],
  },
  { check: "osv", fragments: ["osv-scanner", "-r", "."] },
  {
    check: "build",
    fragments: ["npm", "--prefix", "frontend", "run", "build"],
  },
  {
    check: "coverage",
    fragments: [
      harnessTool("vitest"),
      "harness/vitest.config.js",
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
    check: "size",
    fragments: [harnessTool("size-limit")],
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

const readPackageJsonInRepo = (repo: string): PackageJson =>
  JSON.parse(
    readFileSync(path.join(repo, "package.json"), "utf8"),
  ) as PackageJson;

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
  return repo;
};

const runHarnessSetup = (repo: string): SpawnSyncReturns<string> => {
  const prefix = path.join(repo, ".npm-prefix");
  mkdirSync(prefix, { recursive: true });
  return spawnSync(
    process.execPath,
    [path.join(REPO, "harness/harness.mjs"), "setup"],
    {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, npm_config_prefix: prefix },
    },
  );
};

const makePackageRootsRepo = (): string => {
  const repo = makeRepo();
  stageFile(repo, "frontend/package.json", '{"private":true}\n');
  stageFile(repo, "harness/package.json", '{"private":true}\n');
  return repo;
};

const importedEslintConfig = async (): Promise<FlatConfigBlock[]> => {
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
  return JSON.parse(output) as FlatConfigBlock[];
};

const importedVitestConfig = async (): Promise<VitestConfig> => {
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
  return JSON.parse(output) as VitestConfig;
};

const resolvedEslintConfig = (): EslintResolvedConfig => {
  const output = runCommand(
    [
      harnessTool("eslint"),
      "--print-config",
      "sample.ts",
      "--config",
      "harness/eslint.config.js",
    ],
    REPO,
  );
  return JSON.parse(output) as EslintResolvedConfig;
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
    expect(failures.map((failure) => failure.split(" failed:")[0])).toEqual([
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
    const failures = runChecks(makeRepo(), {
      slow: [process.execPath, "-e", "setTimeout(() => process.exit(0), 1000)"],
    });
    expect(Date.now() - started).toBeLessThan(750);
    expect(failureFor(failures, "slow").toLowerCase()).toContain("timeout");
  });

  test("fails closed for malformed empty argv", () => {
    let failures: string[] = [];
    expect(() => {
      failures = runChecks(makeRepo(), { empty: [] });
    }).not.toThrow();
    expect(failureFor(failures, "empty").toLowerCase()).toContain("empty");
  });

  test("fails closed for a missing arbitrary binary", () => {
    const failures = runChecks(makeRepo(), {
      missing: ["definitely-not-a-real-gate-binary"],
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^missing failed:\n/u);
    expect(failures[0]).toContain("definitely-not-a-real-gate-binary");
    expect(failures[0]).toContain("ENOENT");
    expect(failures[0]).not.toContain("undefinedundefined");
  });

  test("skips harness tools only when the harness package is absent", () => {
    const repo = makeRepo();
    const failures = runChecks(repo, {
      harness_tool: [harnessTool("definitely-missing")],
    });
    expect(failures).toEqual([]);
  });

  test("fails closed for a missing harness tool when harness package exists", () => {
    const repo = makeRepo();
    stageFile(repo, "harness/package.json", '{"private":true}\n');
    const failures = runChecks(repo, {
      harness_tool: [harnessTool("definitely-missing")],
    });
    expect(failures).toHaveLength(1);
  });

  test("skips frontend npm commands only when frontend package is absent", () => {
    const failures = runChecks(makeRepo(), {
      frontend_script: ["npm", "--prefix", "frontend", "run", "missing"],
    });
    expect(failures).toEqual([]);
  });

  test("fails closed for frontend npm commands when frontend package exists", () => {
    const repo = makeRepo();
    stageFile(repo, "frontend/package.json", '{"scripts":{}}\n');
    const failures = runChecks(repo, {
      frontend_script: ["npm", "--prefix", "frontend", "run", "missing"],
    });
    expect(failures).toHaveLength(1);
  });

  test("size check discovers every package that declares its own budget", () => {
    const repo = makeRepo();
    stageFile(repo, "frontend/package.json", '{"private":true}\n');
    stageFile(
      repo,
      "packages/admin/package.json",
      '{"private":true,"size-limit":[{"path":"dist/admin.js","limit":"20 KB"}]}\n',
    );
    stageFile(
      repo,
      "packages/widget/package.json",
      '{"private":true,"size-limit":[{"path":"dist/widget.js","limit":"10 KB"}]}\n',
    );
    stageFile(
      repo,
      "node_modules/hidden/package.json",
      '{"size-limit":[{"path":"dist/hidden.js","limit":"1 KB"}]}\n',
    );

    const failures = runChecks(repo, {
      size: [
        process.execPath,
        "-e",
        "const config = process.argv[process.argv.indexOf('--config') + 1]; process.stderr.write(config); process.exit(7)",
      ],
    });

    expect(failures).toHaveLength(2);
    expect(failures.join("\n")).toContain("packages/admin/package.json");
    expect(failures.join("\n")).toContain("packages/widget/package.json");
    expect(failures.join("\n")).not.toContain("frontend/package.json");
    expect(failures.join("\n")).not.toContain(
      "node_modules/hidden/package.json",
    );
  });

  test("size check ignores malformed package manifests during discovery", () => {
    const repo = makeRepo();
    stageFile(repo, "frontend/package.json", '{"private":true}\n');
    stageFile(repo, "packages/broken/package.json", '{"size-limit": [\n');
    stageFile(
      repo,
      "packages/valid/package.json",
      '{"private":true,"size-limit":[{"path":"dist/index.js","limit":"5 KB"}]}\n',
    );

    const failures = runChecks(repo, {
      size: [
        process.execPath,
        "-e",
        "const config = process.argv[process.argv.indexOf('--config') + 1]; process.stderr.write(config); process.exit(7)",
      ],
    });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("packages/valid/package.json");
    expect(failures[0]).not.toContain("packages/broken/package.json");
  });

  test("size check reports missing tool errors with the package budget path", () => {
    const repo = makeRepo();
    stageFile(
      repo,
      "packages/widget/package.json",
      '{"private":true,"size-limit":[{"path":"dist/widget.js","limit":"10 KB"}]}\n',
    );

    const failures = runChecks(repo, {
      size: ["definitely-not-a-real-size-limit-binary"],
    });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("packages/widget/package.json");
    expect(failures[0]).toContain("definitely-not-a-real-size-limit-binary");
    expect(failures[0]).toContain("ENOENT");
    expect(failures[0]).not.toContain("undefinedundefined");
  });

  test("size check skips cleanly when no package declares a size budget", () => {
    const repo = makeRepo();
    stageFile(repo, "frontend/package.json", '{"private":true}\n');
    stageFile(repo, "packages/api/package.json", '{"private":true}\n');

    const failures = runChecks(repo, {
      size: [process.execPath, "-e", "process.exit(99)"],
    });

    expect(failures).toEqual([]);
  });

  test.each(["semgrep", "osv-scanner"])(
    "skips external gate tool %s unless both packages exist",
    (tool) => {
      const repo = makeRepo();
      stageFile(repo, "frontend/package.json", '{"private":true}\n');
      const failures = runChecks(repo, {
        external: [tool, "--version"],
      });
      expect(failures).toEqual([]);
    },
  );

  test.each(["semgrep", "osv-scanner"])(
    "fails closed for missing external gate tool %s when both packages exist",
    (tool) => {
      const repo = makeRepo();
      stageFile(repo, "frontend/package.json", '{"private":true}\n');
      stageFile(repo, "harness/package.json", '{"private":true}\n');
      const failures = runChecks(repo, {
        external: [tool, "--version"],
      });
      expect(failures).toHaveLength(1);
    },
  );
});

describe("gate constants", () => {
  test("forbidden collections pin the containment essentials", () => {
    expect([...FORBIDDEN_DIRS].toSorted()).toEqual([
      ".githooks",
      ".github",
      "frontend/harness",
      "harness",
    ]);
    expect([...FORBIDDEN_FILES].toSorted()).toEqual([
      "AGENTS.md",
      "PROMPT.md",
      "docs/plan.md",
      "frontend/package-lock.json",
      "frontend/package.json",
      "frontend/tsconfig.json",
      "harness/.dependency-cruiser.cjs",
      "harness/.htmlvalidate.json",
      "harness/.markuplintrc.json",
      "harness/.prettierignore",
      "harness/.prettierrc.json",
      "harness/.secretlintrc.json",
      "harness/.spectral.yml",
      "harness/biome.json",
      "harness/cspell.json",
      "harness/eslint.config.js",
      "harness/knip.json",
      "harness/lighthouserc.cjs",
      "harness/package-lock.json",
      "harness/package.json",
      "harness/playwright.config.js",
      "harness/preferences.ts",
      "harness/stylelint.config.js",
      "harness/tsconfig.app.json",
      "harness/tsconfig.json",
      "harness/vitest.config.js",
      "package.json",
      "pyproject.toml",
    ]);
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

  test("package-json lint is pinned to the repo root", () => {
    expect(checkCommand(FULL_CHECKS, "package_json")).toEqual([
      harnessTool("npmPkgJsonLint"),
      ".",
    ]);
  });

  test("frontend type gate uses harness-owned app tsconfig only", () => {
    const command = checkCommand(FULL_CHECKS, "frontend_types");
    expect(command).toContain("harness/tsconfig.app.json");
    expect(command).toContain("--noEmit");
    expect(command).not.toContain("frontend/tsconfig.json");
    expect(FORBIDDEN_FILES.has("frontend/tsconfig.json")).toBe(true);
    expect(FORBIDDEN_FILES.has("harness/tsconfig.app.json")).toBe(true);
  });

  test("installed gate tooling has a concrete full-gate policy owner", () => {
    const devDependencies = packageRoot("harness/package.json").devDependencies;
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
    let seen: Record<string, string[]> | undefined;
    const failures = runGate(makeRepo(), (_repo, checks) => {
      seen = checks;
      return ["gate failed"];
    });
    expect(failures).toContain("gate failed");
    expect(seen).toBe(FULL_CHECKS);
  });

  test("runGate uses the real checks by default", () => {
    const repo = makeRepo();
    stageFile(repo, "frontend/package.json", '{"private":true}\n');
    stageFile(repo, "harness/package.json", '{"private":true}\n');
    const result = runGate(repo);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toMatch(/ failed:\n/u);
  });

  test("without RALPH_LOOP, preflight runs commit checks without containment", () => {
    let seen: Record<string, string[]> | undefined;
    const repo = makeRepo();
    stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
    const result = runPreflight(repo, (_repo, checks) => {
      seen = checks;
      return [];
    });
    expect(result).toEqual([]);
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

  test("preflight uses the real checks by default", () => {
    const repo = makeRepo();
    stageFile(repo, "harness/package.json", '{"private":true}\n');
    const result = runPreflight(repo);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toMatch(/ failed:\n/u);
  });
});

describe("loop containment", () => {
  test("rejects an empty commit", () => {
    process.env.RALPH_LOOP = "1";
    const problems = runPreflight(makeRepo());
    expect(problems).toContain("Empty commits are rejected. Stage real work.");
  });

  test("rejects a commit emptied by containment", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "pyproject.toml", "x = 1\n");
    const problems = runPreflight(repo);
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
    const directories = [...FORBIDDEN_DIRS].toSorted();
    const files = [...FORBIDDEN_FILES].toSorted();
    const generated = [
      ...files.map((target, index) => ({ target, content: `file-${index}\n` })),
      ...Array.from({ length: 40 }, (_, index) => {
        const directory = directories[(index * 7) % directories.length];
        return {
          target: `${directory}/generated-${index}/config-${index % 5}.json`,
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
    expect(runPreflight(repo)).toEqual([]);
    expect(stagedNames(repo)).not.toContain("pyproject.toml");
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
  });

  test("ejects multiple forbidden paths in one commit", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "pyproject.toml", "x = 1\n");
    stageFile(repo, "harness/gate.ts", "export const value = 1;\n");
    stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
    expect(runPreflight(repo)).toEqual([]);
    const staged = stagedNames(repo);
    expect(staged).not.toContain("pyproject.toml");
    expect(staged).not.toContain("harness/gate.ts");
    expect(staged).toContain("frontend/src/report.ts");
  });

  test("without the loop, a human may stage forbidden paths", () => {
    const repo = makeRepo();
    stageFile(repo, "harness/gate.ts", "export const value = 1;\n");
    stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
    expect(runPreflight(repo)).toEqual([]);
    expect(stagedNames(repo)).toContain("harness/gate.ts");
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
  });

  test("an empty RALPH_LOOP value is treated as loop-off", () => {
    process.env.RALPH_LOOP = "";
    const repo = makeRepo();
    stageFile(repo, "harness/gate.ts", "export const value = 1;\n");
    stageFile(repo, "frontend/src/report.ts", "export const y = 2;\n");
    expect(runPreflight(repo)).toEqual([]);
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
      expect(runPreflight(repo)).toEqual([]);
      expect(stagedNames(repo)).toContain("harness/gate.ts");
      expect(stagedNames(repo)).toContain("frontend/src/report.ts");
    },
  );

  test.each(["harness/preferences.ts", "PROMPT.md"])(
    "ejects exact protected file %s under the loop",
    (target) => {
      process.env.RALPH_LOOP = "1";
      const repo = makeRepo();
      stageFile(repo, target, "updated\n");
      stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
      expect(runPreflight(repo)).toEqual([]);
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
    expect(runPreflight(repo)).toEqual([]);
    expect(stagedNames(repo)).not.toContain("harness/.htmlvalidate.json");
    expect(stagedNames(repo)).toContain("frontend/src/report.ts");
  });

  test("checks staged .ts content when the worktree file is gone", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "frontend/src/state.ts", "const _bad = 3;\n");
    runCommand(["rm", path.join(repo, "frontend/src/state.ts")], repo);
    expect(preferenceProblems(repo, ["frontend/src/state.ts"])).not.toEqual([]);
    const isFlagged = runPreflight(repo).some((problem) =>
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
    stageFile(repo, "frontend/src/state.ts", "const good = 1;\n");
    writeFileSync(
      path.join(repo, "frontend/src/state.ts"),
      "const _bad = 1;\n",
    );
    expect(runPreflight(repo)).toEqual([]);
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
    expect(runPreflight(repo)).toEqual([]);
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

    expect(runPreflight(repo)).toEqual([]);
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
    expect(runPreflight(repo)).toEqual([]);
    expect(stagedNames(repo)).toEqual(["frontend/src/report.ts"]);
  });

  test("drops a banned add without leaving an orphan staged deletion", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "frontend/src/old.ts", "export const oldValue = 1;\n");
    runCommand(["git", "commit", "-q", "-m", "add old source"], repo);
    runCommand(["git", "rm", "-q", "frontend/src/old.ts"], repo);
    stageFile(
      repo,
      "frontend/src/new.ts",
      `export const newValue = 1; // ${requiredForbiddenPattern("eslint-disable")}\n`,
    );
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runPreflight(repo)).toEqual([]);
    expect(stagedNames(repo)).toEqual(["frontend/src/report.ts"]);
  });

  test("drops a rewritten rename with a banned added line as one change", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "frontend/src/old.ts", "export const oldValue = 1;\n");
    runCommand(["git", "commit", "-q", "-m", "add old source"], repo);
    runCommand(
      ["git", "mv", "frontend/src/old.ts", "frontend/src/new.ts"],
      repo,
    );
    writeFileSync(
      path.join(repo, "frontend/src/new.ts"),
      `export const newValue = 1; // ${requiredForbiddenPattern("ts-ignore")}\n`,
    );
    runCommand(["git", "add", "--", "frontend/src/new.ts"], repo);
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runPreflight(repo)).toEqual([]);
    expect(stagedNames(repo)).toEqual(["frontend/src/report.ts"]);
  });

  test("unstaging a banned file preserves later dirty worktree edits", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    const target = "frontend/src/state.ts";
    stageFile(
      repo,
      target,
      `export const staged = 1; // ${requiredForbiddenPattern("noqa")}\n`,
    );
    writeFileSync(path.join(repo, target), "export const dirty = 2;\n");
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runPreflight(repo)).toEqual([]);
    expect(stagedNames(repo)).toEqual(["frontend/src/report.ts"]);
    expect(readFileSync(path.join(repo, target), "utf8")).toBe(
      "export const dirty = 2;\n",
    );
  });
});

describe("banned patterns and preferences under loop", () => {
  test.each(FORBIDDEN_PATTERNS)(
    "ejects a staged file that adds banned pattern %s",
    (pattern) => {
      process.env.RALPH_LOOP = "1";
      const repo = makeRepo();
      stageFile(
        repo,
        "frontend/src/state.ts",
        `export const value = 1; // ${pattern}\n`,
      );
      stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
      expect(runPreflight(repo)).toEqual([]);
      expect(stagedNames(repo)).not.toContain("frontend/src/state.ts");
      expect(stagedNames(repo)).toContain("frontend/src/report.ts");
    },
  );

  test("rejects a commit emptied by a banned TypeScript suppression", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(
      repo,
      "frontend/src/state.ts",
      `export const value = 1; // @${requiredForbiddenPattern("ts-ignore")}\n`,
    );
    const problems = runPreflight(repo);
    expect(problems).toContain("Empty commits are rejected. Stage real work.");
    expect(stagedNames(repo)).not.toContain("frontend/src/state.ts");
  });

  test("matches banned patterns case-insensitively", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(
      repo,
      "frontend/src/state.ts",
      `export const value = 1; // ${requiredForbiddenPattern("noqa").toUpperCase()}\n`,
    );
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runPreflight(repo)).toEqual([]);
    expect(stagedNames(repo)).not.toContain("frontend/src/state.ts");
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
    expect(runPreflight(repo)).toEqual([]);
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
    expect(runPreflight(repo)).toEqual([]);
    expect(stagedNames(repo)).toEqual(["frontend/src/state.ts"]);
  });

  test("ejects every file that adds a banned pattern in one preflight", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(
      repo,
      "frontend/src/a.ts",
      `export const a = 1; // ${requiredForbiddenPattern("ts-nocheck")}\n`,
    );
    stageFile(
      repo,
      "frontend/src/b.ts",
      `export const b = 1; // ${requiredForbiddenPattern("prettier-ignore")}\n`,
    );
    stageFile(repo, "frontend/src/report.ts", "export const keep = 1;\n");
    expect(runPreflight(repo)).toEqual([]);
    expect(stagedNames(repo)).toEqual(["frontend/src/report.ts"]);
  });

  test("does not flag banned words that appear only in a filename", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "frontend/src/noqa.ts", "export const clean = 1;\n");

    const problems = runPreflight(repo);

    expect(problems).not.toEqual(
      expect.arrayContaining([expect.stringContaining("banned pattern")]),
    );
  });

  test("flags a staged preference break (underscore name)", () => {
    process.env.RALPH_LOOP = "1";
    const repo = makeRepo();
    stageFile(repo, "frontend/src/state.ts", "const _bad = 1;\n");
    const isFlagged = runPreflight(repo).some((problem) =>
      problem.includes("'_bad'"),
    );
    expect(isFlagged).toBe(true);
  });
});

describe("harness setup script merging", () => {
  test("adds missing root harness scripts without changing existing scripts", () => {
    const repo = makeInstallRepo({ build: "vite build" });

    const result = runHarnessSetup(repo);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const scripts = readPackageJsonInRepo(repo).scripts ?? {};
    expect(scripts.build).toBe("vite build");
    expect(scripts.gate).toBe("node harness/harness.mjs gate");
    expect(scripts.setup).toBe("node harness/harness.mjs setup");
    expect(scripts.lint).toBe("npm --prefix harness run lint");
    expect(scripts.run).toBe("node harness/harness.mjs run");
    expect(scripts.status).toBe("node harness/harness.mjs status");
    expect(scripts.test).toBe("npm --prefix harness run test:coverage");
    expect(scripts["test:file"]).toBe("npm --prefix harness run test:file --");
  });

  test("preserves existing test and lint scripts and reports namespaced aliases", () => {
    const repo = makeInstallRepo({
      gate: "node custom-gate.js",
      lint: "eslint app",
      test: "node custom-test.js",
    });

    const result = runHarnessSetup(repo);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    const scripts = readPackageJsonInRepo(repo).scripts ?? {};
    expect(scripts.gate).toBe("node custom-gate.js");
    expect(scripts.lint).toBe("eslint app");
    expect(scripts.test).toBe("node custom-test.js");
    expect(scripts["harness:lint"]).toBe("npm --prefix harness run lint");
    expect(scripts["harness:test"]).toBe(
      "npm --prefix harness run test:coverage",
    );
    expect(output).toContain("script conflict: lint -> harness:lint");
    expect(output).toContain("script conflict: test -> harness:test");
    expect(output).not.toContain("script added: lint");
    expect(output).not.toContain("script added: test");
  });

  test("preserves every existing root script name and only aliases test and lint", () => {
    const repo = makeInstallRepo({
      gate: "node project-gate.js",
      install: "node project-install.js",
      lint: "eslint src",
      run: "node project-run.js",
      status: "node project-status.js",
      test: "node project-test.js",
      "test:file": "node project-test-file.js",
    });

    const result = runHarnessSetup(repo);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const scripts = readPackageJsonInRepo(repo).scripts ?? {};
    expect(scripts.gate).toBe("node project-gate.js");
    expect(scripts.install).toBe("node project-install.js");
    expect(scripts.setup).toBe("node harness/harness.mjs setup");
    expect(scripts.lint).toBe("eslint src");
    expect(scripts.run).toBe("node project-run.js");
    expect(scripts.status).toBe("node project-status.js");
    expect(scripts.test).toBe("node project-test.js");
    expect(scripts["test:file"]).toBe("node project-test-file.js");
    expect(scripts["harness:lint"]).toBe("npm --prefix harness run lint");
    expect(scripts["harness:test"]).toBe(
      "npm --prefix harness run test:coverage",
    );
    expect(Object.hasOwn(scripts, "harness:gate")).toBe(false);
    expect(Object.hasOwn(scripts, "harness:setup")).toBe(false);
    expect(Object.hasOwn(scripts, "harness:run")).toBe(false);
    expect(Object.hasOwn(scripts, "harness:status")).toBe(false);
    expect(Object.hasOwn(scripts, "harness:test:file")).toBe(false);
  });
});

describe("frontend gate shape", () => {
  test("file inputs referenced by full checks exist", () => {
    for (const target of [
      ".github/workflows/ci.yml",
      "frontend/index.html",
      "frontend/package-lock.json",
      "frontend/package.json",
      "harness/tsconfig.app.json",
      "harness/tsconfig.json",
    ]) {
      expect(existsSync(path.join(REPO, target)), target).toBe(true);
    }
  });

  test("full gate selects heavy, networked, and browser checks for package repos", () => {
    const repo = makePackageRootsRepo();
    let selected: Record<string, string[]> | undefined;
    const failures = runGate(repo, (_gateRepo, checks) => {
      selected = pickChecks(checks, [
        "build",
        "coverage",
        "e2e",
        "lighthouse",
        "npm_audit",
        "npm_signatures",
        "osv",
        "pnpm_audit",
        "pnpm_approve_builds",
        "sast",
        "size",
      ]);
      return [];
    });
    expect(failures).toEqual([]);
    expect(Object.keys(selected ?? {}).toSorted()).toEqual([
      "build",
      "coverage",
      "e2e",
      "lighthouse",
      "npm_audit",
      "npm_signatures",
      "osv",
      "pnpm_approve_builds",
      "pnpm_audit",
      "sast",
      "size",
    ]);
    expect(commandText(checkCommand(selected ?? {}, "build"))).toBe(
      "npm --prefix frontend run build",
    );
    expect(commandText(checkCommand(selected ?? {}, "coverage"))).toContain(
      "harness/vitest.config.js --coverage",
    );
    expect(commandText(checkCommand(selected ?? {}, "e2e"))).toContain(
      "harness/playwright.config.js",
    );
    expect(checkCommand(selected ?? {}, "size")).toEqual([
      harnessTool("size-limit"),
    ]);
    expect(commandText(checkCommand(selected ?? {}, "lighthouse"))).toContain(
      "harness/lighthouserc.cjs",
    );
    expect(commandText(checkCommand(selected ?? {}, "npm_audit"))).toBe(
      "npm --prefix frontend audit --audit-level=high",
    );
    expect(commandText(checkCommand(selected ?? {}, "npm_signatures"))).toBe(
      "npm --prefix frontend audit signatures",
    );
    expect(commandText(checkCommand(selected ?? {}, "pnpm_audit"))).toBe(
      `${harnessTool("pnpm")} --dir frontend audit --audit-level high`,
    );
    expect(
      commandText(checkCommand(selected ?? {}, "pnpm_approve_builds")),
    ).toBe(`${harnessTool("pnpm")} --dir frontend approve-builds --all`);
    expect(commandText(checkCommand(selected ?? {}, "sast"))).toContain(
      "semgrep scan --config=p/typescript --config=p/javascript --config=p/security-audit --error --metrics=off",
    );
    expect(commandText(checkCommand(selected ?? {}, "osv"))).toBe(
      "osv-scanner -r .",
    );
  });

  test.each([
    {
      check: "format",
      tool: "prettier",
      required: [".", "--check", "harness/.prettierignore"],
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
        "**/*.css",
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
      required: ["frontend/**/*.html"],
    },
    {
      check: "frontend_types",
      tool: "tsc",
      required: ["-p harness/tsconfig.app.json", "--noEmit"],
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
      check: "package_json",
      tool: "npmPkgJsonLint",
      required: ["."],
    },
    {
      check: "architecture",
      tool: "depcruise",
      required: [
        "frontend/src",
        "--config harness/.dependency-cruiser.cjs",
        "--output-type err",
      ],
    },
    {
      check: "workflow_api",
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
      check: "lockfile",
      tool: "lockfile-lint",
      required: [
        "--path frontend/package-lock.json",
        "--type npm",
        "--allowed-hosts npm",
        "--validate-https",
      ],
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

  test("knip uses generic entry and project globs", () => {
    const config = JSON.parse(readRepo("harness/knip.json")) as {
      entry?: string[];
      ignore?: string[];
      project?: string[];
      workspaces?: unknown;
    };
    expect(config.workspaces).toBeUndefined();
    expect(config.ignore ?? []).not.toContain("harness/**");
    expect(config.entry).toEqual([
      "**/main.ts",
      "**/index.ts",
      "**/cli.ts",
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/*.config.js",
      "**/*.config.cjs",
      "**/*.config.mjs",
      "**/*.config.ts",
      "**/*.mjs",
      "**/*.cjs",
    ]);
    expect(config.entry).not.toContain("*.ts");
    expect(config.project).toEqual([
      "**/*.ts",
      "**/*.mjs",
      "**/*.js",
      "**/*.cjs",
      "**/*.json",
    ]);
    expect(existsSync(path.join(HARNESS, "tmprepo.ts"))).toBe(false);
  });

  test("root script menu is the stable command surface", () => {
    const scripts = readPackageScripts("package.json");
    expect(Object.keys(scripts).toSorted()).toEqual([
      "build",
      "dev",
      "gate",
      "harness:lint",
      "harness:test",
      "lint",
      "preview",
      "run",
      "setup",
      "status",
      "test",
      "test:file",
    ]);
    expect(scripts.test).toBe("npm --prefix harness run test:coverage");
    expect(scripts["test:file"]).toBe("npm --prefix harness run test:file --");
    expect(scripts.lint).toBe("npm --prefix harness run lint");
    expect(scripts.gate).toBe("node harness/harness.mjs gate");
  });

  test("harness package scripts use generic repo-wide file targets", () => {
    const scripts = readPackageScripts("harness/package.json");
    expect(scripts.eslint).toBe(
      "cd .. && harness/node_modules/.bin/eslint . --config harness/eslint.config.js --max-warnings=0",
    );
    expect(scripts.style).toBe(
      'cd .. && harness/node_modules/.bin/stylelint "**/*.css" --config harness/stylelint.config.js --max-warnings=0 --allow-empty-input',
    );
    expect(scripts.html).toBe(
      'cd .. && harness/node_modules/.bin/html-validate --config harness/.htmlvalidate.json "**/*.html"',
    );
    expect(scripts.typecheck).toBe(
      "npm run typecheck:harness && npm run typecheck:project",
    );
    expect(scripts["typecheck:project"]).toBe(
      "cd .. && harness/node_modules/.bin/tsc -p harness/tsconfig.app.json --noEmit",
    );
    expect(scripts["typecheck:frontend"]).toBe("npm run typecheck:project");
    expect(scripts["typecheck:frontend"]).not.toContain(
      "frontend/tsconfig.json",
    );
    expect(scripts["lint:design"]).toBe(
      "cd .. && harness/node_modules/.bin/designmd lint DESIGN.md",
    );
  });

  test("harness app tsconfig owns the repo TypeScript include set and strict flags", () => {
    const config = parseJsonObject("harness/tsconfig.app.json") as {
      compilerOptions?: Record<string, unknown>;
      exclude?: unknown;
      include?: unknown;
    };
    expect(config.include).toEqual(["../**/*.ts"]);
    expect(config.exclude).toEqual(
      expect.arrayContaining(["../harness/**", "../node_modules/**"]),
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

  test("harness tsconfig keeps the required harness compiler flags", () => {
    const harnessConfig = parseJsonObject("harness/tsconfig.json") as {
      compilerOptions?: Record<string, unknown>;
      include?: unknown;
    };

    expect(harnessConfig.include).toEqual(["*.ts"]);
    expect(harnessConfig.compilerOptions).toEqual(
      expect.objectContaining({
        strict: true,
        noImplicitReturns: true,
        noUncheckedSideEffectImports: true,
      }),
    );
  });

  test("frontend keeps app scripts and delegates checks to harness", () => {
    const scripts = readPackageScripts("frontend/package.json");
    expect(Object.keys(scripts).toSorted()).toEqual([
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
    ]);
    expect(scripts.build).toBe("vite build");
    expect(scripts.dev).toContain("vite");
    expect(scripts.test).toContain("../harness");
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

  test.each(["frontend", "harness"])(
    "%s package lock matches manifest root dependencies",
    (root) => {
      const manifest = packageRoot(`${root}/package.json`);
      const lock = lockRootPackage(`${root}/package-lock.json`);
      expect(lock.dependencies ?? {}).toEqual(manifest.dependencies ?? {});
      expect(lock.devDependencies ?? {}).toEqual(
        manifest.devDependencies ?? {},
      );
    },
  );

  test("vitest coverage thresholds are all 100 in exported config", async () => {
    const config = await importedVitestConfig();
    expect(config.test?.coverage?.include).toEqual(["**/*.ts"]);
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

  test("eslint config limits directory-specific weakening to harness tooling", async () => {
    const config = await importedEslintConfig();
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

  test("eslint exported config rejects unused disable comments", async () => {
    const config = await importedEslintConfig();
    const hasPolicy = config.some(
      (block) => block.linterOptions?.reportUnusedDisableDirectives === "error",
    );
    expect(hasPolicy).toBe(true);
  });

  test("eslint exported config blocks production imports from tests", async () => {
    const config = await importedEslintConfig();
    const sourceBlock = config.find((block) =>
      Array.isArray(block.rules?.["no-restricted-imports"]),
    );
    expect(sourceBlock?.rules?.["no-restricted-imports"]).toEqual([
      "error",
      expect.objectContaining({
        patterns: expect.arrayContaining([
          expect.objectContaining({
            group: ["*.test", "*.test.*", "*.spec", "*.spec.*"],
          }),
        ]),
      }),
    ]);
  });

  test("git hooks are two simple entrypoints", () => {
    const hooks = readdirSync(path.join(REPO, ".githooks")).toSorted();
    expect(hooks).toEqual(["pre-commit", "pre-push"]);
    expect(readRepo(".githooks/pre-commit")).toBe(
      "#!/bin/sh\nset -eu\n\nharness preflight\n",
    );
    expect(readRepo(".githooks/pre-push")).toBe(
      "#!/bin/sh\nset -eu\n\nharness gate\n",
    );
  });

  test("pre-push and GitHub CI use the JavaScript gate", () => {
    const prePush = readRepo(".githooks/pre-push");
    const githubCi = readRepo(".github/workflows/ci.yml");
    expect(prePush).toBe("#!/bin/sh\nset -eu\n\nharness gate\n");
    expect(githubCi).toContain("node harness/harness.mjs gate");
    expect(githubCi).not.toContain("npm run gate");
  });

  test("GitHub CI installs the root workspace before the gate", () => {
    const githubCi = readRepo(".github/workflows/ci.yml");
    expect(githubCi).toContain("cache-dependency-path: package-lock.json");
    expect(githubCi).toContain("run: npm ci");
    expect(githubCi).not.toContain("**/package-lock.json");
    expect(githubCi).not.toContain("npm ci --prefix");
  });

  test("GitHub CI runs browser setup and gate through the harness", () => {
    const githubCi = readRepo(".github/workflows/ci.yml");
    expect(githubCi).toContain(
      "run: npm --prefix harness run setup:e2e -- chromium",
    );
    expect(githubCi).toContain("run: node harness/harness.mjs gate");
  });
});
