import { defineConfig } from "vitest/config";

// The harness's own self-check, separate from the app suite (app vitest only covers src/).
// Coverage is a hard 100% on the gate + preferences logic; the I/O CLI and test helpers are excluded.
export default defineConfig({
  test: {
    include: ["harness/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["harness/gate.ts", "harness/preferences.ts"],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
