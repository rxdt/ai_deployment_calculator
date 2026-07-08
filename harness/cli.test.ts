// Ports the CLI pass-through behaviour from harness/tests/test_cli.py (preflight/gate dispatch).

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  addRootScripts,
  AGENTS,
  drainLines,
  formatDate,
  formatLiveLine,
  installPackages,
  mergeRootScripts,
  nextSequence,
  parseCount,
  repoRoot,
  loopDependencies,
  run,
  runLoop,
  runSetup,
  runStatus,
  runWorker,
  main,
} from "./cli.js";
import * as gate from "./gate.js";
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
  // Write identity straight into .git/config (one syscall) instead of two `git config` subprocesses.
  appendFileSync(
    path.join(repo, ".git", "config"),
    "[user]\n\temail = harness@test.local\n\tname = harness-test\n",
  );
  writeFileSync(path.join(repo, "README.md"), "seed\n");
  // ralph reads PROMPT.md up front and fails the loop if it is missing (set -e),
  // so every repo that runs the loop needs one.
  writeFileSync(path.join(repo, "PROMPT.md"), "do the work\n");
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

// Write an executable stub script into a repo's bin dir and return its path.
const writeStub = (repo: string, name: string, body: string): string => {
  const bin = path.join(repo, "bin");
  mkdirSync(bin, { recursive: true });
  const file = path.join(bin, name);
  writeFileSync(file, body, { mode: 0o755 });
  return file;
};

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("runWorker (in-process, mocked agent)", () => {
  test("streams JSON lines, logs them, and returns the agent exit code", async () => {
    const repo = makeRepo();
    const agent = writeStub(
      repo,
      "agent",
      [
        "#!/bin/sh",
        String.raw`printf '%s\n' '{"b":2, "a":1}'`,
        // No trailing newline: leaves a partial line in the buffer that must be flushed at close.
        `printf '%s' 'partial-no-newline'`,
        String.raw`printf 'to-stderr\n' >&2`,
        "exit 0",
      ].join("\n"),
    );
    const log = path.join(repo, "run.jsonl");
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });

    const code = await runWorker([agent], repo, log, true);

    expect(code).toBe(0);
    // JSON is compacted; the trailing partial line (no newline) is flushed too.
    expect(out.join("")).toContain('{"b":2,"a":1}');
    expect(out.join("")).toContain("partial-no-newline");
    expect(readFileSync(log, "utf8")).toContain("to-stderr");
  });

  test("flushes a trailing partial line to stdout when verbose", async () => {
    const repo = makeRepo();
    // Emit a single line with no trailing newline: it never completes a line during streaming,
    // so it stays buffered and is only surfaced by the end-of-stream flush.
    const agent = writeStub(
      repo,
      "agent",
      "#!/bin/sh\nprintf '%s' 'only-partial-line'\nexit 0\n",
    );
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });

    await runWorker([agent], repo, path.join(repo, "run.jsonl"), true);

    expect(out.join("")).toContain("only-partial-line");
  });

  test("does not echo to stdout when not verbose, but still logs", async () => {
    const repo = makeRepo();
    const agent = writeStub(
      repo,
      "agent",
      ["#!/bin/sh", String.raw`printf 'quiet\n'`, "exit 0"].join("\n"),
    );
    const log = path.join(repo, "run.jsonl");
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });

    const code = await runWorker([agent], repo, log, false);

    expect(code).toBe(0);
    expect(out.join("")).not.toContain("quiet");
    expect(readFileSync(log, "utf8")).toContain("quiet");
  });

  test("logs a failing agent's exit code but returns 0 so the loop continues", async () => {
    const repo = makeRepo();
    const agent = writeStub(repo, "agent", "#!/bin/sh\nexit 5\n");
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    const code = await runWorker(
      [agent],
      repo,
      path.join(repo, "run.jsonl"),
      false,
    );

    expect(code).toBe(0);
    expect(stderr.join("")).toContain("agent exited 5");
  });

  test("logs a signal-killed agent but returns 0", async () => {
    const repo = makeRepo();
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    // The agent kills itself with SIGTERM. That is logged for visibility, but the loop continues.
    const agent = writeStub(repo, "agent", "#!/bin/sh\nkill -TERM $$\n");

    const code = await runWorker(
      [agent],
      repo,
      path.join(repo, "run.jsonl"),
      false,
    );

    expect(code).toBe(0);
    expect(stderr.join("")).toContain("agent exited SIGTERM");
  });

  test("reports when the agent binary cannot be spawned but returns 0", async () => {
    const repo = makeRepo();
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    const code = await runWorker(
      [path.join(repo, "bin", "does-not-exist")],
      repo,
      path.join(repo, "run.jsonl"),
      false,
    );

    expect(code).toBe(0);
    expect(stderr.join("")).toContain("agent did not run");
  });
});

