// Command-line interface for the JS harness: gate/preflight pass-throughs plus one ralph loop.

import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runChecks, runGate, runGit, runPreflight } from "./gate.ts";

export const AGENTS: Record<string, string[]> = {
  claude: [
    "claude",
    "-p",
    "--permission-mode",
    "acceptEdits",
    "--output-format",
    "stream-json",
    "--verbose",
  ],
  codex: [
    "codex",
    "exec",
    "-m",
    "gpt-5.5",
    "--json",
    "--dangerously-bypass-approvals-and-sandbox",
    "--dangerously-bypass-hook-trust",
    "-",
  ],
  agy: ["agy", "--log-file", "agy.log", "--print"],
  copilot: [
    "sh",
    "-c",
    'copilot --output-format json --stream on --allow-all-tools -p "$(cat)"',
  ],
};

export interface CliDependencies {
  preflight: (repo: string) => string[];
  gate: (repo: string) => string[];
  repoRoot: (from: string) => string;
}

export interface RunDependencies {
  now: () => number;
  cwd: () => string;
  ralphPath: () => string;
  listSequences: (directory: string) => number[];
  ensureDirectory: (directory: string) => void;
  worker: (
    command: string[],
    cwd: string,
    log: string,
    isVerbose: boolean,
  ) => Promise<number>;
}

export interface CommandResult {
  code: number;
  lines: string[];
}

/**
Resolve the Git repository root from any directory inside the checkout.
@param from - Directory inside the repo.
@returns Absolute repository root path.
*/
export function repoRoot(from: string): string {
  return runGit(from, ["rev-parse", "--show-toplevel"]).trim();
}

const defaultDependencies: CliDependencies = {
  preflight: (repo) => runPreflight(repo, runChecks),
  gate: (repo) => runGate(repo, runChecks),
  repoRoot: (from) => repoRoot(from),
};

/**
Resolve the repo root, run the requested gate, and return the lines + exit code (no I/O here).
@param command - "preflight" or "gate".
@param dependencies - Injectable runners (defaults to the real harness).
@returns The lines to print and the process exit code.
*/
export function run(
  command: string,
  dependencies: CliDependencies = defaultDependencies,
): CommandResult {
  if (command !== "preflight" && command !== "gate") {
    return { code: 2, lines: ["usage: harness <preflight|gate|run>"] };
  }
  const repo = dependencies.repoRoot(process.cwd());
  const problems =
    command === "preflight"
      ? dependencies.preflight(repo)
      : dependencies.gate(repo);
  const lines = problems.map((problem) => `gate: ${problem}`);
  lines.push(
    problems.length > 0 ? "rejected by harness" : `ok: ${command} passed`,
  );
  return { code: problems.length > 0 ? 1 : 0, lines };
}

/**
Format an epoch timestamp as the local YYYY-MM-DD run directory.
@param epochMilliseconds - Timestamp in milliseconds.
@returns Local date string.
*/
export function formatDate(epochMilliseconds: number): string {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(epochMilliseconds);
}

/**
Parse a positive integer argument with a default.
@param raw - Raw CLI argument.
@param fallback - Value used when the argument is omitted.
@returns A positive integer, or undefined when invalid.
*/
export function parseCount(
  raw: string | undefined,
  fallback: number,
): number | undefined {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

/**
Choose the next zero-based sequence after existing run logs.
@param existing - Existing sequence numbers.
@returns The next sequence number.
*/
export function nextSequence(existing: Iterable<number>): number {
  return 1 + Math.max(0, ...existing);
}

/**
Compact valid JSONL for terminal output; preserve invalid lines exactly.
@param line - One output line.
@param jq - Optional jq executable path for colored compaction.
@returns The line to stream to the terminal.
*/
export function formatLiveLine(line: string, jq?: string): string {
  if (jq !== undefined) {
    const rendered = spawnSync(jq, ["-C", "-c", "."], {
      input: line,
      encoding: "utf8",
    });
    if (rendered.status === 0 && rendered.stdout.length > 0) {
      return rendered.stdout;
    }
  }
  try {
    const parsed: unknown = JSON.parse(line);
    return `${JSON.stringify(parsed)}\n`;
  } catch {
    return line;
  }
}

/**
Split a chunk into complete lines, formatting each one and keeping the unfinished tail.
@param text - Buffered worker output.
@param jq - Optional jq executable path.
@returns Formatted terminal output plus the remaining partial line.
*/
export function drainLines(
  text: string,
  jq?: string,
): { output: string; rest: string } {
  const parts = text.split("\n");
  const rest = parts.pop() ?? "";
  const output = parts.map((line) => formatLiveLine(`${line}\n`, jq)).join("");
  return { output, rest };
}

/**
List existing JSONL run sequences in a directory.
@param directory - Run day directory.
@returns Existing numeric sequence stems.
*/
function listSequences(directory: string): number[] {
  if (!existsSync(directory)) {
    return [];
  }
  const pattern = /^(?<seq>\d+)\.jsonl$/u;
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const seq = entry.isFile()
      ? pattern.exec(entry.name)?.groups?.seq
      : undefined;
    return seq === undefined ? [] : [Number(seq)];
  });
}

