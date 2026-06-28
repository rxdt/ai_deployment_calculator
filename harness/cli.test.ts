// Ports the CLI pass-through behaviour from harness/tests/test_cli.py (preflight/gate dispatch).

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
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
} from "./cli.js";
import { makeRepo } from "./tmprepo.js";

const FIXED_NOW = 1_782_475_200_000;

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
      lines: ["usage: harness <preflight|gate|run|status|install>"],
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
    const packagePath = fileURLToPath(
      new URL("./package.json", import.meta.url),
    );
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
        worker: () => Promise.resolve(0),
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
        worker: () => Promise.resolve(0),
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
      worker: (command, cwd, log, isVerbose) => {
        launched = { command, cwd, log, isVerbose };
        return Promise.resolve(7);
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
    const result = spawnSync("harness", ["preflight"], {
      cwd: makeRepo(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
  });

  test("run", () => {
    const result = spawnSync("harness", ["run", "agy", "1", "1"], {
      cwd: makeRepo(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
  });

  test("status", () => {
    const result = spawnSync("harness", ["status"], {
      cwd: makeRepo(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
  });

  test("install", () => {
    // Run the real install (no name skips the package.json rewrite) so it reaches
    // `npm install` + `npm link` in the actual harness package.
    const result = spawnSync("harness", ["install"], {
      cwd: repoRoot(process.cwd()),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
  });

  test("install lowercases the project name", () => {
    const repo = makeRepo();
    writeFileSync(
      path.join(repo, "package.json"),
      '{ "name": "old-project", "private": true }\n',
    );
    spawnSync("harness", ["install", "VRAM-calculator"], {
      cwd: repo,
      encoding: "utf8",
    });
    const packageJson = JSON.parse(
      readFileSync(path.join(repo, "package.json"), "utf8"),
    ) as { name?: string };

    expect(packageJson.name).toBe("vram-calculator");
  });

  test("install twice does not error on the second run", () => {
    // The bin link already exists from the first install; the second must not EEXIST.
    const repo = repoRoot(process.cwd());
    spawnSync("harness", ["install"], { cwd: repo, encoding: "utf8" });
    const result = spawnSync("harness", ["install"], {
      cwd: repo,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
  });

  test("install removes a harness symlink that resolves into this repo, then npm links", () => {
    const repo = repoRoot(process.cwd());
    const prefix = mkdtempSync(path.join(tmpdir(), "harness-prefix-"));
    const binDir = path.join(prefix, "bin");
    mkdirSync(binDir, { recursive: true });
    const link = path.join(binDir, "harness");
    // A stale link from a prior install of THIS repo's own harness bin.
    symlinkSync(path.join(repo, "harness", "harness.mjs"), link);

    const result = spawnSync("harness", ["install"], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, npm_config_prefix: prefix },
    });

    // The stale self-link is removed and root `npm link` recreates the bin.
    expect(result.status).toBe(0);
    expect(existsSync(link)).toBe(true);
  });

  test("install removes a dangling harness symlink that targets this repo, then npm links", () => {
    const repo = repoRoot(process.cwd());
    const prefix = mkdtempSync(path.join(tmpdir(), "harness-prefix-"));
    const binDir = path.join(prefix, "bin");
    mkdirSync(binDir, { recursive: true });
    const link = path.join(binDir, "harness");
    // A broken link whose stored target is inside this repo (a moved/old bin):
    // ownership must be read from the link target, not by resolving it.
    symlinkSync(path.join(repo, "harness", "old-missing-bin.mjs"), link);

    const result = spawnSync("harness", ["install"], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, npm_config_prefix: prefix },
    });

    expect(result.status).toBe(0);
    expect(existsSync(link)).toBe(true);
  });

  test("install errors and preserves a harness symlink that resolves outside this repo", () => {
    const repo = repoRoot(process.cwd());
    const prefix = mkdtempSync(path.join(tmpdir(), "harness-prefix-"));
    const binDir = path.join(prefix, "bin");
    mkdirSync(binDir, { recursive: true });
    const foreign = mkdtempSync(path.join(tmpdir(), "other-project-"));
    const foreignTarget = path.join(foreign, "harness.mjs");
    writeFileSync(foreignTarget, "#!/usr/bin/env node\n");
    const link = path.join(binDir, "harness");
    symlinkSync(foreignTarget, link);

    const result = spawnSync("harness", ["install"], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, npm_config_prefix: prefix },
    });

    // A foreign link is never clobbered: install must fail and leave it intact.
    expect(result.status).not.toBe(0);
    expect(realpathSync(link)).toBe(realpathSync(foreignTarget));
  });

  test.each([
    ["my-project!", "myproject"],
    [".hidden-package", "hiddenpackage"],
    ["_private", "private"],
    ["name/hooks", "name.hooks"],
  ])("install rewrites %s to the URL-safe name %s", (input, expected) => {
    const repo = makeRepo();
    writeFileSync(
      path.join(repo, "package.json"),
      '{ "name": "old-project", "private": true }\n',
    );
    spawnSync("harness", ["install", input], { cwd: repo, encoding: "utf8" });
    const packageJson = JSON.parse(
      readFileSync(path.join(repo, "package.json"), "utf8"),
    ) as { name?: string };

    expect(packageJson.name).toBe(expected);
  });

  test("install rejects a reserved Node core module name", () => {
    const repo = makeRepo();
    writeFileSync(
      path.join(repo, "package.json"),
      '{ "name": "old-project", "private": true }\n',
    );
    const result = spawnSync("harness", ["install", "http"], {
      cwd: repo,
      encoding: "utf8",
    });
    const packageJson = JSON.parse(
      readFileSync(path.join(repo, "package.json"), "utf8"),
    ) as { name?: string };

    expect(result.status).not.toBe(0);
    expect(packageJson.name).toBe("old-project");
  });

  test("install caps the project name at 214 characters", () => {
    const repo = makeRepo();
    writeFileSync(
      path.join(repo, "package.json"),
      '{ "name": "old-project", "private": true }\n',
    );
    spawnSync("harness", ["install", "a".repeat(300)], {
      cwd: repo,
      encoding: "utf8",
    });
    const packageJson = JSON.parse(
      readFileSync(path.join(repo, "package.json"), "utf8"),
    ) as { name?: string };

    expect(packageJson.name?.length).toBeLessThanOrEqual(214);
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
      "usage: harness <preflight|gate|run|status|install>\n",
    ]);
  });
});
