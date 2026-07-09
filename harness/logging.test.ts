import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  commitRows,
  formatTokenCount,
  inferAgent,
  parseLogContent,
  renderStatus,
  type ReadCommits,
} from "./logging.js";

// Stub commit reader so tests never spawn Git. `firstSentence` clips subjects at the
// first sentence, so the stubbed subjects mirror what real Git output would yield.
const stubCommits =
  (...subjects: string[]): ReadCommits =>
  () =>
    subjects.map((subject, index) => [
      `hash${String(index)}`,
      "2026-07-02",
      subject,
    ]);

const makeRepo = (): string => mkdtempSync(path.join(tmpdir(), "logging-"));

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

    const output = renderStatus(
      repo,
      stubCommits("Add logging.", "Seed repo."),
    );

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

  test("sorts equal-time logs by path and keeps no-punctuation commits", () => {
    const repo = makeRepo();
    const sameTime = 1_782_500_000_000;
    writeLog(repo, "zeta.jsonl", '{"result":"zeta"}\n', sameTime);
    writeLog(repo, "alpha.jsonl", '{"result":"alpha"}\n', sameTime);

    const output = renderStatus(repo, stubCommits("No punctuation"));

    expect(output.indexOf("alpha.jsonl")).toBeLessThan(
      output.indexOf("zeta.jsonl"),
    );
    expect(output).toContain("No punctuation");
  });

  test("handles missing logs and missing git history", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "logging-no-git-"));

    const output = renderStatus(repo, stubCommits());

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

  test("summarizes tool use content with the best available detail", () => {
    const described = parseLogContent(
      '{"message":{"content":[{"type":"tool_use","name":"shell","input":{"description":"Run status"}}]}}',
    );
    const commanded = parseLogContent(
      '{"message":{"content":[{"type":"tool_use","name":"shell","input":{"command":"pnpm status"}}]}}',
    );
    const fallback = parseLogContent(
      '{"message":{"content":[{"type":"tool_use","name":"reader","input":null}]}}',
    );

    expect(described.summary).toBe("shell: Run status");
    expect(commanded.summary).toBe("shell: pnpm status");
    expect(fallback.summary).toBe("reader: tool use");
  });

  test("falls back when structured content has no readable message part", () => {
    const parsed = parseLogContent(
      '{"message":{"content":[{"type":"image","source":"ignored"},null]}}',
    );

    expect(parsed.summary).toBe("n/a");
  });

  test("parses empty content and one-sided usage records", () => {
    const empty = parseLogContent("");
    const emptyUsage = parseLogContent('{"usage":{}}');
    const inputOnly = parseLogContent('{"usage":{"input_tokens":7}}');
    const outputOnly = parseLogContent('{"usage":{"output_tokens":5}}');

    expect(empty.lineCount).toBe(0);
    expect(empty.summary).toBe("n/a");
    expect(emptyUsage.usageByIteration).toEqual([]);
    expect(inputOnly.usageByIteration).toEqual([7]);
    expect(outputOnly.usageByIteration).toEqual([5]);
  });

  test("ignores blank plain lines without inventing a summary", () => {
    const parsed = parseLogContent(" ".repeat(3));

    expect(parsed.lineCount).toBe(1);
    expect(parsed.summary).toBe("n/a");
  });

  test("clips overly long summaries", () => {
    const parsed = parseLogContent(JSON.stringify({ result: "x".repeat(170) }));

    expect(parsed.summary).toHaveLength(160);
    expect(parsed.summary.endsWith("...")).toBe(true);
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

  // The default git-backed reader is the one place a real `git` call is under test: it must
  // parse a real commit and return [] when the directory is not a repo.
  test("commitRows reads real commits and returns none outside a repo", () => {
    const repo = makeRepo();
    const git = (...args: string[]): void => {
      const result = spawnSync("git", ["-C", repo, ...args], {
        encoding: "utf8",
      });
      if (result.status !== 0) throw new Error(result.stderr);
    };
    git("init", "-q");
    git("config", "user.email", "logging@test.local");
    git("config", "user.name", "Logging Test");
    git("commit", "--allow-empty", "-q", "-m", "Real commit. Extra detail");

    const rows = commitRows(repo);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[2]).toBe("Real commit.");

    const notRepo = mkdtempSync(path.join(tmpdir(), "logging-no-repo-"));
    expect(commitRows(notRepo)).toEqual([]);
  });
});
