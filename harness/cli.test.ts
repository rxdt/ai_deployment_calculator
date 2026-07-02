// Ports the CLI pass-through behaviour from harness/tests/test_cli.py (preflight/gate dispatch).

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  AGENTS,
  drainLines,
  formatDate,
  formatLiveLine,
  nextSequence,
  parseCount,
  repoRoot,
  run,
  runLoop,
  main,
} from "./cli.js";
import { gitSafeEnvironment } from "./gate.js";

const FIXED_NOW = 1_782_475_200_000;
const ANSI_PATTERN =
  /\u{1B}\[[\u{30}-\u{3F}]*[\u{20}-\u{2F}]*[\u{40}-\u{7E}]/gu;

/**

* @param value
*/
function withoutAnsi(value: string): string {
  return value.replaceAll(ANSI_PATTERN, "");
}

/**

* @param argv
* @param cwd
*/
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

// Invoke the harness CLI by path (no global `harness` symlink; template must be self-contained).
const harnessCli = (
  arguments_: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): SpawnSyncReturns<string> =>
  spawnSync(
    process.execPath,
    [
      path.join(repoRoot(process.cwd()), "harness", "harness.mjs"),
      ...arguments_,
    ],
    {
      cwd: options.cwd,
      encoding: "utf8",
      ...(options.env !== undefined && { env: options.env }),
    },
  );

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("run", () => {
  test("a clean preflight exits 0 with an ok banner", () => {
    expect(
      run("preflight", {
        preflight: () => [],
        gate: () => [],
        repoRoot: () => "/repo",
      }),
    ).toEqual({ code: 0, lines: ["ok: preflight passed"] });
  });

  test("a failing gate exits 1 and lists each problem", () => {
    const result = run("gate", {
      preflight: () => [],
      gate: () => ["tests failed", "lint failed"],
      repoRoot: () => "/repo",
    });
    expect(result.code).toBe(1);
    expect(result.lines).toEqual([
      "gate: tests failed",
      "gate: lint failed",
      "rejected by harness",
    ]);
  });

  test("an unknown command exits 2 with usage", () => {
    expect(
      run("nope", {
        preflight: () => [],
        gate: () => [],
        repoRoot: () => "/repo",
      }),
    ).toEqual({
      code: 2,
      lines: ["usage: harness <preflight|gate|loop|status|setup>"],
    });
  });

  test("the repo root is resolved from the current working directory", () => {
    let seen: string | undefined;
    run("preflight", {
      preflight: () => [],
      gate: () => [],
      repoRoot: (from) => {
        seen = from;
        return "/repo";
      },
    });
    expect(seen).toBe(process.cwd());
  });
});

describe("run helpers", () => {
  test("pins agent presets", () => {
    expect(AGENTS.claude).toEqual([
      "claude",
      "-p",
      "--permission-mode",
      "acceptEdits",
      // "--bare",
      "--no-session-persistence",
      "--output-format",
      "stream-json",
      "--verbose",
    ]);
    expect(AGENTS.codex).toEqual([
      "env",
      "-u",
      "CODEX_THREAD_ID",
      "-u",
      "CODEX_CONVERSATION_ID",
      "-u",
      "CODEX_SESSION_ID",
      "codex",
      "exec",
      "-m",
      "gpt-5.5",
      "--json",
      "--sandbox",
      "danger-full-access",
      "-",
    ]);
  });

  test("formats dates and sequence numbers", () => {
    expect(formatDate(FIXED_NOW)).toBe("2026-06-26");
    expect(nextSequence([1, 7, 3])).toBe(8);
    expect(nextSequence([])).toBe(1);
  });

  test("parses positive integer counts", () => {
    expect(parseCount(undefined, 20)).toBe(20);
    expect(parseCount("3", 20)).toBe(3);
    expect(parseCount("0", 20)).toBeUndefined();
    expect(parseCount("1.5", 20)).toBeUndefined();
    expect(parseCount("-1", 20)).toBeUndefined();
  });

  test("compacts JSONL and preserves non-JSON lines", () => {
    expect(formatLiveLine('{"b":2, "a":1}\n')).toBe('{"b":2,"a":1}\n');
    expect(formatLiveLine("plain output\n")).toBe("plain output\n");
  });

  test("drains complete lines and returns the partial tail", () => {
    expect(drainLines('{"x":1}\nplain\n{"y"')).toEqual({
      output: '{"x":1}\nplain\n',
      rest: '{"y"',
    });
  });

  test("resolves the repo root for loop cwd and prompt lookup", () => {
    const repo = makeRepo();
    const nested = path.join(repo, "frontend", "harness");
    mkdirSync(nested, { recursive: true });

    expect(realpathSync(repoRoot(nested))).toBe(realpathSync(repo));
  });

  test("the harness package exposes a harness executable", () => {
    const packagePath = path.join(import.meta.dirname, "package.json");
    const packageRoot = path.dirname(packagePath);
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      bin?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const binPath = packageJson.bin?.harness;

    expect(binPath).toBe("./harness.mjs");
    expect(packageJson.devDependencies?.tsx).toBe("latest");
    expect(existsSync(path.join(packageRoot, binPath ?? ""))).toBe(true);
  });

  test("the root workspace exposes the harness executable", () => {
    const packagePath = path.join(import.meta.dirname, "..", "package.json");
    const packageRoot = path.dirname(packagePath);
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      bin?: Record<string, string>;
    };
    const binPath = packageJson.bin?.harness;

    expect(binPath).toBe("./harness/harness.mjs");
    expect(existsSync(path.join(packageRoot, binPath ?? ""))).toBe(true);
  });
});