describe("setup helpers (in-process)", () => {
  test("mergeRootScripts adds missing scripts and aliases existing lint/test", () => {
    const merged = mergeRootScripts({ lint: "existing-lint" });

    expect(merged.gate).toBe("node harness/harness.mjs gate");
    // An existing `lint` is preserved; the harness command lands under `harness:lint`.
    expect(merged.lint).toBe("existing-lint");
    expect(merged["harness:lint"]).toBe("pnpm --prefix harness run lint");
  });

  test("mergeRootScripts aliases an existing test script too", () => {
    const merged = mergeRootScripts({ test: "vitest" });

    // The existing `test` is preserved; the harness command lands under `harness:test`.
    expect(merged.test).toBe("vitest");
    expect(merged["harness:test"]).toBe(
      "pnpm --prefix harness run test:coverage",
    );
  });

  test("mergeRootScripts leaves a non-lint/test conflict as-is (no alias)", () => {
    // An existing `gate` is neither lint nor test, so it is kept and gets no harness: alias.
    const merged = mergeRootScripts({ gate: "custom-gate" });

    expect(merged.gate).toBe("custom-gate");
    expect(merged["harness:gate"]).toBeUndefined();
  });

  test("addRootScripts writes merged scripts into the root package.json", () => {
    const repo = makeRepo();
    writeFileSync(
      path.join(repo, "package.json"),
      '{ "name": "demo", "private": true, "scripts": { "lint": "x" } }\n',
    );

    expect(addRootScripts(repo)).toBe(0);
    const parsed: unknown = JSON.parse(
      readFileSync(path.join(repo, "package.json"), "utf8"),
    );
    if (!isPlainObject(parsed) || !isPlainObject(parsed.scripts)) {
      throw new Error("expected package.json with scripts");
    }
    expect(parsed.scripts.gate).toBe("node harness/harness.mjs gate");
    expect(parsed.scripts["harness:lint"]).toBe(
      "pnpm --prefix harness run lint",
    );
  });

  test("addRootScripts fails when the root package.json is unreadable", () => {
    const repo = makeRepo();
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    // No package.json in a fresh repo -> read fails.
    expect(addRootScripts(repo)).toBe(1);
    expect(stderr.join("")).toContain("cannot read root package.json");
  });

  test("addRootScripts fails when package.json is not an object", () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo, "package.json"), "[1, 2, 3]\n");
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    expect(addRootScripts(repo)).toBe(1);
    expect(stderr.join("")).toContain("not an object");
  });

  test("installPackages reports a spawn error (pnpm not found)", () => {
    const repo = makeRepo();
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    // No pnpm on PATH -> spawnSync sets result.error; installPackages must report it as failure.
    const priorPath = process.env.PATH;
    process.env.PATH = "/nonexistent-harness-install-path";
    try {
      expect(installPackages(repo)).not.toBe(0);
    } finally {
      if (priorPath !== undefined) process.env.PATH = priorPath;
    }
    expect(stderr.join("")).toContain("pnpm install failed");
  });

  test("installPackages surfaces a nonzero pnpm exit as failure", () => {
    const repo = makeRepo();
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    // Stub `pnpm` on PATH to fail, so installPackages returns its nonzero status.
    writeStub(repo, "pnpm", "#!/bin/sh\necho boom >&2\nexit 4\n");
    const priorPath = process.env.PATH;
    process.env.PATH = `${path.join(repo, "bin")}${path.delimiter}${priorPath ?? ""}`;
    try {
      expect(installPackages(repo)).toBe(4);
    } finally {
      if (priorPath !== undefined) process.env.PATH = priorPath;
    }
    expect(stderr.join("")).toContain("pnpm install failed");
  });
});

