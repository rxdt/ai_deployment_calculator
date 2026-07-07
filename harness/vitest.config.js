import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// Vitest owns the unit/coverage gate. Thresholds are hard 100s by contract;
// do not weaken them.
export default defineConfig({
  root: repoRoot,
  test: {
    environment: "jsdom",
    // Scope discovery to the real source roots. A bare `**/*.test.ts` recurses the whole
    // repo and picks up copies inside generated/installed dirs (e.g. a local .pnpm-store,
    // node_modules, gate.test.ts fixture trees), double-running suites and inflating counts.
    include: ["harness/**/*.test.ts", "frontend/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.pnpm-store/**",
      "**/dist/**",
      "**/tests/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text"],
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
