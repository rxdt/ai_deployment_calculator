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
import { fileURLToPath } from "node:url";

import { DEFAULT_CONFIGS, runGate, runGit, runPreflight } from "./gate.js";

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
  agy: ["agy", "--log-file", "agy.log", "--print"],
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
  run: "node harness/harness.mjs run",
  status: "node harness/harness.mjs status",
  test: "npm --prefix harness run test:coverage",
  "test:file": "npm --prefix harness run test:file --",
};

// Candidate user config filenames per check; if none exist, the harness default is used.
const CONFIG_CANDIDATES: Record<string, readonly string[]> = {
  eslint: [
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
  ],
  style: ["stylelint.config.js", "stylelint.config.cjs", ".stylelintrc.json"],
  html: [".htmlvalidate.json", ".htmlvalidate.js"],
  frontend_types: ["frontend/tsconfig.json", "tsconfig.json"],
  architecture: [
    ".dependency-cruiser.cjs",
    ".dependency-cruiser.js",
    ".dependency-cruiser.json",
  ],
  dead_code: ["knip.json", "knip.jsonc", "knip.config.ts"],
  spelling: ["cspell.json", "cspell.config.js", ".cspell.json"],
  workflow_api: [".spectral.yml", ".spectral.yaml", ".spectral.json"],
  coverage: [
    "vitest.config.ts",
    "vitest.config.js",
    "vite.config.ts",
    "vite.config.js",
  ],
  e2e: ["playwright.config.ts", "playwright.config.js"],
  lighthouse: ["lighthouserc.cjs", "lighthouserc.js", "lighthouserc.json"],
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

// jq path, resolved once for live JSONL coloring (undefined if not installed).
const JQ = (process.env["PATH"] ?? "")
  .split(path.delimiter)
  .map((dir) => path.join(dir, "jq"))
  .find((candidate) => existsSync(candidate));

// Repo root from any directory inside the checkout.
export function repoRoot(from: string): string {
  return runGit(from, ["rev-parse", "--show-toplevel"]).trim();
}

// Lowercase and keep only npm-name characters; strip leading dots; cap length. No regex.
function sanitizeName(raw: string): string {
  const allowed = "abcdefghijklmnopqrstuvwxyz0123456789-._/@";
  let name = [...raw.toLowerCase()]
    .filter((char) => allowed.includes(char))
    .join("");
  while (name.startsWith(".")) {
    name = name.slice(1);
  }
  return name.slice(0, 214);
}

// Every directory below root (except ignored ones) that holds its own package.json.
function discoverPackageDirs(repo: string): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(path.join(repo, dir), {
      withFileTypes: true,
    })) {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_INSTALL_DIRECTORIES.has(entry.name)) {
          visit(relative);
        }
      } else if (
        entry.isFile() &&
        entry.name === "package.json" &&
        dir !== ""
      ) {
        found.push(dir);
      }
    }
  };
  visit("");
  return found.toSorted((left, right) => left.localeCompare(right));
}

// Compact valid JSONL for terminal output; preserve invalid lines exactly.
function renderLine(line: string): string {
  if (JQ !== undefined) {
    const rendered = spawnSync(JQ, ["-C", "-c", "."], {
      input: line,
      encoding: "utf8",
    });
    if (rendered.status === 0 && rendered.stdout.length > 0) {
      return rendered.stdout;
    }
  }
  try {
    return `${JSON.stringify(JSON.parse(line))}\n`;
  } catch {
    return `${line}\n`;
  }
}

// Run the worker, saving stdout to the log and optionally streaming it live. stderr
// inherits the terminal; the worker reads its prompt from PROMPT.md inside ralph.sh.
function runWorker(
  command: string[],
  cwd: string,
  log: string,
  verbose: boolean,
): Promise<number> {
  const [executable = "", ...args] = command;
  const logStream = createWriteStream(log, { encoding: "utf8" });
  const child = spawn(executable, args, {
    cwd,
    stdio: ["ignore", "pipe", "inherit"],
  });
  child.stdout.setEncoding("utf8");
  let buffer = "";
  child.stdout.on("data", (chunk: string) => {
    logStream.write(chunk);
    if (!verbose) {
      return;
    }
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      process.stdout.write(renderLine(line));
    }
  });
  return new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (verbose && buffer.length > 0) {
        process.stdout.write(renderLine(buffer));
      }
      logStream.end(() => resolve(code ?? 1));
    });
  });
}

// preflight or gate: print one line per problem, then a verdict, and return the exit code.
function runGateCommand(kind: "preflight" | "gate"): number {
  const repo = repoRoot(process.cwd());
  const problems = kind === "preflight" ? runPreflight(repo) : runGate(repo);
  for (const problem of problems) {
    process.stderr.write(`gate: ${problem}\n`);
  }
  process.stderr.write(
    `${problems.length > 0 ? "rejected by harness" : `ok: ${kind} passed`}\n`,
  );
  return problems.length > 0 ? 1 : 0;
}

