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
  loop: "node harness/harness.mjs loop",
  status: "node harness/harness.mjs status",
  test: "npm --prefix harness run test:coverage",
  "test:file": "npm --prefix harness run test:file --",
};

// Candidate user config filenames per check; harness-owned configs are already defaults.
const CONFIG_CANDIDATES: Record<string, readonly string[]> = {
  eslint: [
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
  ],
  style: ["stylelint.config.js", "stylelint.config.cjs", ".stylelintrc.json"],
  html: [".htmlvalidate.json", ".htmlvalidate.js"],
  typecheck: ["frontend/tsconfig.json", "tsconfig.json"],
  cruise: [
    ".dependency-cruiser.cjs",
    ".dependency-cruiser.js",
    ".dependency-cruiser.json",
  ],
  deadcode: ["knip.json", "knip.jsonc", "knip.config.ts"],
  spelling: ["cspell.json", "cspell.config.js", ".cspell.json"],
  workflow: [".spectral.yml", ".spectral.yaml", ".spectral.json"],
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
const JQ = (process.env.PATH ?? "")
  .split(path.delimiter)
  .map((directory) => path.join(directory, "jq"))
  .find((candidate) => existsSync(candidate));

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

// Compact valid JSONL for terminal output; preserve invalid lines exactly.
/**

* @param line
*/
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
    stdio: ["ignore", "pipe", "inherit"],
  });
  child.stdout.setEncoding("utf8");
  let buffer = "";
  child.stdout.on("data", (chunk: string) => {
    logStream.write(chunk);
    if (!isVerbose) {
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
      if (isVerbose && buffer.length > 0) {
        process.stdout.write(renderLine(buffer));
      }
      logStream.end(() => { resolve(code ?? 1); });
    });
  });
}

// preflight or gate: print one line per problem, then a verdict, and return the exit code.
/**

* @param kind
*/
function runGateCommand(kind: "preflight" | "gate"): number {
  const repo = repoRoot(process.cwd());
  const problems = kind === "preflight" ? runPreflight(repo) : runGate(repo);
  for (const problem of problems) {
    process.stderr.write(`gate: ${problem}\n`);
  }
  const verdict =
    problems.length > 0 ? "rejected by harness" : `ok: ${kind} passed`;
  process.stderr.write(`${verdict}\n`);
  return problems.length > 0 ? 1 : 0;
}

// Count run logs under scratchpad/runs and point at the newest.
/**

*/
function runStatus(): number {
  const runs = path.join(repoRoot(process.cwd()), "scratchpad", "runs");
  const logs = existsSync(runs)
    ? readdirSync(runs)
        .filter((name) => name.endsWith(".jsonl"))
        .toSorted((left, right) => left.localeCompare(right))
    : [];
  process.stdout.write(`${String(logs.length)} run log(s) in ${runs}\n`);
  if (logs.length > 0) {
    process.stdout.write(
      `newest: ${path.join(runs, logs.at(-1) ?? "")}\n`,
    );
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
  const harnessPackage = JSON.parse(readFileSync(harnessPackagePath, "utf8")) as {
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

// Run one harnessed ralph loop: harness loop <agent> [iterations] [minutes] [verbose].
/**

* @param arguments_
*/
export async function runLoop(arguments_: string[]): Promise<number> {
  const agent = (arguments_[0] ?? "").toLowerCase();
  const agentCommand = AGENTS[agent];
  if (agentCommand === undefined) {
    process.stderr.write(
      `unknown agent '${agent}'; choose from ${Object.keys(AGENTS).join(", ")}\n`,
    );
    return 2;
  }
  const iterations = arguments_[1] === undefined ? 2 : Number(arguments_[1]);
  const minutes = arguments_[2] === undefined ? 20 : Number(arguments_[2]);
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < 1 ||
    !Number.isSafeInteger(minutes) ||
    minutes < 1
  ) {
    process.stderr.write("num_iterations and max_minutes must be >= 1\n");
    return 2;
  }
  const isVerbose = arguments_[3] !== "false";
  const repo = repoRoot(process.cwd());
  const runs = path.join(repo, "scratchpad", "runs");
  mkdirSync(runs, { recursive: true });

  // next sequence = 1 + the highest numeric prefix among existing NNNN-agent.jsonl logs
  const sequences = readdirSync(runs)
    .filter((name) => name.endsWith(".jsonl") && name.includes("-"))
    .map((name) => Number(name.slice(0, name.indexOf("-"))))
    .filter((value) => Number.isSafeInteger(value));
  const sequence = 1 + Math.max(0, ...sequences);
  const log = path.join(
    runs,
    `${String(sequence).padStart(4, "0")}-${agent}.jsonl`,
  );

  const ralph = path.join(
    import.meta.dirname,
    "ralph.sh",
  );
  const command = [ralph, String(iterations), String(minutes), ...agentCommand];
  process.stderr.write(`harness: ${command.join(" ")} -> ${log}\n`);
  return runWorker(command, repo, log, isVerbose);
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
    code = runGateCommand(command);
  
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
    code = await runLoop(rest);
  
  break;
  }
  default: {
    process.stderr.write("usage: harness <preflight|gate|loop|status|setup>\n");
    code = 2;
  }
  }
  process.exitCode = code;
}

if (process.argv[1] === import.meta.filename) {
  await main(process.argv.slice(2));
}
