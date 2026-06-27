// Ports the CLI pass-through behaviour from harness/tests/test_cli.py (preflight/gate dispatch).

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  type CliDependencies,
  type RunDependencies,
} from "./cli.ts";
import { makeRepo } from "./tmprepo.ts";

const FIXED_NOW = 1_782_475_200_000;
const HARNESS_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const RALPH_SCRIPT = path.join(HARNESS_DIRECTORY, "ralph.sh");
const HARNESS_SCRIPT = path.join(HARNESS_DIRECTORY, "harness.mjs");

interface CommandOutput {
  status: number | null;
  stderr: string;
  stdout: string;
}

const dependencies = (
  overrides: Partial<CliDependencies>,
): CliDependencies => ({
  preflight: () => [],
  gate: () => [],
  repoRoot: () => "/repo",
  ...overrides,
});

const runDependencies = (
  overrides: Partial<RunDependencies>,
): RunDependencies => ({
  now: () => FIXED_NOW,
  cwd: () => "/repo",
  ralphPath: () => "/repo/frontend/harness/ralph.sh",
  listSequences: () => [],
  ensureDirectory: (directory) => directory.length,
  worker: async () => {
    const code = await Promise.resolve(0);
    return code;
  },
  ...overrides,
});

function makeTemporaryDirectory(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function writeExecutable(file: string, content: string): void {
  writeFileSync(file, content);
  chmodSync(file, 0o755);
}

function shellPath(binDirectory: string): string {
  return [binDirectory, "/usr/bin", "/bin"].join(path.delimiter);
}

function makeScriptRepo(prompt = "Prompt body\n"): string {
  const repo = makeTemporaryDirectory("ralph-repo-");
  writeFileSync(path.join(repo, "PROMPT.md"), prompt);
  return repo;
}

function makeStubBin(): string {
  const bin = makeTemporaryDirectory("ralph-bin-");
  writeExecutable(
    path.join(bin, "timeout"),
    [
      "#!/bin/sh",
      String.raw`printf "%s\n" "$1" >> "$RALPH_TEST_DIR/timeout-seconds"`,
      "shift",
      'exec "$@"',
      "",
    ].join("\n"),
  );
  writeExecutable(path.join(bin, "jq"), "#!/bin/sh\nexit 1\n");
  return bin;
}

function runRalph(
  arguments_: string[],
  cwd: string,
  binDirectory: string,
): CommandOutput {
  const result = spawnSync("sh", [RALPH_SCRIPT, ...arguments_], {
    cwd,
    encoding: "utf8",
    env: {
      RALPH_TEST_DIR: binDirectory,
      PATH: shellPath(binDirectory),
    },
  });
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

function runHarness(
  arguments_: string[],
  cwd: string,
  binDirectory: string,
): CommandOutput {
  const result = spawnSync(process.execPath, [HARNESS_SCRIPT, ...arguments_], {
    cwd,
    encoding: "utf8",
    env: {
      PATH: shellPath(binDirectory),
      RALPH_TEST_DIR: binDirectory,
    },
  });
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

function makeHarnessRepo(): string {
  const repo = makeRepo();
  writeFileSync(path.join(repo, "PROMPT.md"), "Harness prompt\n");
  return realpathSync(repo);
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("run", () => {
  test("a clean preflight exits 0 with an ok banner", () => {
    expect(run("preflight", dependencies({}))).toEqual({
      code: 0,
      lines: ["ok: preflight passed"],
    });
  });

  test("a failing gate exits 1 and lists each problem", () => {
    const result = run(
      "gate",
      dependencies({ gate: () => ["tests failed", "lint failed"] }),
    );
    expect(result.code).toBe(1);
    expect(result.lines).toEqual([
      "gate: tests failed",
      "gate: lint failed",
      "rejected by harness",
    ]);
  });

  test("an unknown command exits 2 with usage", () => {
    expect(run("nope", dependencies({}))).toEqual({
      code: 2,
      lines: ["usage: harness <preflight|gate|run>"],
    });
  });

  test("the repo root is resolved from the current working directory", () => {
    let seen: string | undefined;
    const recordingRoot = (from: string): string => {
      seen = from;
      return "/repo";
    };
    run("preflight", dependencies({ repoRoot: recordingRoot }));
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
      "--output-format",
      "stream-json",
      "--verbose",
    ]);
    expect(AGENTS.codex).toEqual([
      "codex",
      "exec",
      "-m",
      "gpt-5.5",
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
      "--dangerously-bypass-hook-trust",
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
  });

  test("compacts JSONL and preserves non-JSON lines", () => {
    expect(formatLiveLine('{"b":2, "a":1}\n')).toBe('{"b":2,"a":1}\n');
    expect(formatLiveLine("plain output\n")).toBe("plain output\n");
  });

  test("formats live JSONL through jq when it is available", () => {
    const bin = makeTemporaryDirectory("harness-jq-");
    const jq = path.join(bin, "jq");
    writeExecutable(
      jq,
      [
        "#!/bin/sh",
        "while IFS= read -r _line; do",
        String.raw`  printf "jq-rendered\n"`,
        "done",
        "",
      ].join("\n"),
    );

    expect(formatLiveLine('{"a":1}\n', jq)).toBe("jq-rendered\n");
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

  test("the frontend package exposes a harness executable", () => {
    const packagePath = fileURLToPath(
      new URL("../package.json", import.meta.url),
    );
    const packageRoot = path.dirname(packagePath);
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      bin?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const binPath = packageJson.bin?.harness;

    expect(binPath).toBe("./harness/harness.mjs");
    expect(packageJson.devDependencies?.tsx).toBe("latest");
    expect(existsSync(path.join(packageRoot, binPath ?? ""))).toBe(true);
  });
});

describe("ralph.sh", () => {
  test("prints defaults and usage failure when no agent command is provided", () => {
    const result = runRalph([], makeScriptRepo(), makeStubBin());

    expect(result.status).toBe(2);
    expect(result.stderr).toBe(
      "defaults: max_iterations=2 max_minutes_per_iteration=20\n",
    );
  });

  test("fails before looping when no timeout command is available", () => {
    const result = runRalph(
      ["agent"],
      makeScriptRepo(),
      makeTemporaryDirectory("ralph-bin-"),
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toBe("ralph: need gtimeout or timeout\n");
  });

  test("uses gtimeout first and passes prompt, argv, timeout, and loop environment", () => {
    const repo = makeScriptRepo("Deploy calculator prompt\n");
    const bin = makeStubBin();
    writeExecutable(
      path.join(bin, "gtimeout"),
      [
        "#!/bin/sh",
        String.raw`printf "gtimeout\n" >> "$RALPH_TEST_DIR/timeout-name"`,
        String.raw`printf "%s\n" "$1" >> "$RALPH_TEST_DIR/timeout-seconds"`,
        "shift",
        'exec "$@"',
        "",
      ].join("\n"),
    );
    writeExecutable(
      path.join(bin, "agent"),
      [
        "#!/bin/sh",
        String.raw`printf "loop=%s\n" "$RALPH_LOOP" >> "$RALPH_TEST_DIR/worker-env"`,
        'printf "argv:" >> "$RALPH_TEST_DIR/worker-argv"',
        'for arg do printf "<%s>" "$arg" >> "$RALPH_TEST_DIR/worker-argv"; done',
        String.raw`printf "\n" >> "$RALPH_TEST_DIR/worker-argv"`,
        String.raw`while IFS= read -r line; do printf "%s\n" "$line" >> "$RALPH_TEST_DIR/worker-input"; done`,
        "",
      ].join("\n"),
    );

    const result = runRalph(["agent", "--flag", "two words"], repo, bin);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("ralph: iteration 1/2\n");
    expect(result.stderr).toContain("ralph: completed 2 iteration(s)\n");
    expect(readFileSync(path.join(bin, "timeout-name"), "utf8")).toBe(
      "gtimeout\ngtimeout\n",
    );
    expect(readFileSync(path.join(bin, "timeout-seconds"), "utf8")).toBe(
      "1200\n1200\n",
    );
    expect(readFileSync(path.join(bin, "worker-env"), "utf8")).toBe(
      "loop=1\nloop=1\n",
    );
    expect(readFileSync(path.join(bin, "worker-argv"), "utf8")).toBe(
      "argv:<--flag><two words>\nargv:<--flag><two words>\n",
    );
    expect(readFileSync(path.join(bin, "worker-input"), "utf8")).toBe(
      [
        "Deploy calculator prompt",
        "",
        "RALPH_ITERATION=1/2",
        "Deploy calculator prompt",
        "",
        "RALPH_ITERATION=2/2",
        "",
      ].join("\n"),
    );
  });

  test("rejects non-positive loop bounds before resolving timeout", () => {
    const result = runRalph(
      ["0", "1", "agent"],
      makeScriptRepo(),
      makeTemporaryDirectory("ralph-bin-"),
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toBe(
      "ralph: max_iterations and max_minutes must be >= 1\n",
    );
  });

  test("propagates worker failure and stops after the failing iteration", () => {
    const repo = makeScriptRepo();
    const bin = makeStubBin();
    writeExecutable(
      path.join(bin, "agent"),
      [
        "#!/bin/sh",
        String.raw`printf "ran\n" >> "$RALPH_TEST_DIR/worker-runs"`,
        "exit 7",
        "",
      ].join("\n"),
    );

    const result = runRalph(["3", "1", "agent"], repo, bin);

    expect(result.status).toBe(7);
    expect(result.stderr).toBe("ralph: iteration 1/3\n");
    expect(readFileSync(path.join(bin, "timeout-seconds"), "utf8")).toBe(
      "60\n",
    );
    expect(readFileSync(path.join(bin, "worker-runs"), "utf8")).toBe("ran\n");
  });

  test("missing prompt stops the loop before the worker starts", () => {
    const repo = makeTemporaryDirectory("ralph-repo-");
    const bin = makeStubBin();
    writeExecutable(
      path.join(bin, "agent"),
      [
        "#!/bin/sh",
        String.raw`printf "unexpected\n" >> "$RALPH_TEST_DIR/worker-runs"`,
        "",
      ].join("\n"),
    );

    const result = runRalph(["agent"], repo, bin);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("ralph: iteration 1/2\n");
    expect(result.stderr).toContain("PROMPT.md");
    expect(existsSync(path.join(bin, "worker-runs"))).toBe(false);
  });

  test("is valid POSIX sh syntax", () => {
    const result = spawnSync("sh", ["-n", RALPH_SCRIPT], {
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});

describe("runLoop", () => {
  test("rejects an unknown agent before launching", async () => {
    await expect(runLoop(["wat"], runDependencies({}))).resolves.toEqual({
      code: 2,
      lines: ["unknown agent 'wat'; choose from claude, codex, agy, copilot"],
    });
  });

  test("rejects invalid iteration or minute counts", async () => {
    await expect(runLoop(["codex", "0"], runDependencies({}))).resolves.toEqual(
      {
        code: 2,
        lines: ["num_iterations and max_minutes must be >= 1"],
      },
    );
  });

  test("builds the ralph command and log path", async () => {
    let ensured: string | undefined;
    let listed: string | undefined;
    let launched:
      | {
          command: string[];
          cwd: string;
          log: string;
          isVerbose: boolean;
        }
      | undefined;
    const result = await runLoop(
      ["CODEX", "3", "10", "false"],
      runDependencies({
        listSequences: (directory) => {
          listed = directory;
          return [1, 2];
        },
        ensureDirectory: (directory) => {
          ensured = directory;
        },
        worker: async (command, cwd, log, isVerbose) => {
          launched = { command, cwd, log, isVerbose };
          const code = await Promise.resolve(7);
          return code;
        },
      }),
    );

    const day = "/repo/scratchpad/runs/codex/2026-06-26";
    const log = `${day}/0003.jsonl`;
    expect(ensured).toBe(day);
    expect(listed).toBe(day);
    expect(launched).toEqual({
      command: ["/repo/frontend/harness/ralph.sh", "3", "10", ...AGENTS.codex],
      cwd: "/repo",
      log,
      isVerbose: false,
    });
    expect(result).toEqual({
      code: 7,
      lines: [
        `harness: /repo/frontend/harness/ralph.sh 3 10 ${AGENTS.codex.join(" ")} -> ${log}`,
      ],
    });
  });
});

describe("harness run integration", () => {
  test("creates the run directory, increments logs, and tees child stdout", () => {
    const repo = makeHarnessRepo();
    const dayDirectory = path.join(
      repo,
      "scratchpad",
      "runs",
      "agy",
      formatDate(Date.now()),
    );
    mkdirSync(dayDirectory, { recursive: true });
    writeFileSync(path.join(dayDirectory, "0001.jsonl"), "old\n");
    const bin = makeStubBin();
    writeExecutable(
      path.join(bin, "agy"),
      ["#!/bin/sh", String.raw`printf "{\"b\":2, \"a\":1}\npartial"`, ""].join(
        "\n",
      ),
    );

    const result = runHarness(["run", "agy", "1", "1"], repo, bin);
    const log = path.join(dayDirectory, "0002.jsonl");

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(` -> ${log}\n`);
    expect(result.stdout).toBe('{"b":2,"a":1}\npartial');
    expect(existsSync(dayDirectory)).toBe(true);
    expect(readFileSync(log, "utf8")).toBe('{"b":2, "a":1}\npartial');
  });

  test("flushes partial-line output to the log when verbose streaming is disabled", () => {
    const repo = makeHarnessRepo();
    const bin = makeStubBin();
    writeExecutable(
      path.join(bin, "agy"),
      ["#!/bin/sh", 'printf "no-newline-tail"', ""].join("\n"),
    );

    const result = runHarness(["run", "agy", "1", "1", "false"], repo, bin);
    const log = path.join(
      repo,
      "scratchpad",
      "runs",
      "agy",
      formatDate(Date.now()),
      "0001.jsonl",
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(readFileSync(log, "utf8")).toBe("no-newline-tail");
  });

  test("propagates the worker exit code through the CLI process", () => {
    const repo = makeHarnessRepo();
    const bin = makeStubBin();
    writeExecutable(
      path.join(bin, "agy"),
      ["#!/bin/sh", String.raw`printf "failing\n"`, "exit 9", ""].join("\n"),
    );

    const result = runHarness(["run", "agy", "1", "1", "false"], repo, bin);

    expect(result.status).toBe(9);
    expect(result.stderr).toContain("harness: ");
  });

  test("main writes status lines to stderr and sets the exit code", async () => {
    const chunks: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });

    await main(["nope"]);

    expect(process.exitCode).toBe(2);
    expect(chunks).toEqual(["usage: harness <preflight|gate|run>\n"]);
  });
});
