import { defineConfig, devices } from "@playwright/test";

// Smoke config that drives the built SPA against the *real* FastAPI backend.
// Unlike playwright.config.ts (Vite dev server + mocked /api/report), this builds
// frontend/dist and serves it plus the live /api/report from one uvicorn process,
// so the test proves the real end-to-end request path.
export default defineConfig({
  testDir: "./tests",
  testMatch: /real-api\.spec\.ts$/,
  webServer: {
    command: "npm run build && PYTHONPATH=../src uv run --project .. uvicorn web.server:app --port 8001",
    url: "http://127.0.0.1:8001/api/report?parameters_b=8&context_tokens=8000&weight_bits=16&kv_cache_bits=16",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:8001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
