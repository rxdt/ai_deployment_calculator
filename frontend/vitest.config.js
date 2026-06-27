import { defineConfig } from "vitest/config";

// Vitest owns the unit/coverage gate. Thresholds are hard 100s by contract;
// do not weaken them. Coverage includes all production TS under src/.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
