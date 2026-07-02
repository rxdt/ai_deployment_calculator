// Command-line interface for the ralph harness. Plain pass-through commands, no objects.

import { spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  CONFIG_CANDIDATES,
  DEFAULT_CONFIGS,
  runGate,
  runGit,
  runPreflight,
} from "./gate.js";

// Re-exported for callers/tests that treat config-candidate discovery as a CLI concern.
export { CONFIG_CANDIDATES };

export const AGENTS: Record<string, string[]> = {
  claude: [
    "claude",
    "-p",
    "--permission-mode",
    "acceptEdits",
    "--no-session-persistence", // disposable: don't save session state
    "--output-format",
    "stream-json",
    "--verbose",
  ],
  codex: [
    // strip the parent's codex session so the worker starts fresh
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
  // -p reads the prompt from stdin (ralph pipes it); skip-permissions for non-interactive runs
  agy: ["agy", "--log-file", "agy.log", "-p", "--dangerously-skip-permissions"],
  copilot: [
    "sh",
    "-c",
    'copilot --output-format json --stream on --allow-all-tools -p "$(cat)"',
  ],
};

// Root scripts the harness adds (only if absent); lint/test fall back to a harness: alias.
const ROOT_HARNESS_SCRIPTS: Record<string, string> = {
  gate: "node harness/harness.mjs gate",
  setup: "node harness/harness.mjs setup",
  lint: "npm --prefix harness run lint",
  loop: "node harness/harness.mjs loop",
  status: "node harness/harness.mjs status",
  test: "npm --prefix harness run test:coverage",
  "test:file": "npm --prefix harness run test:file --",
};

// Dirs we never recurse into when discovering package.json files to install.
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

const USAGE = "usage: harness <preflight|gate|loop|status|setup>";

// Repo root from any directory inside the checkout.
/**

* @param from
*/
export function repoRoot(from: string): string {
  return runGit(from, ["rev-parse", "--show-toplevel"]).trim();
}

// Every directory below root (except ignored ones) that holds its own package.json.
/**

* @param repo
*/
function discoverPackageDirectories(repo: string): string[] {
  const found: string[] = [];
  const visit = (directory: string): void => {
    const entries = readdirSync(path.join(repo, directory), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_INSTALL_DIRECTORIES.has(entry.name)) {
          visit(relative);
        }
      } else if (
        entry.isFile() &&
        entry.name === "package.json" &&
        directory !== ""
      ) {
        found.push(directory);
      }
    }
  };
  visit("");
  return found.toSorted((left, right) => left.localeCompare(right));
}

