import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// Vitest owns the unit/coverage gate. Thresholds are hard 100s by contract;
// do not weaken them.
export default defineConfig({
  root: repoRoot,
  test: {
    environment: "jsdom",
    include: ["**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["**/*.ts"],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
