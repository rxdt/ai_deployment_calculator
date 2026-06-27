// Ports the CLI pass-through behaviour from harness/tests/test_cli.py (preflight/gate dispatch).

import { describe, expect, test } from "vitest";

import {
  AGENTS,
  drainLines,
  formatDate,
  formatLiveLine,
  nextSequence,
  parseCount,
  run,
  runLoop,
  type CliDependencies,
  type RunDependencies,
} from "./cli.ts";

const FIXED_NOW = 1_782_475_200_000;

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
