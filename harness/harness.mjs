#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "cli.ts");
const args = process.argv.slice(2);

// Invoke cli.ts's main() from here (this launcher is outside coverage) so cli.ts stays a pure,
// fully-tested module with no untestable "am I the entry module?" guard of its own.
const runCli =
  `import { pathToFileURL } from "node:url";` +
  `const { main } = await import(pathToFileURL(${JSON.stringify(cli)}).href);` +
  `await main(process.argv.slice(1));`;

let tsxLoader;
try {
  tsxLoader = require.resolve("tsx");
} catch {
  if (args[0] !== "setup") {
    process.stderr.write(
      "harness: missing harness dependencies; run harness setup\n",
    );
    process.exit(1);
  }
  const code =
    spawnSync("pnpm", ["install"], { cwd: here, stdio: "inherit" }).status ?? 1;
  if (code !== 0) {
    process.stderr.write("harness: failed to install harness dependencies\n");
    process.exit(code);
  }
  tsxLoader = require.resolve("tsx");
}

const child = spawn(
  process.execPath,
  ["--import", tsxLoader, "--eval", runCli, "--", ...args],
  {
    cwd: process.cwd(),
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  process.stderr.write(`harness: failed to launch JS CLI: ${error.message}\n`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal === null) {
    process.exitCode = code ?? 1;
    return;
  }
  process.kill(process.pid, signal);
});
