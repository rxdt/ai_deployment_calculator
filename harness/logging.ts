// Renders `harness status`: recent run logs, per-agent token usage, and recent commits.
// Parses the JSONL that agents stream into scratchpad/runs, tolerating each agent's schema.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const AGENTS = ["codex", "claude", "agy", "copilot"] as const;
const ITERATION = /^ralph: iteration ([1-9]\d*)\/[1-9]\d*$/u;
const THOUSAND = 10 ** 3;
const MILLION = 10 ** 6;
const TOTAL_KEYS = ["total_tokens", "totalTokens"];
const INPUT_KEYS = ["input_tokens", "prompt_tokens", "inputTokens"];
const OUTPUT_KEYS = ["output_tokens", "completion_tokens", "outputTokens"];
const LOG_HEAD = ["agent", "lines", "modified", "file", "summary"];
const TOKEN_HEAD = ["agent", "runs", "iters", "last", "total"];
const COMMIT_HEAD = ["hash", "date", "subject"];
const GIT_LOG_ARGS = [
  "log",
  "-10",
  "--date=short",
  "--pretty=format:%h%x09%ad%x09%s",
];

type Agent = (typeof AGENTS)[number];
type LogAgent = Agent | "unknown";
type Rec = Record<string, unknown>;
// A table body: rows of pre-stringified cells, ready for `section` to align.
type Rows = readonly (readonly string[])[];

interface ParsedLog {
  readonly lineCount: number;
  readonly summary: string;
  readonly iterationCount: number;
  readonly usageByIteration: readonly number[];
}

interface LogFile extends ParsedLog {
  readonly agent: LogAgent;
  readonly relative: string;
  readonly mtimeMs: number;
}

const isRec = (value: unknown): value is Rec =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const compact = (value: string): string =>
  value.replaceAll(/\s+/gu, " ").trim();

const clip = (value: string, max: number): string => {
  const clean = compact(value);
  return clean.length <= max ? clean : `${clean.slice(0, max - 3)}...`;
};

const parseJson = (line: string): unknown => {
  try {
    const parsed: unknown = JSON.parse(line);
    return parsed;
  } catch {
    return undefined;
  }
};

/**
Format a token count as a compact human string (999, 1.2k, 3.4m).
@param value - Token count, or undefined when unknown.
@returns The compact string, or "n/a".
*/
export const formatTokenCount = (value: number | undefined): string => {
  if (value === undefined) return "n/a";
  if (value >= MILLION) return `${(value / MILLION).toFixed(1)}m`;
  if (value >= THOUSAND) return `${(value / THOUSAND).toFixed(1)}k`;
  return String(value);
};

/**
A usable token count: finite and non-negative. Split out of `numberFrom` so the
predicate stays on one line there -- a wrapped arrow body deadlocks
`unicorn/consistent-arrow-return-style` against Prettier.
@param value - Candidate read off a log record.
@returns True when the value can be summed as a count.
*/
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
First usable count among `keys`, in order.
@param source - Record to read.
@param keys - Key names to try, most specific first.
@returns The count, or undefined when no key holds one.
*/
function numberFrom(source: Rec, keys: readonly string[]): number | undefined {
  const values = keys.map((key) => source[key]);
  return values.find((value): value is number => isCount(value));
}

const usageTotal = (source: Rec): number | undefined => {
  const total = numberFrom(source, TOTAL_KEYS);
  if (total !== undefined) return total;
  const input = numberFrom(source, INPUT_KEYS);
  const output = numberFrom(source, OUTPUT_KEYS);
  return input === undefined && output === undefined
    ? undefined
    : (input ?? 0) + (output ?? 0);
};

const toolText = (part: Rec): string => {
  const input = isRec(part.input) ? part.input : {};
  let detail = "tool use";
  if (typeof input.description === "string") detail = input.description;
  else if (typeof input.command === "string") detail = input.command;
  return `${String(part.name)}: ${detail}`;
};

const textPart = (content: unknown): string | undefined => {
  if (!Array.isArray(content)) return undefined;
  for (const part of content) {
    if (!isRec(part)) continue;
    if (part.type === "text" && typeof part.text === "string") return part.text;
    if (part.type === "tool_use" && typeof part.name === "string")
      return toolText(part);
  }
  return undefined;
};