describe("runSetup guards (in-process)", () => {
  test("rejects setup arguments before doing any work", () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    expect(runSetup(["new-project"])).toBe(2);
    expect(stderr.join("")).toBe("usage: harness setup\n");
  });

  test("refuses to run inside the agent loop", () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    const prior = process.env.RALPH_LOOP;
    process.env.RALPH_LOOP = "1";
    try {
      expect(runSetup([])).toBe(2);
    } finally {
      if (prior === undefined) delete process.env.RALPH_LOOP;
      else process.env.RALPH_LOOP = prior;
    }
    expect(stderr.join("")).toContain("must not run inside the agent loop");
  });

  test("completes: merges scripts, installs, and wires the git hooks path", () => {
    const repo = makeRepo();
    writeFileSync(
      path.join(repo, "package.json"),
      '{ "name": "demo", "private": true }\n',
    );
    // Stub pnpm to succeed so installPackages returns 0 without a real network install.
    writeStub(repo, "pnpm", "#!/bin/sh\nexit 0\n");
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    const restore = process.cwd();
    const priorPath = process.env.PATH;
    process.chdir(repo);
    process.env.PATH = `${path.join(repo, "bin")}${path.delimiter}${priorPath ?? ""}`;
    try {
      expect(runSetup([])).toBe(0);
    } finally {
      process.chdir(restore);
      if (priorPath !== undefined) process.env.PATH = priorPath;
    }
    expect(runCommand(["git", "config", "core.hooksPath"], repo).trim()).toBe(
      ".githooks",
    );
    expect(stderr.join("")).toContain("git hooks path: .githooks");
  });

  test("leaves an existing custom git hooks path untouched", () => {
    const repo = makeRepo();
    writeFileSync(
      path.join(repo, "package.json"),
      '{ "name": "demo", "private": true }\n',
    );
    writeStub(repo, "pnpm", "#!/bin/sh\nexit 0\n");
    // A pre-set, non-default hooksPath must be preserved (setup only sets it when unset/default).
    runCommand(["git", "config", "core.hooksPath", "custom-hooks"], repo);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const restore = process.cwd();
    const priorPath = process.env.PATH;
    process.chdir(repo);
    process.env.PATH = `${path.join(repo, "bin")}${path.delimiter}${priorPath ?? ""}`;
    try {
      expect(runSetup([])).toBe(0);
    } finally {
      process.chdir(restore);
      if (priorPath !== undefined) process.env.PATH = priorPath;
    }
    expect(runCommand(["git", "config", "core.hooksPath"], repo).trim()).toBe(
      "custom-hooks",
    );
  });

  test("stops with the script-merge failure code before installing", () => {
    const repo = makeRepo();
    // No package.json -> addRootScripts fails, so setup returns its code without installing.
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const restore = process.cwd();
    process.chdir(repo);
    try {
      expect(runSetup([])).toBe(1);
    } finally {
      process.chdir(restore);
    }
  });

  test("stops with the install failure code", () => {
    const repo = makeRepo();
    writeFileSync(
      path.join(repo, "package.json"),
      '{ "name": "demo", "private": true }\n',
    );
    // pnpm stub fails, so installPackages returns nonzero and setup stops there.
    writeStub(repo, "pnpm", "#!/bin/sh\nexit 7\n");
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const restore = process.cwd();
    const priorPath = process.env.PATH;
    process.chdir(repo);
    process.env.PATH = `${path.join(repo, "bin")}${path.delimiter}${priorPath ?? ""}`;
    try {
      expect(runSetup([])).toBe(7);
    } finally {
      process.chdir(restore);
      if (priorPath !== undefined) process.env.PATH = priorPath;
    }
  });
});

