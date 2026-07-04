import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";

import * as gate from "./gate.js";

const USAGE = "usage: harness <preflight|gate|loop|status|setup>";
const LOOP_SETUP_ERROR = "harness setup must not run inside the agent loop\n";
const ROOT_SCRIPTS: Record<string, string> = {
  gate: "node harness/harness.mjs gate",
  setup: "node harness/harness.mjs setup",
  lint: "npm --prefix harness run lint",
  loop: "node harness/harness.mjs loop",
  status: "node harness/harness.mjs status",
  test: "npm --prefix harness run test:coverage",
  "test:file": "npm --prefix harness run test:file --",
};
const CODEX_COMMAND = (
  "env -u CODEX_THREAD_ID -u CODEX_CONVERSATION_ID -u CODEX_SESSION_ID " +
  "codex exec -m gpt-5.5 --json --sandbox danger-full-access -"
).split(" ");

export const AGENTS: Record<string, string[]> = {
  claude:
    "claude -p --permission-mode acceptEdits --no-session-persistence --output-format stream-json --verbose".split(
      " ",
    ),
  codex: CODEX_COMMAND,
  agy: "agy --log-file agy.log -p --dangerously-skip-permissions".split(" "),
  copilot: [
    "sh",
    "-c",
    'copilot --output-format json --stream on --allow-all-tools -p "$(cat)"',
  ],
};

interface LoopDependencies {
  now: () => number;
  cwd: () => string;
  ralphPath: () => string;
  listSequences: (directory: string) => number[];
  ensureDirectory: (directory: string) => unknown;
  worker: (...args: [string[], string, string, boolean]) => Promise<number>;
}

export const repoRoot = (from: string): string =>
  gate.runGit(from, ["rev-parse", "--show-toplevel"]).trim();
export const formatDate = (nowMs: number): string =>
  new Date(nowMs).toISOString().slice(0, 10);
export const nextSequence = (sequences: readonly number[]): number =>
  1 + Math.max(0, ...sequences);
export const parseCount = (
  raw: string | undefined,
  fallback: number,
): number | undefined => {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
};

export const formatLiveLine = (line: string): string => {
  const content = line.endsWith("\n") ? line.slice(0, -1) : line;
  try {
    return `${JSON.stringify(JSON.parse(content))}\n`;
  } catch {
    return `${content}\n`;
  }
};

export const drainLines = (
  buffer: string,
): { output: string; rest: string } => {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  return { output: lines.map((line) => `${line}\n`).join(""), rest };
};

