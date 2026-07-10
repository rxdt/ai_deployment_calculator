import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";

import * as gate from "./gate.js";
import { renderStatus } from "./logging.js";

const USAGE = "usage: harness <preflight|gate|loop|status|setup>";
const LOOP_ERROR = "harness setup must not run inside the agent loop\n";
const ROOT_SCRIPTS: Record<string, string> = {
  gate: "node harness/harness.mjs gate",
  setup: "node harness/harness.mjs setup",
  lint: "pnpm --prefix harness run lint",
  loop: "node harness/harness.mjs loop",
  status: "node harness/harness.mjs status",
  test: "pnpm --prefix harness run test:coverage",
  "test:file": "pnpm --prefix harness run test:file --",
};
const CODEX_COMMAND = (
  "env -u CODEX_THREAD_ID -u CODEX_CONVERSATION_ID -u CODEX_SESSION_ID " +
  "codex exec -m gpt-5.5 --json --sandbox danger-full-access -"
).split(" ");

export const AGENTS: Record<string, string[]> = {
  claude:
    "claude -p --dangerously-skip-permissions --no-session-persistence --output-format stream-json --verbose".split(
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
  // Split at the last newline: everything up to and including it is complete output; the tail
  // after it (possibly empty) is the partial line to carry over. Slicing avoids an index/pop
  // fallback branch entirely.
  const cut = buffer.lastIndexOf("\n");
  return { output: buffer.slice(0, cut + 1), rest: buffer.slice(cut + 1) };
};

export const runWorker = async (
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
  // Every iteration — success or not — is logged for visibility, then the loop continues; the exit
  // is never propagated, so one nonzero iteration (e.g. a 124 timeout) can't abort the loop.
  await new Promise<void>((resolve) => {
    child.once("error", (error: Error) => {
      process.stderr.write(`harness: agent did not run: ${error.message}\n`);
      resolve();
    });
    child.once("close", (code: number | null, signal: string | null) => {
      process.stderr.write(`harness: agent exited ${signal ?? String(code)}\n`);
      resolve();
    });
  });
  if (isVerbose && buffer.length > 0)
    process.stdout.write(formatLiveLine(buffer));
  await new Promise<void>((resolve) => {
    logStream.end(resolve);
  });
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
  process.stderr.write(`cli: received ${command}; start in ${repo}\n`);
  const problems = dependencies[command](repo);
  process.stderr.write(
    `cli: done ${command}: ${String(problems.length)} issues\n`,
  );
  const lines = problems.map((problem) => `gate: ${problem}`);
  lines.push(
    problems.length > 0 ? "rejected by harness" : `ok: ${command} passed`,
  );
  return { code: problems.length > 0 ? 1 : 0, lines };
};

export const runStatus = (): number => {
  const repo = repoRoot(process.cwd());
  process.stdout.write(renderStatus(repo));
  return 0;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isObjectRecord(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

// Merge the harness root scripts into an existing scripts map (mutates + returns it). A `lint`/
// `test` name the project already defines is kept; the harness command is added under a
// `harness:<name>` alias instead so the project's own script wins.
export const mergeRootScripts = (
  scripts: Record<string, string>,
): Record<string, string> => {
  for (const [name, command] of Object.entries(ROOT_SCRIPTS)) {
    if (!Object.hasOwn(scripts, name)) scripts[name] = command;
    else if (
      (name === "lint" || name === "test") &&
      !Object.hasOwn(scripts, `harness:${name}`)
    )
      scripts[`harness:${name}`] = command;
  }
  return scripts;
};

// Add the harness root scripts by editing package.json directly. (`pnpm pkg set` can't address a
// script key containing ":" like "test:file" — it errors ERR_PNPM_UNEXPECTED_TOKEN_IN_PROPERTY_PATH
// — so we read/merge/write the file ourselves, which also handles every other key.)
export const addRootScripts = (repo: string): number => {
  const packagePath = path.join(repo, "package.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  } catch {
    process.stderr.write("harness setup: cannot read root package.json\n");
    return 1;
  }
  if (!isObjectRecord(parsed)) {
    process.stderr.write("harness setup: root package.json is not an object\n");
    return 1;
  }
  const existing = parsed.scripts;
  parsed.scripts = mergeRootScripts(
    isStringRecord(existing) ? { ...existing } : {},
  );
  fs.writeFileSync(packagePath, `${JSON.stringify(parsed, null, 2)}\n`);
  return 0;
};

export const installPackages = (repo: string): number => {
  // One workspace-aware install at the repo root installs every workspace project (frontend +
  // harness). `--ignore-scripts`: setup must not run the target repo's install/postinstall
  // lifecycle hooks (untrusted code, and not needed to fetch the harness toolchain).
  const result = spawnSync("pnpm", ["install", "--ignore-scripts"], {
    cwd: repo,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const detail =
      result.error === undefined
        ? `${result.stdout}${result.stderr}`
        : String(result.error);
    process.stderr.write(`pnpm install failed\n${detail}\n`);
    return result.status ?? 1;
  }
  return 0;
};

export const runSetup = (cliArgs: string[]): number => {
  if (cliArgs.length > 0 || process.env.RALPH_LOOP === "1") {
    process.stderr.write(
      cliArgs.length > 0 ? "usage: harness setup\n" : LOOP_ERROR,
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
  const [agentArgument = ""] = cliArgs;
  const agent = agentArgument.toLowerCase();
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

export const loopDependencies = (): LoopDependencies => ({
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
