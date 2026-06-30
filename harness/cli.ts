// Command-line interface for the JS harness: gate/preflight pass-throughs plus one ralph loop.

import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_CONFIGS, runChecks, runGate, runGit, runPreflight } from "./gate.js";

export const AGENTS: Record<string, string[]> = {
  claude: [
    "claude",
    "-p",
    "--permission-mode",
    "acceptEdits",
    // "--bare", // for one-shot minimal run. skips MCP servers, hooks, plugins, and CLAUDE.md, reducing startup time, sets CLAUDE_CODE_SIMPLE, won't use CLAUDE_CODE_OAUTH_TOKEN
    "--no-session-persistence", // don't save session data — good for disposable automation tasks
    "--output-format",
    "stream-json",
    "--verbose",
  ],
  codex: [
    "env",
    "-u",
    "CODEX_THREAD_ID", // child does not bind to the parent thread/session state
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
  ],
  agy: ["sh", "-c", "cat >/dev/null"],
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

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

const RESERVED_PACKAGE_NAMES = new Set(
  builtinModules.map((moduleName) => moduleName.replace(/^node:/u, "")),
);

const IGNORED_INSTALL_DIRECTORIES = new Set([
  ".agents",
  ".codex",
  ".git",
  ".lighthouseci",
  "build",
  "coverage",
  "dist",
  "harness",
  "node_modules",
  "scratchpad",
  "test-results",
]);

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
    return {
      code: 2,
      lines: ["usage: harness <preflight|gate|run|status|setup>"],
    };
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

function packageNameIsValid(name: string): boolean {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(name);
}

function packageNameFromInput(name: string): string {
  const lower = name.toLowerCase().slice(0, 214);
  return packageNameIsValid(lower)
    ? lower
    : lower
      .replaceAll("/", ".")
      .replaceAll(/[^a-z0-9.]/gu, "")
      .replaceAll(/^\.+/gu, "");
}

function readRootPackageJson(repo: string): PackageJson {
  const packagePath = path.join(repo, "package.json");
  return JSON.parse(readFileSync(packagePath, "utf8")) as PackageJson;
}

function writeRootPackageJson(repo: string, parsed: PackageJson): void {
  const packagePath = path.join(repo, "package.json");
  writeFileSync(packagePath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function currentPackageName(repo: string): string | undefined {
  return readRootPackageJson(repo).name;
}

function writePackageName(repo: string, name: string): void {
  const parsed = readRootPackageJson(repo);
  parsed.name = name;
  writeRootPackageJson(repo, parsed);
}

function packageScripts(parsed: PackageJson): Record<string, string> {
  if (
    typeof parsed.scripts === "object" &&
    parsed.scripts !== null &&
    !Array.isArray(parsed.scripts)
  ) {
    return parsed.scripts;
  }
  parsed.scripts = {};
  return parsed.scripts;
}

const ROOT_HARNESS_SCRIPTS = {
  gate: "node harness/harness.mjs gate",
  setup: "node harness/harness.mjs setup",
  lint: "npm --prefix harness run lint",
  run: "node harness/harness.mjs run",
  status: "node harness/harness.mjs status",
  test: "npm --prefix harness run test:coverage",
  "test:file": "npm --prefix harness run test:file --",
} as const;

function mergeRootHarnessScripts(repo: string): void {
  const parsed = readRootPackageJson(repo);
  const scripts = packageScripts(parsed);
  for (const [name, command] of Object.entries(ROOT_HARNESS_SCRIPTS)) {
    if (Object.hasOwn(scripts, name)) {
      if (name === "lint" || name === "test") {
        const alias = `harness:${name}`;
        if (!Object.hasOwn(scripts, alias)) {
          scripts[alias] = command;
        }
      }
      continue;
    }
    scripts[name] = command;
  }
  writeRootPackageJson(repo, parsed);
}

// Candidate user config filenames per check; if none exist, keep the shipped default.
const CONFIG_CANDIDATES: Record<string, readonly string[]> = {
  eslint: ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"],
  style: ["stylelint.config.js", "stylelint.config.cjs", ".stylelintrc.json"],
  html: [".htmlvalidate.json", ".htmlvalidate.js"],
  frontend_types: ["frontend/tsconfig.json", "tsconfig.json"],
  architecture: [".dependency-cruiser.cjs", ".dependency-cruiser.js", ".dependency-cruiser.json"],
  dead_code: ["knip.json", "knip.jsonc", "knip.config.ts"],
  spelling: ["cspell.json", "cspell.config.js", ".cspell.json"],
  workflow_api: [".spectral.yml", ".spectral.yaml", ".spectral.json"],
  coverage: ["vitest.config.ts", "vitest.config.js", "vite.config.ts", "vite.config.js"],
  e2e: ["playwright.config.ts", "playwright.config.js"],
  lighthouse: ["lighthouserc.cjs", "lighthouserc.js", "lighthouserc.json"],
};

/**
Resolve each gate check's config path once and write harness/configs.json: the
user's config when present, else the shipped harness default. The gate reads
these paths; it never decides.
@param repo - The repo root.
*/
function writeConfigPaths(repo: string): void {
  const resolved: Record<string, string> = {};
  for (const [check, candidates] of Object.entries(CONFIG_CANDIDATES)) {
    const found = candidates.find((file) => existsSync(path.join(repo, file)));
    resolved[check] = found ?? DEFAULT_CONFIGS[check];
  }
  writeFileSync(
    path.join(repo, "harness", "configs.json"),
    `${JSON.stringify(resolved, null, 2)}\n`,
  );
}

function discoverRepoPackageDirectories(repo: string): string[] {
  const visit = (directory: string): string[] =>
    readdirSync(path.join(repo, directory), {
      withFileTypes: true,
    }).flatMap((entry) => {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return IGNORED_INSTALL_DIRECTORIES.has(entry.name)
          ? []
          : visit(relative);
      }
      return entry.isFile() && entry.name === "package.json" && directory !== ""
        ? [directory]
        : [];
    });
  return visit("").toSorted((left, right) => left.localeCompare(right));
}

function runNpmInstall(repo: string): number {
  const packageDirectories = [
    "harness",
    ...discoverRepoPackageDirectories(repo),
  ];
  for (const directory of packageDirectories) {
    const result = spawnSync("npm", ["install"], {
      cwd: path.join(repo, directory),
      stdio: "inherit",
    });
    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }
  return 0;
}

function writeHook(repo: string, name: string, command: string): void {
  const hook = path.join(repo, ".githooks", name);
  if (existsSync(hook)) {
    return; // never clobber an existing hook
  }
  writeFileSync(hook, ["#!/bin/sh", "set -eu", "", command, ""].join("\n"));
  chmodSync(hook, 0o755);
}

function writeHooks(repo: string): void {
  const hooks = path.join(repo, ".githooks");
  mkdirSync(hooks, { recursive: true });
  writeHook(repo, "pre-commit", "node harness/harness.mjs preflight");
  writeHook(repo, "pre-push", "node harness/harness.mjs gate");
}

function runSetup(arguments_: string[]): CommandResult {
  const repo = repoRoot(process.cwd());
  const [name] = arguments_;
  const explicitName =
    name === undefined ? undefined : packageNameFromInput(name);
  if (
    explicitName !== undefined &&
    (!packageNameIsValid(explicitName) ||
      RESERVED_PACKAGE_NAMES.has(explicitName))
  ) {
    return { code: 2, lines: [`invalid package name: ${name}`] };
  }
  // No name given and package.json has none: derive one from the repo folder.
  const autoName =
    explicitName === undefined && (currentPackageName(repo) ?? "") === ""
      ? packageNameFromInput(path.basename(repo))
      : undefined;
  const resolvedName = explicitName ?? autoName;
  let projectName: string | undefined;
  if (
    resolvedName !== undefined &&
    packageNameIsValid(resolvedName) &&
    !RESERVED_PACKAGE_NAMES.has(resolvedName)
  ) {
    writePackageName(repo, resolvedName);
    projectName = resolvedName;
  }
  const installCode = runNpmInstall(repo);
  if (installCode !== 0) {
    return { code: installCode, lines: ["npm install failed"] };
  }
  writeConfigPaths(repo);
  mergeRootHarnessScripts(repo);
  writeHooks(repo);
  const existing = runGit(repo, [
    "config",
    "--default",
    "",
    "--get",
    "core.hooksPath",
  ]).trim();
  if (existing === "" || existing === ".githooks") {
    runGit(repo, ["config", "core.hooksPath", ".githooks"]);
  }
  const hooksPath = runGit(repo, ["config", "core.hooksPath"]).trim();
  const lines = [
    "dependencies installed",
    "harness scripts added to package.json",
    "configs resolved -> harness/configs.json",
    "git hooks installed",
    `git hooks path: ${hooksPath}`,
  ];
  if (projectName !== undefined) {
    lines.unshift(`project name set: ${projectName}`);
  }
  return { code: 0, lines };
}

function listRunLogs(repo: string): string[] {
  const runs = path.join(repo, "scratchpad", "runs");
  if (!existsSync(runs)) {
    return [];
  }
  const pattern = /^[0-9]+\.jsonl$/u;
  return readdirSync(runs, { withFileTypes: true }).flatMap((agent) => {
    const agentDirectory = path.join(runs, agent.name);
    return agent.isDirectory()
      ? readdirSync(agentDirectory, { withFileTypes: true }).flatMap((day) => {
        const dayDirectory = path.join(agentDirectory, day.name);
        return day.isDirectory()
          ? readdirSync(dayDirectory, { withFileTypes: true }).flatMap(
            (log) =>
              log.isFile() && pattern.test(log.name)
                ? [path.join(dayDirectory, log.name)]
                : [],
          )
          : [];
      })
      : [];
  });
}

function runStatus(): CommandResult {
  const repo = repoRoot(process.cwd());
  const runs = path.join(repo, "scratchpad", "runs");
  const logs = listRunLogs(repo);
  const lines = [`${logs.length} run log(s) in ${runs}`];
  if (logs.length > 0) {
    const newest = logs.toSorted(
      (left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs,
    )[0];
    lines.push(`newest: ${newest}`);
  }
  return { code: 0, lines };
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

function teeWorkerChunk(
  chunk: string,
  logStream: NodeJS.WritableStream,
  isVerbose: boolean,
  jq: string | undefined,
  rest: string,
): string {
  logStream.write(chunk);
  if (!isVerbose) {
    return rest;
  }
  const drained = drainLines(`${rest}${chunk}`, jq);
  process.stdout.write(drained.output);
  return drained.rest;
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
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdoutRest = "";
  let stderrRest = "";
  child.stdout.on("data", (chunk: string) => {
    stdoutRest = teeWorkerChunk(chunk, logStream, isVerbose, jq, stdoutRest);
  });
  child.stderr.on("data", (chunk: string) => {
    stderrRest = teeWorkerChunk(chunk, logStream, isVerbose, jq, stderrRest);
  });
  return new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (closeCode) => {
      if (isVerbose && stdoutRest.length > 0) {
        process.stdout.write(formatLiveLine(stdoutRest, jq));
      }
      if (isVerbose && stderrRest.length > 0) {
        process.stdout.write(formatLiveLine(stderrRest, jq));
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
    command === "run"
      ? await runLoop(cliArguments.slice(1))
      : command === "status"
        ? runStatus()
        : command === "setup"
          ? runSetup(cliArguments.slice(1))
          : run(command);
  for (const line of result.lines) {
    const stream =
      result.code === 0 && (command === "preflight" || command === "gate")
        ? process.stdout
        : process.stderr;
    stream.write(`${line}\n`);
  }
  process.exitCode = result.code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