// UTC calendar day for the run log directory (stable across time zones).
/**

* @param nowMs
*/
export function formatDate(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

// Next run sequence: one past the highest existing sequence (1 when there are none).
/**

* @param sequences
*/
export function nextSequence(sequences: readonly number[]): number {
  return 1 + Math.max(0, ...sequences);
}

// Parse a positive-integer CLI count, falling back when omitted; undefined when invalid.
/**

* @param raw
* @param fallback
*/
export function parseCount(
  raw: string | undefined,
  fallback: number,
): number | undefined {
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}

// Compact one valid JSONL line for terminal output; preserve invalid lines exactly.
/**

* @param line
*/
export function formatLiveLine(line: string): string {
  const content = line.endsWith("\n") ? line.slice(0, -1) : line;
  try {
    return `${JSON.stringify(JSON.parse(content))}\n`;
  } catch {
    return `${content}\n`;
  }
}

// Split a stream buffer into complete lines to emit plus the trailing partial line to keep.
/**

* @param buffer
*/
export function drainLines(buffer: string): { output: string; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const output = lines.map((line) => `${line}\n`).join("");
  return { output, rest };
}

// Injected side effects for runLoop, so the pure sequencing logic stays testable.
interface LoopDependencies {
  now: () => number;
  cwd: () => string;
  ralphPath: () => string;
  listSequences: (directory: string) => number[];
  ensureDirectory: (directory: string) => unknown;
  worker: (
    command: string[],
    cwd: string,
    log: string,
    isVerbose: boolean,
  ) => Promise<number>;
}

interface CommandResult {
  code: number;
  lines: string[];
}

// Run the worker, teeing stdout+stderr to the log and (when verbose) live to our stdout.
// The worker reads its prompt from PROMPT.md inside ralph.sh. Orchestration is fire-and-log:
// a missing (ENOENT) or failing agent is reported but never fails the harness itself.
/**

* @param command
* @param cwd
* @param log
* @param isVerbose
*/
async function runWorker(
  command: string[],
  cwd: string,
  log: string,
  isVerbose: boolean,
): Promise<number> {
  const [executable = "", ...arguments_] = command;
  const logStream = createWriteStream(log, { encoding: "utf8" });
  const child = spawn(executable, arguments_, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buffer = "";
  const consume = (chunk: string): void => {
    logStream.write(chunk);
    if (!isVerbose) {
      return;
    }
    buffer += chunk;
    const { output, rest } = drainLines(buffer);
    buffer = rest;
    for (const line of output.split("\n").filter((entry) => entry.length > 0)) {
      process.stdout.write(formatLiveLine(line));
    }
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", consume);
  child.stderr.on("data", consume);
  return new Promise<number>((resolve) => {
    // The agent binary may be uninstalled; report it, don't crash the loop.
    child.on("error", (error) => {
      process.stderr.write(`harness: agent did not run: ${error.message}\n`);
      logStream.end(() => {
        resolve(0);
      });
    });
    child.on("close", (code) => {
      if (isVerbose && buffer.length > 0) {
        process.stdout.write(formatLiveLine(buffer));
      }
      if (code !== null && code !== 0) {
        process.stderr.write(`harness: agent exited ${String(code)}\n`);
      }
      logStream.end(() => {
        resolve(0);
      });
    });
  });
}

// Pure dispatcher for the synchronous gate commands: returns the exit code and output lines.
/**

* @param command
* @param deps
*/
export function run(
  command: string,
  deps: {
    preflight: (repo: string) => string[];
    gate: (repo: string) => string[];
    repoRoot: (from: string) => string;
  },
): CommandResult {
  if (command !== "preflight" && command !== "gate") {
    return { code: 2, lines: [USAGE] };
  }
  const repo = deps.repoRoot(process.cwd());
  const problems =
    command === "preflight" ? deps.preflight(repo) : deps.gate(repo);
  const lines = problems.map((problem) => `gate: ${problem}`);
  lines.push(
    problems.length > 0 ? "rejected by harness" : `ok: ${command} passed`,
  );
  return { code: problems.length > 0 ? 1 : 0, lines };
}

// Count run logs under scratchpad/runs and point at the newest.
/**

*/
function runStatus(): number {
  const runs = path.join(repoRoot(process.cwd()), "scratchpad", "runs");
  const logs = existsSync(runs)
    ? readdirSync(runs, { recursive: true })
        .map((entry) => String(entry))
        .filter((name) => name.endsWith(".jsonl"))
        .toSorted((left, right) => left.localeCompare(right))
    : [];
  process.stdout.write(`${String(logs.length)} run log(s) in ${runs}\n`);
  if (logs.length > 0) {
    process.stdout.write(`newest: ${path.join(runs, logs.at(-1) ?? "")}\n`);
  }
  return 0;
}

// Install deps, apply user config overrides, and point Git at the hooks.
/**

* @param arguments_
*/
function runSetup(arguments_: string[]): number {
  if (arguments_.length > 0) {
    process.stderr.write("usage: harness setup\n");
    return 2;
  }
  // setup is a one-time human bootstrap; it adopts on-disk user configs and rewrites gate
  // scripts, so an agent must never run it (it could repoint the gate at a toothless config).
  if (process.env.RALPH_LOOP === "1") {
    process.stderr.write("harness setup must not run inside the agent loop\n");
    return 2;
  }

  const repo = repoRoot(process.cwd());
  const packagePath = path.join(repo, "package.json");
  const package_ = JSON.parse(readFileSync(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
  };

  // add harness scripts without overwriting the project's own (lint/test get an alias)
  const scripts = package_.scripts ?? {};
  for (const [name, command] of Object.entries(ROOT_HARNESS_SCRIPTS)) {
    if (!Object.hasOwn(scripts, name)) {
      scripts[name] = command;
    } else if (
      (name === "lint" || name === "test") &&
      !Object.hasOwn(scripts, `harness:${name}`)
    ) {
      scripts[`harness:${name}`] = command;
    }
  }
  package_.scripts = scripts;
  writeFileSync(packagePath, `${JSON.stringify(package_, null, 2)}\n`);

  // install harness + every package dir below root (root is skipped to avoid lifecycle recursion)
  for (const directory of ["harness", ...discoverPackageDirectories(repo)]) {
    const result = spawnSync("npm", ["install"], {
      cwd: path.join(repo, directory),
      stdio: "inherit",
    });
    if (result.status !== 0) {
      process.stderr.write("npm install failed\n");
      return result.status ?? 1;
    }
  }

  const harnessPackagePath = path.join(repo, "harness", "package.json");
  const harnessPackage = JSON.parse(
    readFileSync(harnessPackagePath, "utf8"),
  ) as {
    scripts?: Record<string, string>;
  };
  const harnessScripts = harnessPackage.scripts ?? {};
  let configOverrides = 0;
  for (const [check, candidates] of Object.entries(CONFIG_CANDIDATES)) {
    const defaultConfig = DEFAULT_CONFIGS[check];
    const userConfig = candidates.find((file) =>
      existsSync(path.join(repo, file)),
    );
    if (defaultConfig === undefined || userConfig === undefined) {
      continue;
    }
    for (const [script, command] of Object.entries(harnessScripts)) {
      const next = command.replaceAll(defaultConfig, () => userConfig);
      if (next !== command) {
        harnessScripts[script] = next;
        configOverrides += 1;
      }
    }
  }
  if (configOverrides > 0) {
    harnessPackage.scripts = harnessScripts;
    writeFileSync(
      harnessPackagePath,
      `${JSON.stringify(harnessPackage, null, 2)}\n`,
    );
  }

  // point Git at the shipped hooks, unless the project already set its own hooksPath
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
  process.stderr.write(
    `dependencies installed; config overrides: ${String(configOverrides)}; git hooks path: ${hooksPath}\n`,
  );
  return 0;
}

// Sequence one harnessed ralph loop; side effects are injected so the logic stays testable.
/**

* @param arguments_
* @param deps
*/
export async function runLoop(
  arguments_: string[],
  deps: LoopDependencies,
): Promise<CommandResult> {
  const agent = (arguments_[0] ?? "").toLowerCase();
  const agentCommand = AGENTS[agent];
  if (agentCommand === undefined) {
    return {
      code: 2,
      lines: [
        `unknown agent '${agent}'; choose from ${Object.keys(AGENTS).join(", ")}`,
      ],
    };
  }
  const iterations = parseCount(arguments_[1], 2);
  const minutes = parseCount(arguments_[2], 20);
  if (iterations === undefined || minutes === undefined) {
    return { code: 2, lines: ["num_iterations and max_minutes must be >= 1"] };
  }
  const isVerbose = arguments_[3] !== "false";
  const cwd = deps.cwd();
  const day = path.join(
    cwd,
    "scratchpad",
    "runs",
    agent,
    formatDate(deps.now()),
  );
  deps.ensureDirectory(day);
  const sequence = nextSequence(deps.listSequences(day));
  const log = path.join(day, `${String(sequence).padStart(4, "0")}.jsonl`);
  const command = [
    deps.ralphPath(),
    String(iterations),
    String(minutes),
    ...agentCommand,
  ];
  const code = await deps.worker(command, cwd, log, isVerbose);
  return { code, lines: [`harness: ${command.join(" ")} -> ${log}`] };
}

// Production dependencies for runLoop: real clock, cwd, filesystem, and worker.
/**

*/
function loopDependencies(): LoopDependencies {
  return {
    now: () => Date.now(),
    cwd: () => repoRoot(process.cwd()),
    ralphPath: () => path.join(import.meta.dirname, "ralph.sh"),
    listSequences: (directory) =>
      (existsSync(directory) ? readdirSync(directory) : [])
        .filter((name) => name.endsWith(".jsonl"))
        .map((name) => Number(name.slice(0, name.indexOf(".jsonl"))))
        .filter((value) => Number.isSafeInteger(value)),
    ensureDirectory: (directory) => {
      mkdirSync(directory, { recursive: true });
    },
    worker: runWorker,
  };
}

// Dispatch argv to a command and set the process exit code.
/**

* @param argv
*/
export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  let code: number;
  switch (command) {
    case "preflight":
    case "gate": {
      const result = run(command, {
        preflight: runPreflight,
        gate: runGate,
        repoRoot,
      });
      for (const line of result.lines) {
        process.stderr.write(`${line}\n`);
      }
      code = result.code;
      break;
    }
    case "status": {
      code = runStatus();
      break;
    }
    case "setup": {
      code = runSetup(rest);
      break;
    }
    case "loop": {
      const result = await runLoop(rest, loopDependencies());
      for (const line of result.lines) {
        process.stderr.write(`${line}\n`);
      }
      code = result.code;
      break;
    }
    default: {
      process.stderr.write(`${USAGE}\n`);
      code = 2;
    }
  }
  process.exitCode = code;
}

if (process.argv[1] === import.meta.filename) {
  await main(process.argv.slice(2));
}