// Count run logs under scratchpad/runs and point at the newest.
function runStatus(): number {
  const runs = path.join(repoRoot(process.cwd()), "scratchpad", "runs");
  const logs = existsSync(runs)
    ? readdirSync(runs)
        .filter((name) => name.endsWith(".jsonl"))
        .toSorted((left, right) => left.localeCompare(right))
    : [];
  process.stdout.write(`${logs.length} run log(s) in ${runs}\n`);
  if (logs.length > 0) {
    process.stdout.write(
      `newest: ${path.join(runs, logs[logs.length - 1] ?? "")}\n`,
    );
  }
  return 0;
}

// Set the project name, install deps, resolve check configs, and point git at the hooks.
function runSetup(args: string[]): number {
  const repo = repoRoot(process.cwd());
  const packagePath = path.join(repo, "package.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
    name?: string;
    scripts?: Record<string, string>;
  };

  // explicit name, else derive from the repo folder when package.json has none
  const requested = args[0] ?? (pkg.name ? undefined : path.basename(repo));
  if (requested !== undefined) {
    const name = sanitizeName(requested);
    if (name.length === 0) {
      process.stderr.write(`invalid package name: ${args[0]}\n`);
      return 2;
    }
    pkg.name = name;
    process.stderr.write(`project name set: ${name}\n`);
  }

  // add harness scripts without overwriting the project's own (lint/test get an alias)
  const scripts = pkg.scripts ?? {};
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
  pkg.scripts = scripts;
  writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

  // install harness + every package dir below root (root is skipped to avoid lifecycle recursion)
  for (const dir of ["harness", ...discoverPackageDirs(repo)]) {
    const result = spawnSync("npm", ["install"], {
      cwd: path.join(repo, dir),
      stdio: "inherit",
    });
    if (result.status !== 0) {
      process.stderr.write("npm install failed\n");
      return result.status ?? 1;
    }
  }

  // resolve each check's config path (the user's if present, else the harness default)
  const configs: Record<string, string> = {};
  for (const [check, candidates] of Object.entries(CONFIG_CANDIDATES)) {
    const value =
      candidates.find((file) => existsSync(path.join(repo, file))) ??
      DEFAULT_CONFIGS[check];
    if (value !== undefined) {
      configs[check] = value;
    }
  }
  writeFileSync(
    path.join(repo, "harness", "configs.json"),
    `${JSON.stringify(configs, null, 2)}\n`,
  );

  // point git at the shipped hooks, unless the project already set its own hooksPath
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
    `dependencies installed; configs -> harness/configs.json; git hooks path: ${hooksPath}\n`,
  );
  return 0;
}

// Run one harnessed ralph loop: harness run <agent> [iterations] [minutes] [verbose].
export async function runLoop(args: string[]): Promise<number> {
  const agent = (args[0] ?? "").toLowerCase();
  const agentCommand = AGENTS[agent];
  if (agentCommand === undefined) {
    process.stderr.write(
      `unknown agent '${agent}'; choose from ${Object.keys(AGENTS).join(", ")}\n`,
    );
    return 2;
  }
  const iterations = args[1] === undefined ? 2 : Number(args[1]);
  const minutes = args[2] === undefined ? 20 : Number(args[2]);
  if (
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    !Number.isInteger(minutes) ||
    minutes < 1
  ) {
    process.stderr.write("num_iterations and max_minutes must be >= 1\n");
    return 2;
  }
  const verbose = args[3] !== "false";
  const repo = repoRoot(process.cwd());
  const runs = path.join(repo, "scratchpad", "runs");
  mkdirSync(runs, { recursive: true });

  // next sequence = 1 + the highest numeric prefix among existing NNNN-agent.jsonl logs
  const sequences = readdirSync(runs)
    .filter((name) => name.endsWith(".jsonl") && name.includes("-"))
    .map((name) => Number(name.slice(0, name.indexOf("-"))))
    .filter((value) => Number.isInteger(value));
  const sequence = 1 + Math.max(0, ...sequences);
  const log = path.join(
    runs,
    `${String(sequence).padStart(4, "0")}-${agent}.jsonl`,
  );

  const ralph = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "ralph.sh",
  );
  const command = [ralph, String(iterations), String(minutes), ...agentCommand];
  process.stderr.write(`harness: ${command.join(" ")} -> ${log}\n`);
  return runWorker(command, repo, log, verbose);
}

// Dispatch argv to a command and set the process exit code.
export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  let code: number;
  if (command === "preflight" || command === "gate") {
    code = runGateCommand(command);
  } else if (command === "status") {
    code = runStatus();
  } else if (command === "setup") {
    code = runSetup(rest);
  } else if (command === "run") {
    code = await runLoop(rest);
  } else {
    process.stderr.write("usage: harness <preflight|gate|run|status|setup>\n");
    code = 2;
  }
  process.exitCode = code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