const agentText = (value: Rec): string | undefined => {
  const item = isRec(value.item) ? value.item : undefined;
  if (item?.type === "agent_message" && typeof item.text === "string")
    return item.text;
  const message = isRec(value.message) ? value.message : undefined;
  return textPart(message?.content);
};

const summary = (value: Rec): [number, string] | undefined => {
  if (typeof value.result === "string") return [4, value.result];
  const text = agentText(value);
  if (text !== undefined) return [3, text];
  const usage = isRec(value.usage) ? usageTotal(value.usage) : undefined;
  return usage === undefined
    ? undefined
    : [2, `usage ${formatTokenCount(usage)} tokens`];
};

/**
Infer the agent that produced a log from its path (directory, suffix, or prefix).
@param relativePath - Log path relative to the runs root.
@returns The agent name, or "unknown".
*/
export const inferAgent = (relativePath: string): LogAgent => {
  const [first = ""] = relativePath.split(path.sep);
  const file = path.basename(relativePath);
  /**
  @param agent - Candidate agent name.
  @returns True when the path names that agent.
  */
  function isNamed(agent: LogAgent): boolean {
    return (
      first === agent ||
      file === `${agent}.jsonl` ||
      file.endsWith(`-${agent}.jsonl`) ||
      file.startsWith(`${agent}-`)
    );
  }
  return AGENTS.find((agent) => isNamed(agent)) ?? "unknown";
};

const keyedUsage = (
  value: Rec,
  lineNumber: number,
): readonly [string, number] | undefined => {
  const direct = isRec(value.usage) ? usageTotal(value.usage) : undefined;
  if (direct !== undefined)
    return [
      value.type === "result" ? "result" : `direct-${String(lineNumber)}`,
      direct,
    ];
  const message = isRec(value.message) ? value.message : undefined;
  const fallback = isRec(message?.usage)
    ? usageTotal(message.usage)
    : undefined;
  if (fallback === undefined) return undefined;
  const id =
    typeof message?.id === "string" ? message.id : `line-${String(lineNumber)}`;
  return [`fallback-${id}-${String(fallback)}`, fallback];
};

const addUsage = (
  usage: Map<number, Map<string, number>>,
  iteration: number,
  key: string,
  total: number,
): void => {
  const existing = usage.get(iteration) ?? new Map<string, number>();
  if (key === "result") existing.set(key, (existing.get(key) ?? 0) + total);
  else if (!existing.has(key)) existing.set(key, total);
  usage.set(iteration, existing);
};

const iterationTotals = (
  iterations: readonly number[],
  usage: ReadonlyMap<number, ReadonlyMap<string, number>>,
): readonly number[] => {
  return iterations.flatMap((iteration) => {
    const values = usage.get(iteration);
    const result = values?.get("result");
    const total =
      result ??
      [...(values?.entries() ?? [])]
        .filter(([key]) => key !== "result")
        .reduce((sum, [, value]) => sum + value, 0);
    return total > 0 ? [total] : [];
  });
};

const better = (
  current: [number, string],
  next: [number, string] | undefined,
): [number, string] =>
  next !== undefined && next[0] >= current[0] ? next : current;

const addFoundUsage = (
  usage: Map<number, Map<string, number>>,
  iteration: number,
  found: readonly [string, number] | undefined,
): void => {
  if (found !== undefined) addUsage(usage, iteration, found[0], found[1]);
};

/**
Parse one run log's content into line/summary/iteration/usage facts.
@param content - Raw JSONL file content.
@returns The parsed facts.
*/
export const parseLogContent = (content: string): ParsedLog => {
  const text = content.endsWith("\n") ? content.slice(0, -1) : content;
  const lines = text.length === 0 ? [] : text.split("\n");
  const iterations = new Set([1]);
  const usage = new Map<number, Map<string, number>>();
  let iteration = 1;
  let best: [number, string] = [0, "n/a"];

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    iteration = Number(ITERATION.exec(trimmed)?.[1] ?? iteration);
    iterations.add(iteration);
    const parsed = parseJson(trimmed);
    if (!isRec(parsed)) {
      best = trimmed.length > 0 ? better(best, [1, trimmed]) : best;
      continue;
    }
    addFoundUsage(usage, iteration, keyedUsage(parsed, index));
    best = better(best, summary(parsed));
  }

  const ordered = [...iterations].toSorted((left, right) => left - right);
  return {
    lineCount: lines.length,
    summary: clip(best[1], 160),
    iterationCount: Math.max(1, ordered.length),
    usageByIteration: iterationTotals(ordered, usage),
  };
};

