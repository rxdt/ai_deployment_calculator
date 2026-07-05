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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const FIXED_NOW = 1_782_475_200_000;
// ANSI stripping is done by scanning (see withoutAnsi below) rather than a
// regex, to avoid a control-character regex literal in source.
const ESCAPE = 27;
const CSI_INTRODUCER = 0x5b;
const csiRuns: readonly [number, number][] = [
  [0x30, 0x3f],
  [0x20, 0x2f],
];
const CSI_FINAL: readonly [number, number] = [0x40, 0x7e];

const isWithin = (
  code: number,
  [min, max]: readonly [number, number],
): boolean => code >= min && code <= max;

// Return the index just past a CSI escape sequence starting at `start`, or the
// same `start` if the bytes there are not a complete "ESC [ ... final" sequence.
const csiSequenceEnd = (value: string, start: number): number => {
  if (
    value.codePointAt(start) !== ESCAPE ||
    value.codePointAt(start + 1) !== CSI_INTRODUCER
  ) {
    return start;
  }
  let cursor = start + 2;
  for (const range of csiRuns) {
    while (
      cursor < value.length &&
      isWithin(value.codePointAt(cursor) ?? -1, range)
    ) {
      cursor += 1;
    }
  }
  if (
    cursor < value.length &&
    isWithin(value.codePointAt(cursor) ?? -1, CSI_FINAL)
  ) {
    return cursor + 1;
  }
  return start;
};

/**

* Strip ANSI CSI escape sequences without a control-character regex literal;
* plain text passes through unchanged.
* @param value
*/
function withoutAnsi(value: string): string {
  let result = "";
  let index = 0;
  while (index < value.length) {
    const end = csiSequenceEnd(value, index);
    if (end > index) {
      index = end;
    } else {
      result += value.charAt(index);
      index += 1;
    }
  }
  return result;
}

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

// Invoke the harness CLI by path (no global `harness` symlink; template must be self-contained).
const harnessCli = (
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): SpawnSyncReturns<string> =>
  spawnSync(
    process.execPath,
    [path.join(repoRoot(process.cwd()), "harness", "harness.mjs"), ...args],
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
    const packageJson: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
    if (!isPlainObject(packageJson)) {
      throw new Error("expected package.json to be an object");
    }
    const bin = isPlainObject(packageJson.bin) ? packageJson.bin : {};
    const devDependencies = isPlainObject(packageJson.devDependencies)
      ? packageJson.devDependencies
      : {};
    const binPath = bin.harness;

    expect(binPath).toBe("./harness.mjs");
    expect(devDependencies.tsx).toBe("latest");
    expect(
      existsSync(
        path.join(packageRoot, typeof binPath === "string" ? binPath : ""),
      ),
    ).toBe(true);
  });

  test("the root workspace exposes the harness executable", () => {
    const packagePath = path.join(import.meta.dirname, "..", "package.json");
    const packageRoot = path.dirname(packagePath);
    const packageJson: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
    if (!isPlainObject(packageJson)) {
      throw new Error("expected package.json to be an object");
    }
    const bin = isPlainObject(packageJson.bin) ? packageJson.bin : {};
    const binPath = bin.harness;

    expect(binPath).toBe("./harness/harness.mjs");
    expect(
      existsSync(
        path.join(packageRoot, typeof binPath === "string" ? binPath : ""),
      ),
    ).toBe(true);
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
        worker: async () => {
          const code = await Promise.resolve(0);
          return code;
        },
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
        worker: async () => {
          const code = await Promise.resolve(0);
          return code;
        },
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
        const code = await Promise.resolve(7);
        return code;
      },
    });

    const day = "/repo/scratchpad/runs/codex/2026-06-26";
    const log = `${day}/0003.jsonl`;
    const codexAgent = AGENTS.codex;
    if (codexAgent === undefined) {
      throw new Error("codex agent preset missing");
    }
    expect(ensured).toBe(day);
    expect(listed).toBe(day);
    expect(launched).toEqual({
      command: ["/repo/harness/ralph.sh", "3", "10", ...codexAgent],
      cwd: "/repo",
      log,
      isVerbose: false,
    });
    expect(result).toEqual({
      code: 7,
      lines: [
        `harness: /repo/harness/ralph.sh 3 10 ${codexAgent.join(" ")} -> ${log}`,
      ],
    });
  });
});

describe("harness command", () => {
  // Runs the real preflight against this repo, where the harness configs exist (a bare temp repo
  // has no harness/ configs, so the lint checks would hard-error rather than exercise the CLI).
  test("preflight", () => {
    const result = harnessCli(["preflight"], { cwd: repoRoot(process.cwd()) });

    expect(result.status).toBe(0);
  }, 60_000);

  // Spawns a real agent subprocess; the default 5s timeout is too tight under the coverage run.
  test("loop", () => {
    const result = harnessCli(["loop", "agy", "1", "1"], {
      cwd: makeRepo(),
    });

    expect(result.status).toBe(0);
  }, 60_000);

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

  // Runs the real setup (reaches `pnpm install`); default 5s is too tight under coverage.
  test("setup", () => {
    const result = harnessCli(["setup"], { cwd: repoRoot(process.cwd()) });

    expect(result.status).toBe(0);
  }, 60_000);

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
    const packageJson: unknown = JSON.parse(
      readFileSync(path.join(repo, "package.json"), "utf8"),
    );
    if (!isPlainObject(packageJson)) {
      throw new Error("expected package.json to be an object");
    }
    const { name } = packageJson;

    expect(result.status).toBe(2);
    expect(result.stderr).toBe("usage: harness setup\n");
    expect(name).toBe("old-project");
  });

  // Runs `pnpm install` twice via real subprocesses; the default 5s timeout is too tight under coverage.
  test("setup twice does not error on the second run", () => {
    const repo = repoRoot(process.cwd());
    harnessCli(["setup"], { cwd: repo });
    const result = harnessCli(["setup"], { cwd: repo });

    expect(result.status).toBe(0);
  }, 60_000);

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
