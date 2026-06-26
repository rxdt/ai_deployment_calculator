import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // The real-backend smoke runs under playwright.real-api.config.ts against uvicorn,
  // not this mocked Vite dev-server config.
  testIgnore: /real-api\.spec\.ts$/,
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
