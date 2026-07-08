import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// Per-process coverage output dir, nested under `coverage/` so the existing `coverage/` ignore
// rules (git, prettier, eslint, stylelint, cspell) still cover it. Concurrent gate runs (e.g. the
// Ralph loop plus a manual `pnpm gate`) otherwise share `coverage/.tmp` and delete each other's
// mid-write shards, crashing with ENOENT on `coverage/.tmp/coverage-N.json`. PID isolates them.
const coverageDir = `coverage/${process.pid}`;

// Vitest owns the unit/coverage gate. Thresholds are hard 100s by contract;
// do not weaken them.
export default defineConfig({
  root: repoRoot,
  test: {
    // Default to node; only the frontend DOM suite needs jsdom (it opts in per-file). Booting jsdom
    // everywhere cost seconds for no benefit.
    environment: "node",
    // Suites spawn their own subprocesses and clean their globals in afterEach — no per-test module
    // isolation needed; disabling it drops re-init overhead.
    isolate: false,
    // Scope discovery to the real source roots. A bare `**/*.test.ts` recurses the whole
    // repo and picks up copies inside generated/installed dirs (e.g. a local .pnpm-store,
    // node_modules, gate.test.ts fixture trees), double-running suites and inflating counts.
    include: ["harness/**/*.test.ts", "frontend/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.pnpm-store/**",
      "**/.claude/worktrees/**",
      "**/dist/**",
      "**/tests/**",
      "**/scratchpad/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      reportsDirectory: coverageDir,
      // Cover only the harness engine + the frontend app source — never libraries,
      // generated fixtures, config files, or the e2e specs (run under the `e2e` check).
      include: ["harness/*.ts", "frontend/src/**/*.ts"],
      exclude: [
        "**/node_modules/**",
        "**/.pnpm-store/**",
        "**/dist/**",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/tests/**",
        "**/scratchpad/**",
      ],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