describe("main dispatch (in-process)", () => {
  test("status writes the run-log summary and sets exit 0", async () => {
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    const restore = process.cwd();
    process.chdir(makeRepo());
    try {
      await main(["status"]);
    } finally {
      process.chdir(restore);
    }
    expect(process.exitCode).toBe(0);
    expect(out.join("")).toContain("run log(s)");
  });

  test("setup with an argument dispatches to runSetup and exits 2", async () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    await main(["setup", "extra-arg"]);

    expect(process.exitCode).toBe(2);
    expect(stderr.join("")).toContain("usage: harness setup");
  });

  test("preflight dispatches through run and reports the banner", async () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    // Stub the gate so this exercises main's preflight dispatch, not the real (slow) checks.
    vi.spyOn(gate, "runPreflight").mockReturnValue([]);
    vi.spyOn(gate, "runGit").mockReturnValue("/repo\n");

    await main(["preflight"]);

    expect(process.exitCode).toBe(0);
    expect(stderr.join("")).toContain("ok: preflight passed");
  });

  test("gate dispatch reports rejection and sets exit 1", async () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    vi.spyOn(gate, "runGate").mockReturnValue(["boom failed"]);
    vi.spyOn(gate, "runGit").mockReturnValue("/repo\n");

    await main(["gate"]);

    expect(process.exitCode).toBe(1);
    expect(stderr.join("")).toContain("rejected by harness");
  });

  test("loop dispatches through runLoop with the real dependencies", async () => {
    const repo = makeRepo();
    writeStub(repo, "agy", "#!/bin/sh\nexit 0\n");
    // Pre-seed an existing run log so the real listSequences closure parses it and the next
    // sequence increments past it.
    const seeded = path.join(
      repo,
      "scratchpad",
      "runs",
      "agy",
      formatDate(Date.now()),
    );
    mkdirSync(seeded, { recursive: true });
    writeFileSync(path.join(seeded, "0001.jsonl"), "{}\n");
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    const restore = process.cwd();
    const priorPath = process.env.PATH;
    process.chdir(repo);
    process.env.PATH = `${path.join(repo, "bin")}${path.delimiter}${priorPath ?? ""}`;
    try {
      await main(["loop", "agy", "1", "1"]);
    } finally {
      process.chdir(restore);
      if (priorPath !== undefined) process.env.PATH = priorPath;
    }
    expect(process.exitCode).toBe(0);
    expect(stderr.join("")).toContain("ralph.sh");
  }, 60_000);

  test("aborts the iteration without running the agent when PROMPT.md is missing", () => {
    const repo = makeRepo();
    // ralph reads PROMPT.md up front (set -e), so a missing prompt must fail the iteration before
    // the agent runs. The stub touches a sentinel if it runs; we assert it never does.
    const ran = path.join(repo, "agent-ran");
    writeStub(repo, "agy", `#!/bin/sh\ntouch "${ran}"\n`);
    rmSync(path.join(repo, "PROMPT.md"));

    const result = harnessCli(["loop", "agy", "1", "1"], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${path.join(repo, "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
      },
    });

    // The loop never aborts the harness (always exits 0), but ralph's failure is logged and the
    // agent never ran because the prompt could not be read.
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("agent exited");
    expect(existsSync(ran)).toBe(false);
  }, 60_000);

  test("feeds PROMPT.md to the agent on stdin", async () => {
    const repo = makeRepo();
    // The agent stub records its stdin so we can prove ralph delivered the prompt (not that the
    // test passes only because PROMPT.md is absent and ralph tolerates a missing file).
    const captured = path.join(repo, "stdin.txt");
    writeStub(repo, "agy", `#!/bin/sh\ncat > "${captured}"\n`);
    const marker = "PROMPT_MARKER_do_the_work";
    writeFileSync(path.join(repo, "PROMPT.md"), `${marker}\n`);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const restore = process.cwd();
    const priorPath = process.env.PATH;
    process.chdir(repo);
    process.env.PATH = `${path.join(repo, "bin")}${path.delimiter}${priorPath ?? ""}`;
    try {
      await main(["loop", "agy", "1", "1"]);
    } finally {
      process.chdir(restore);
      if (priorPath !== undefined) process.env.PATH = priorPath;
    }
    expect(process.exitCode).toBe(0);
    const stdin = readFileSync(captured, "utf8");
    expect(stdin).toContain(marker);
    expect(stdin).toContain("RALPH_ITERATION=1/1");
  }, 60_000);
});