const collect = (root: string, directory: string, logs: LogFile[]): void => {
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(root, absolute, logs);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      const relative = path.relative(root, absolute);
      const parsed = parseLogContent(readFileSync(absolute, "utf8"));
      logs.push({
        ...parsed,
        agent: inferAgent(relative),
        relative,
        mtimeMs: statSync(absolute).mtimeMs,
      });
    }
  }
};

/**
Newest first, ties broken by path so the ordering is stable across runs.
@param left - First log.
@param right - Second log.
@returns Negative, zero, or positive per the comparator contract.
*/
function newestFirst(left: LogFile, right: LogFile): number {
  return (
    right.mtimeMs - left.mtimeMs || left.relative.localeCompare(right.relative)
  );
}

const discoverLogFiles = (runsRoot: string): readonly LogFile[] => {
  const logs: LogFile[] = [];
  if (existsSync(runsRoot)) collect(runsRoot, runsRoot, logs);
  return logs.toSorted((left, right) => newestFirst(left, right));
};

const row = (cells: readonly string[], limits: readonly number[]): string =>
  cells.map((cell, index) => clip(cell, Number(limits[index]))).join(" | ");

const section = (
  title: string,
  headers: readonly string[],
  rows: Rows,
  limits: readonly number[],
): string => {
  return [
    title,
    row(headers, limits),
    ...(rows.length === 0
      ? ["(none)"]
      : rows.map((cells) => row(cells, limits))),
  ].join("\n");
};

const tokenRows = (logs: readonly LogFile[]): Rows => {
  return AGENTS.map((agent) => {
    const mine = logs.filter((log) => log.agent === agent);
    const usages = mine.flatMap((log) => log.usageByIteration);
    const total = usages.reduce((sum, value) => sum + value, 0);
    const latest = mine.find((log) => log.usageByIteration.length > 0);
    return [
      agent,
      String(mine.length),
      String(mine.reduce((sum, log) => sum + log.iterationCount, 0)),
      formatTokenCount(latest?.usageByIteration.at(-1)),
      total === 0 ? "n/a" : formatTokenCount(total),
    ];
  });
};

const firstSentence = (value: string): string =>
  /^.*?[.!?](?:\s|$)/u.exec(value)?.[0].trim() ?? value;

export type ReadCommits = (repo: string) => Rows;

export const commitRows: ReadCommits = (repo) => {
  const result = spawnSync("git", ["-C", repo, ...GIT_LOG_ARGS], {
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash = "", date = "", subject = ""] = line.split("\t", 3);
      return [hash, date, firstSentence(subject)];
    });
};

/**
Render the full `harness status` report for a repo.
@param repo - Repository root.
@param readCommits - Reads recent commit rows; defaults to the real git-backed reader.
@returns The multi-section status text.
*/
export const renderStatus = (
  repo: string,
  readCommits: ReadCommits = commitRows,
): string => {
  const root = path.join(repo, "scratchpad", "runs");
  const logs = discoverLogFiles(root);
  const recentLogs = logs.slice(0, 10).map((log) => {
    return [
      log.agent,
      String(log.lineCount),
      new Date(log.mtimeMs).toISOString().slice(0, 16).replaceAll("T", " "),
      log.relative,
      log.summary,
    ];
  });
  return [
    `${String(logs.length)} run log(s) in ${root}`,
    section("Recent logs", LOG_HEAD, recentLogs, [8, 6, 16, 48, 100]),
    section("Token usage", TOKEN_HEAD, tokenRows(logs), [8, 6, 6, 10, 10]),
    section("Recent commits", COMMIT_HEAD, readCommits(repo), [8, 10, 80]),
  ].join("\n\n");
};