const runWorker = async (
  command: string[],
  cwd: string,
  log: string,
  isVerbose: boolean,
): Promise<number> => {
  const [executable = "", ...agentArgs] = command;
  const logStream = fs.createWriteStream(log, { encoding: "utf8" });
  const child = spawn(executable, agentArgs, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buffer = "";
  const consume = (chunk: string): void => {
    logStream.write(chunk);
    if (!isVerbose) return;
    buffer += chunk;
    const { output, rest } = drainLines(buffer);
    buffer = rest;
    const liveLines = output.match(/[^\n]+/gu) ?? [];
    for (const line of liveLines) process.stdout.write(formatLiveLine(line));
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", consume);
  child.stderr.on("data", consume);
  let errorMessage = "";
  const exitCode = await new Promise<number>((resolve) => {
    child.once("error", (error) => {
      errorMessage = error.message;
      resolve(0);
    });
    child.once("close", (code) => {
      resolve(code ?? 0);
    });
  });
  if (errorMessage !== "")
    process.stderr.write(`harness: agent did not run: ${errorMessage}\n`);
  else if (exitCode !== 0)
    process.stderr.write(`harness: agent exited ${String(exitCode)}\n`);
  if (isVerbose && buffer.length > 0)
    process.stdout.write(formatLiveLine(buffer));
  logStream.end();
  return 0;
};

export const run = (
  command: string,
  dependencies: {
    preflight: (repo: string) => string[];
    gate: (repo: string) => string[];
    repoRoot: (from: string) => string;
  },
): { code: number; lines: string[] } => {
  if (command !== "preflight" && command !== "gate")
    return { code: 2, lines: [USAGE] };
  const repo = dependencies.repoRoot(process.cwd());
  const check =
    command === "preflight" ? dependencies.preflight : dependencies.gate;
  const problems = check(repo);
  const lines = problems.map((problem) => `gate: ${problem}`);
  lines.push(
    problems.length > 0 ? "rejected by harness" : `ok: ${command} passed`,
  );
  return { code: problems.length > 0 ? 1 : 0, lines };
};

const runStatus = (): number => {
  const runs = path.join(repoRoot(process.cwd()), "scratchpad", "runs");
  const logs = (
    fs.existsSync(runs) ? fs.readdirSync(runs, { recursive: true }) : []
  )
    .map(String)
    .filter((name) => name.endsWith(".jsonl"))
    .toSorted((left, right) => left.localeCompare(right));
  process.stdout.write(`${String(logs.length)} run log(s) in ${runs}\n`);
  if (logs.length > 0)
    process.stdout.write(`newest: ${path.join(runs, logs.at(-1) ?? "")}\n`);
  return 0;
};

const hasScript = (repo: string, name: string): boolean =>
  spawnSync("npm", ["pkg", "get", `scripts.${name}`], {
    cwd: repo,
    encoding: "utf8",
  }).stdout.trim() !== "{}";

const addRootScripts = (repo: string): number => {
  const args = ["set"];
  for (const [name, command] of Object.entries(ROOT_SCRIPTS)) {
    const alias = `harness:${name}`;
    if (!hasScript(repo, name)) args.push(`scripts.${name}=${command}`);
    else if ((name === "lint" || name === "test") && !hasScript(repo, alias))
      args.push(`scripts.${alias}=${command}`);
  }
  if (args.length === 1) return 0;
  const result = spawnSync("npm", ["pkg", ...args], {
    cwd: repo,
    encoding: "utf8",
  });
  if (result.status !== 0) process.stderr.write(result.stderr);
  return result.status ?? 0;
};

const installPackages = (repo: string): number => {
  for (const directory of ["harness", "frontend"]) {
    if (!fs.existsSync(path.join(repo, directory, "package.json"))) continue;
    const result = spawnSync("npm", ["install"], {
      cwd: path.join(repo, directory),
      stdio: "inherit",
    });
    if (result.status !== 0) {
      process.stderr.write("npm install failed\n");
      return result.status ?? 1;
    }
  }
  return 0;
};

const runSetup = (cliArgs: string[]): number => {
  if (cliArgs.length > 0 || process.env.RALPH_LOOP === "1") {
    process.stderr.write(
      cliArgs.length > 0 ? "usage: harness setup\n" : LOOP_SETUP_ERROR,
    );
    return 2;
  }
  const repo = repoRoot(process.cwd());
  const scriptCode = addRootScripts(repo);
  if (scriptCode !== 0) return scriptCode;
  const installCode = installPackages(repo);
  if (installCode !== 0) return installCode;
  const existing = gate
    .runGit(repo, ["config", "--default", "", "--get", "core.hooksPath"])
    .trim();
  if (existing === "" || existing === ".githooks")
    gate.runGit(repo, ["config", "core.hooksPath", ".githooks"]);
  const hooksPath = gate.runGit(repo, ["config", "core.hooksPath"]).trim();
  process.stderr.write(
    `dependencies installed; git hooks path: ${hooksPath}\n`,
  );
  return 0;
};

export const runLoop = async (
  cliArgs: string[],
  dependencies: LoopDependencies,
): Promise<{ code: number; lines: string[] }> => {
  const agent = (cliArgs[0] ?? "").toLowerCase();
  const agentCommand = AGENTS[agent];
  if (agentCommand === undefined) {
    const choices = Object.keys(AGENTS).join(", ");
    return {
      code: 2,
      lines: [`unknown agent '${agent}'; choose from ${choices}`],
    };
  }
  const iterations = parseCount(cliArgs[1], 2);
  const minutes = parseCount(cliArgs[2], 20);
  if (iterations === undefined || minutes === undefined)
    return { code: 2, lines: ["num_iterations and max_minutes must be >= 1"] };
  const cwd = dependencies.cwd();
  const dayStamp = formatDate(dependencies.now());
  const day = path.join(cwd, "scratchpad/runs", agent, dayStamp);
  dependencies.ensureDirectory(day);
  const sequence = nextSequence(dependencies.listSequences(day));
  const log = path.join(day, `${String(sequence).padStart(4, "0")}.jsonl`);
  const command = [
    dependencies.ralphPath(),
    String(iterations),
    String(minutes),
    ...agentCommand,
  ];
  const isVerbose = cliArgs[3] !== "false";
  const code = await dependencies.worker(command, cwd, log, isVerbose);
  return { code, lines: [`harness: ${command.join(" ")} -> ${log}`] };
};

const loopDependencies = (): LoopDependencies => ({
  now: () => Date.now(),
  cwd: () => repoRoot(process.cwd()),
  ralphPath: () => path.join(import.meta.dirname, "ralph.sh"),
  listSequences: (directory) =>
    (fs.existsSync(directory) ? fs.readdirSync(directory) : [])
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => Number(name.slice(0, name.indexOf(".jsonl"))))
      .filter((value) => Number.isSafeInteger(value)),
  ensureDirectory: (directory) => fs.mkdirSync(directory, { recursive: true }),
  worker: runWorker,
});

export const main = async (argv: string[]): Promise<void> => {
  const command = argv[0] ?? "";
  if (command === "preflight" || command === "gate") {
    const result = run(command, {
      preflight: gate.runPreflight,
      gate: gate.runGate,
      repoRoot,
    });
    process.stderr.write(`${result.lines.join("\n")}\n`);
    process.exitCode = result.code;
    return;
  }
  const rest = argv.slice(1);
  if (command === "loop") {
    const result = await runLoop(rest, loopDependencies());
    process.stderr.write(`${result.lines.join("\n")}\n`);
    process.exitCode = result.code;
    return;
  }
  if (command === "status") {
    process.exitCode = runStatus();
    return;
  }
  if (command === "setup") {
    process.exitCode = runSetup(rest);
    return;
  }
  process.stderr.write(`${USAGE}\n`);
  process.exitCode = 2;
};

if (process.argv[1] === import.meta.filename) await main(process.argv.slice(2));