describe("loopDependencies (in-process)", () => {
  test("listSequences returns [] for a directory that does not exist", () => {
    const missing = path.join(tmpdir(), "harness-no-such-dir-xyz");
    expect(loopDependencies().listSequences(missing)).toEqual([]);
  });

  test("listSequences parses numeric .jsonl names and ignores others", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "harness-seq-"));
    writeFileSync(path.join(directory, "0003.jsonl"), "{}\n");
    writeFileSync(path.join(directory, "0007.jsonl"), "{}\n");
    writeFileSync(path.join(directory, "notes.txt"), "x\n");

    expect(
      loopDependencies()
        .listSequences(directory)
        .toSorted((a, b) => a - b),
    ).toEqual([3, 7]);
  });
});

describe("runStatus (in-process)", () => {
  test("reports zero logs for a fresh repo", () => {
    const repo = makeRepo();
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    const restore = process.cwd();
    process.chdir(repo);
    try {
      expect(runStatus()).toBe(0);
    } finally {
      process.chdir(restore);
    }
    expect(out.join("")).toContain("0 run log(s)");
  });

  test("reports and names the newest log when runs exist", () => {
    const repo = makeRepo();
    const runs = path.join(repo, "scratchpad", "runs", "codex", "2026-06-26");
    mkdirSync(runs, { recursive: true });
    writeFileSync(path.join(runs, "0001.jsonl"), "{}\n");
    writeFileSync(path.join(runs, "0002.jsonl"), "{}\n");
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    const restore = process.cwd();
    process.chdir(repo);
    try {
      expect(runStatus()).toBe(0);
    } finally {
      process.chdir(restore);
    }
    expect(out.join("")).toContain("2 run log(s)");
    expect(out.join("")).toContain("0002.jsonl");
  });
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

  test("rejects an empty agent argument", async () => {
    await expect(
      runLoop([], {
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
      lines: ["unknown agent ''; choose from claude, codex, agy, copilot"],
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
  // Exercise the real `harness.mjs preflight` entrypoint end-to-end, without linting the whole repo:
  // the CLI runs each COMMIT_CHECK tool from `<repo>/harness/node_modules/.bin`, so stubbing those
  // to exit 0 in a temp repo lets preflight dispatch and pass fast.
  test("preflight dispatches through the real CLI and exits 0", () => {
    const repo = makeRepo();
    const bin = path.join(repo, "harness", "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    for (const [tool] of Object.values(gate.COMMIT_CHECKS)) {
      if (tool === undefined) throw new Error("check command is empty");
      writeFileSync(path.join(bin, tool), "#!/bin/sh\nexit 0\n", {
        mode: 0o755,
      });
    }
    writeFileSync(path.join(repo, "app.ts"), "export const value = 1;\n");
    runCommand(["git", "add", "-A"], repo);

    const result = harnessCli(["preflight"], { cwd: repo });

    expect(result.stderr).toContain("ok: preflight passed");
    expect(result.status).toBe(0);
  }, 15_000);

  // Spawns a real agent subprocess; the default 5s timeout is too tight under the coverage run.
  // Stub the agent on PATH so the success path is deterministic (a real `agy` may be absent).
  test("loop returns 0 when the agent exits cleanly", () => {
    const repo = makeRepo();
    const bin = path.join(repo, "bin");
    mkdirSync(bin);
    writeFileSync(path.join(bin, "agy"), "#!/bin/sh\nexit 0\n", {
      mode: 0o755,
    });

    const result = harnessCli(["loop", "agy", "1", "1"], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      },
    });

    expect(result.status).toBe(0);
  }, 60_000);

  test("loop logs a nonzero agent exit but exits 0 so it never aborts", () => {
    const repo = makeRepo();
    const bin = path.join(repo, "bin");
    mkdirSync(bin);
    writeFileSync(path.join(bin, "agy"), "#!/bin/sh\nexit 3\n", {
      mode: 0o755,
    });

    const result = harnessCli(["loop", "agy", "1", "1"], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("agent exited 3");
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

  test("main with no arguments prints usage and exits 2", async () => {
    const chunks: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });

    await main([]);

    expect(process.exitCode).toBe(2);
    expect(chunks).toEqual([
      "usage: harness <preflight|gate|loop|status|setup>\n",
    ]);
  });
});