describe("runLoop", () => {
  test("rejects an unknown agent before launching", async () => {
    await expect(
      runLoop(["wat"], {
        now: () => FIXED_NOW,
        cwd: () => "/repo",
        ralphPath: () => "/repo/harness/ralph.sh",
        listSequences: () => [],
        ensureDirectory: (directory) => directory.length,
        worker: async () => 0,
      }),
    ).resolves.toEqual({
      code: 2,
      lines: ["unknown agent 'wat'; choose from claude, codex, agy, copilot"],
    });
  });

  test("rejects invalid iteration or minute counts", async () => {
    await expect(
      runLoop(["codex", "0"], {
        now: () => FIXED_NOW,
        cwd: () => "/repo",
        ralphPath: () => "/repo/harness/ralph.sh",
        listSequences: () => [],
        ensureDirectory: (directory) => directory.length,
        worker: async () => 0,
      }),
    ).resolves.toEqual({
      code: 2,
      lines: ["num_iterations and max_minutes must be >= 1"],
    });
  });

  test("builds the ralph command and log path", async () => {
    let ensured: string | undefined;
    let listed: string | undefined;
    let launched:
      | { command: string[]; cwd: string; log: string; isVerbose: boolean }
      | undefined;
    const result = await runLoop(["CODEX", "3", "10", "false"], {
      now: () => FIXED_NOW,
      cwd: () => "/repo",
      ralphPath: () => "/repo/harness/ralph.sh",
      listSequences: (directory) => {
        listed = directory;
        return [1, 2];
      },
      ensureDirectory: (directory) => {
        ensured = directory;
      },
      worker: async (command, cwd, log, isVerbose) => {
        launched = { command, cwd, log, isVerbose };
        return 7;
      },
    });

    const day = "/repo/scratchpad/runs/codex/2026-06-26";
    const log = `${day}/0003.jsonl`;
    expect(ensured).toBe(day);
    expect(listed).toBe(day);
    expect(launched).toEqual({
      command: ["/repo/harness/ralph.sh", "3", "10", ...AGENTS.codex],
      cwd: "/repo",
      log,
      isVerbose: false,
    });
    expect(result).toEqual({
      code: 7,
      lines: [
        `harness: /repo/harness/ralph.sh 3 10 ${AGENTS.codex.join(" ")} -> ${log}`,
      ],
    });
  });
});

describe("harness command", () => {
  test("preflight", () => {
    const result = harnessCli(["preflight"], { cwd: makeRepo() });

    expect(result.status).toBe(0);
  });

  test("loop", () => {
    const result = harnessCli(["loop", "agy", "1", "1"], { cwd: makeRepo() });

    expect(result.status).toBe(0);
  });

  test("loop streams and logs agent JSON from stdout and stderr", () => {
    const repo = makeRepo();
    const bin = path.join(repo, "bin");
    mkdirSync(bin);
    writeFileSync(
      path.join(bin, "claude"),
      [
        "#!/bin/sh",
        String.raw`printf '%s\n' '{"stream":"stdout","message":"saved"}'`,
        String.raw`printf '%s\n' '{"stream":"stderr","message":"saved"}' >&2`,
        "",
      ].join("\n"),
      { mode: 0o755 },
    );

    const result = harnessCli(["loop", "claude", "1", "1"], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      },
    });
    const runRoot = path.join(repo, "scratchpad", "runs", "claude");
    const day = readdirSync(runRoot)[0] ?? "";
    const log = path.join(runRoot, day, "0001.jsonl");

    expect(result.status).toBe(0);
    const stdout = withoutAnsi(result.stdout);
    expect(stdout).toContain('{"stream":"stdout","message":"saved"}');
    expect(stdout).toContain('{"stream":"stderr","message":"saved"}');
    expect(readFileSync(log, "utf8")).toContain(
      '{"stream":"stdout","message":"saved"}',
    );
    expect(readFileSync(log, "utf8")).toContain(
      '{"stream":"stderr","message":"saved"}',
    );
  });

  test("status", () => {
    const result = harnessCli(["status"], { cwd: makeRepo() });

    expect(result.status).toBe(0);
  });

  test("setup", () => {
    // Run the real setup so it reaches `npm install` in the actual harness package.
    const result = harnessCli(["setup"], { cwd: repoRoot(process.cwd()) });

    expect(result.status).toBe(0);
  });

  test("setup rejects project name arguments", () => {
    const repo = makeRepo();
    writeFileSync(
      path.join(repo, "package.json"),
      '{ "name": "old-project", "private": true }\n',
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(repoRoot(process.cwd()), "harness", "harness.mjs"),
        "setup",
        "new-project",
      ],
      { cwd: repo, encoding: "utf8" },
    );
    const packageJson = JSON.parse(
      readFileSync(path.join(repo, "package.json"), "utf8"),
    ) as { name?: string };

    expect(result.status).toBe(2);
    expect(result.stderr).toBe("usage: harness setup\n");
    expect(packageJson.name).toBe("old-project");
  });

  test("setup twice does not error on the second run", () => {
    const repo = repoRoot(process.cwd());
    harnessCli(["setup"], { cwd: repo });
    const result = harnessCli(["setup"], { cwd: repo });

    expect(result.status).toBe(0);
  });

  test("main writes status lines to stderr and sets the exit code", async () => {
    const chunks: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });

    await main(["nope"]);

    expect(process.exitCode).toBe(2);
    expect(chunks).toEqual([
      "usage: harness <preflight|gate|loop|status|setup>\n",
    ]);
  });
});
