// Test-only helpers: real throwaway Git repos, the JS port of conftest.py's fixtures.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { gitSafeEnvironment, runGit } from "./gate.ts";

/**
Run a command with a GIT_*-free env, throwing on failure so a test fails loudly.
@param argv - The command and its arguments.
@param cwd - The working directory.
@returns The command's stdout.
*/
export function runCommand(argv: string[], cwd: string): string {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    encoding: "utf8",
    env: gitSafeEnvironment(),
  });
  if (result.status !== 0) {
    throw new Error(`${argv.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

/**
Create a Git repo with an identity and a clean initial commit.
@returns The repo root.
*/
export function makeRepo(): string {
  const repo = mkdtempSync(path.join(tmpdir(), "harness-"));
  runCommand(["git", "init", "-q"], repo);
  runCommand(["git", "config", "user.email", "harness@test.local"], repo);
  runCommand(["git", "config", "user.name", "harness-test"], repo);
  writeFileSync(path.join(repo, "README.md"), "seed\n");
  runCommand(["git", "add", "README.md"], repo);
  runCommand(["git", "commit", "-q", "-m", "seed"], repo);
  return repo;
}

/**
Write content to relpath (creating parents) and stage it.
@param repo - The repo root.
@param relpath - The repo-relative path.
@param content - The file content.
*/
export function stageFile(
  repo: string,
  relpath: string,
  content: string,
): void {
  const target = path.join(repo, relpath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  runCommand(["git", "add", "--", relpath], repo);
}

/**
The repo-relative paths currently staged in the index.
@param repo - The repo root.
@returns The staged paths.
*/
export function stagedNames(repo: string): string[] {
  return runGit(repo, ["diff", "--cached", "--name-only"])
    .split("\n")
    .filter((line) => line.length > 0);
}