/**
Find an executable on PATH.
@param name - Executable basename.
@returns The absolute path when present.
*/
function findExecutable(name: string): string | undefined {
  const pathDirectories = (process.env.PATH ?? "").split(path.delimiter);
  for (const directory of pathDirectories) {
    const candidate = path.join(directory, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
Spawn the ralph worker, teeing stdout to the log and optionally to the terminal.
@param command - Worker argv.
@param cwd - Repo root.
@param log - JSONL log path.
@param isVerbose - Whether to stream compacted live output to stdout.
@returns The worker exit code.
*/
async function runWorker(
  command: string[],
  cwd: string,
  log: string,
  isVerbose: boolean,
): Promise<number> {
  const [executable = ""] = command;
  if (executable.length === 0) {
    throw new Error("worker command is empty");
  }
  const logStream = createWriteStream(log, { encoding: "utf8" });
  const jq = findExecutable("jq");
  const child = spawn(executable, command.slice(1), {
    cwd,
    stdio: ["ignore", "pipe", "inherit"],
  });
  child.stdout.setEncoding("utf8");
  let rest = "";
  child.stdout.on("data", (chunk: string) => {
    logStream.write(chunk);
    if (isVerbose) {
      const { output, rest: nextRest } = drainLines(`${rest}${chunk}`, jq);
      rest = nextRest;
      process.stdout.write(output);
    }
  });
  return new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (closeCode) => {
      if (isVerbose && rest.length > 0) {
        process.stdout.write(formatLiveLine(rest, jq));
      }
      logStream.end(() => {
        resolve(closeCode ?? 1);
      });
    });
  });
}

const defaultRunDependencies: RunDependencies = {
  now: () => Date.now(),
  cwd: () => repoRoot(process.cwd()),
  ralphPath: () =>
    path.join(path.dirname(fileURLToPath(import.meta.url)), "ralph.sh"),
  listSequences,
  ensureDirectory: (directory) => {
    mkdirSync(directory, { recursive: true });
  },
  worker: runWorker,
};

/**
Run one ralph loop and return the stderr lines + worker exit code.
@param loopArguments - Arguments after `run`.
@param dependencies - Injectable I/O boundary.
@returns The lines to print and the process exit code.
*/
export async function runLoop(
  loopArguments: string[],
  dependencies: RunDependencies = defaultRunDependencies,
): Promise<CommandResult> {
  const agent = (loopArguments[0] ?? "").toLowerCase();
  if (!Object.hasOwn(AGENTS, agent)) {
    return {
      code: 2,
      lines: [
        `unknown agent '${agent}'; choose from ${Object.keys(AGENTS).join(", ")}`,
      ],
    };
  }
  const iterations = parseCount(loopArguments[1], 2);
  const minutes = parseCount(loopArguments[2], 20);
  if (iterations === undefined || minutes === undefined) {
    return {
      code: 2,
      lines: ["num_iterations and max_minutes must be >= 1"],
    };
  }

  const isVerbose = loopArguments[3] !== "false";
  const cwd = dependencies.cwd();
  const day = path.join(
    "scratchpad",
    "runs",
    agent,
    formatDate(dependencies.now()),
  );
  const dayDirectory = path.join(cwd, day);
  dependencies.ensureDirectory(dayDirectory);
  const sequence = nextSequence(dependencies.listSequences(dayDirectory));
  const log = path.join(
    dayDirectory,
    `${String(sequence).padStart(4, "0")}.jsonl`,
  );
  const command = [
    dependencies.ralphPath(),
    String(iterations),
    String(minutes),
    ...AGENTS[agent],
  ];
  const lines = [`harness: ${command.join(" ")} -> ${log}`];
  const code = await dependencies.worker(command, cwd, log, isVerbose);
  return { code, lines };
}

/**
Run the harness for argv and set the process exit code from the result.
@param cliArguments - Arguments after the script name.
*/
export async function main(cliArguments: string[]): Promise<void> {
  const command = cliArguments[0] ?? "";
  const result =
    command === "run" ? await runLoop(cliArguments.slice(1)) : run(command);
  for (const line of result.lines) {
    process.stderr.write(`${line}\n`);
  }
  process.exitCode = result.code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
