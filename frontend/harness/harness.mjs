#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "cli.ts");
const tsxLoader = require.resolve("tsx");

const child = spawn(
  process.execPath,
  ["--import", tsxLoader, cli, ...process.argv.slice(2)],
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
