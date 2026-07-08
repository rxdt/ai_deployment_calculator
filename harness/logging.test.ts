import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  formatTokenCount,
  inferAgent,
  parseLogContent,
  renderStatus,
} from "./logging.js";

const runCommand = (argv: string[], cwd: string): void => {
  const [command, ...args] = argv;
  if (command === undefined) throw new Error("missing command");
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
};

const makeRepo = (): string => {
  const repo = mkdtempSync(path.join(tmpdir(), "logging-"));
  runCommand(["git", "init", "-q"], repo);
  runCommand(["git", "config", "user.email", "logging@test.local"], repo);
  runCommand(["git", "config", "user.name", "Logging Test"], repo);
  writeFileSync(path.join(repo, "README.md"), "seed\n");
  runCommand(["git", "add", "README.md"], repo);
  runCommand(["git", "commit", "-q", "-m", "Seed repo. Extra detail"], repo);
  runCommand(
    ["git", "commit", "--allow-empty", "-q", "-m", "Add logging. More detail"],
    repo,
  );
  return repo;
};

const writeLog = (
  repo: string,
  relative: string,
  content: string,
  mtimeMs: number,
): void => {
  const absolute = path.join(repo, "scratchpad", "runs", relative);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
  const when = new Date(mtimeMs);
  utimesSync(absolute, when, when);
};

describe("logging status", () => {
  test("summarizes recent logs, tokens, and commits", () => {
    const repo = makeRepo();
    writeLog(
      repo,
      "codex/2026-07-02/0004.jsonl",
      [
        "ralph: iteration 1/2",
        '{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":20}}',
        "ralph: iteration 2/2",
        '{"type":"item.completed","item":{"type":"agent_message","text":"Codex final message for the log summary"}}',
        '{"type":"turn.completed","usage":{"input_tokens":200,"output_tokens":30}}',
      ].join("\n"),
      1_782_000_000_000,
    );
    writeLog(
      repo,
      "claude/2026-07-03/0003.jsonl",
      [
        "ralph: iteration 1/1",
        '{"type":"assistant","message":{"id":"msg_1","content":[{"type":"text","text":"Working"}],"usage":{"input_tokens":10,"output_tokens":2}}}',
        '{"type":"assistant","message":{"id":"msg_1","content":[{"type":"text","text":"Working"}],"usage":{"input_tokens":10,"output_tokens":2}}}',
        String.raw`{"type":"result","result":"Claude completed final result\nMore detail","usage":{"input_tokens":50,"output_tokens":5}}`,
      ].join("\n"),
      1_782_100_000_000,
    );
    writeLog(
      repo,
      "agy/2026-07-04/0002.jsonl",
      '{"usage":{"prompt_tokens":7,"completion_tokens":3,"total_tokens":10},"result":"agy ok"}\n',
      1_782_200_000_000,
    );
    writeLog(
      repo,
      "0010-copilot.jsonl",
      '{"usage":{"inputTokens":11,"outputTokens":4}}\n',
      1_782_300_000_000,
    );
    writeLog(
      repo,
      "misc/0001.jsonl",
      "plain fallback line\n",
      1_781_900_000_000,
    );
    writeLog(repo, "misc/notes.txt", "ignored\n", 1_782_400_000_000);

    const output = renderStatus(repo);

    expect(output).toContain("5 run log(s)");
    expect(output).toContain("Recent logs");
    expect(output).toContain("Token usage");
    expect(output).toContain("Recent commits");
    expect(output.indexOf("0010-copilot.jsonl")).toBeLessThan(
      output.indexOf("agy/2026-07-04/0002.jsonl"),
    );
    expect(output).toContain("Codex final message for the log summary");
    expect(output).toContain("Claude completed final result");
    expect(output).toContain("Add logging.");
    // codex: (100+20)+(200+30) = 350 total, 230 on the last iteration.
    expect(output).toContain("230");
    expect(output).toContain("350");
    // claude: duplicate assistant usage deduped, result record wins at 55.
    expect(output).toContain("55");
    expect(output).toContain("copilot");
    expect(output).toContain("15");
  });

  test("handles missing logs and missing git history", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "logging-no-git-"));

    const output = renderStatus(repo);

    expect(output).toContain("0 run log(s)");
    expect(output).toContain("(none)");
    expect(output).toContain("n/a");
  });

  test("infers agents from nested and flat log names", () => {
    expect(inferAgent("codex/2026-07-02/0001.jsonl")).toBe("codex");
    expect(inferAgent("0024-codex.jsonl")).toBe("codex");
    expect(inferAgent("copilot-run.jsonl")).toBe("copilot");
    expect(inferAgent("misc/0001.jsonl")).toBe("unknown");
  });

  test("dedupes Claude assistant usage when a result record is absent", () => {
    const parsed = parseLogContent(
      [
        '{"type":"assistant","message":{"id":"msg_1","content":[{"type":"text","text":"first"}],"usage":{"input_tokens":10,"output_tokens":4}}}',
        '{"type":"assistant","message":{"id":"msg_1","content":[{"type":"text","text":"first"}],"usage":{"input_tokens":10,"output_tokens":4}}}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"second"}],"usage":{"input_tokens":2,"output_tokens":3}}}',
      ].join("\n"),
    );

    expect(parsed.iterationCount).toBe(1);
    expect(parsed.usageByIteration).toHaveLength(1);
    expect(parsed.usageByIteration[0]).toBe(19);
    expect(parsed.summary).toBe("second");
  });

  test("keeps a real summary ahead of a stray plain line", () => {
    const parsed = parseLogContent(
      ['{"type":"result","result":"real summary"}', "trailing noise line"].join(
        "\n",
      ),
    );

    expect(parsed.summary).toBe("real summary");
  });

  test("formats token counts compactly", () => {
    expect(formatTokenCount(undefined)).toBe("n/a");
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(1200)).toBe("1.2k");
    expect(formatTokenCount(1_200_000)).toBe("1.2m");
  });
});
