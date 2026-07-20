import { defineConfig, devices } from "@playwright/test";

// End-to-end gate. Specs live in frontend/tests (they exercise the calculator);
// this harness-owned config drives the frontend app via the dev server below.
export default defineConfig({
  testDir: "../frontend/tests",
  // Cap concurrent browser workers so one e2e run cannot saturate all cores.
  // Without this, Playwright defaults to CPU-count workers (~10 here) and, with
  // multiple loop agents each running `pnpm gate`, pegs the machine and freezes
  // the desktop. 2 keeps the suite fast enough while leaving headroom.
  workers: 2,
  webServer: {
    // Port 5184 (not the Vite default 5173) so a parallel `pnpm gate` from
    // another loop agent — or the sibling gh_site repo, which uses 5183 — cannot
    // collide on the e2e dev server. Its preview counterpart uses 4184.
    command: "npm --prefix ../frontend run dev -- --port 5184",
    url: "http://127.0.0.1:5184",
    // Always own the dev-server lifecycle so Playwright starts AND stops it; a
    // reused server would linger after the run and leak across gate invocations.
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
  use: {
    baseURL: "http://127.0.0.1:5184",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-safari", use: { ...devices["Desktop Safari"] } },
    { name: "iphone", use: { ...devices["iPhone 13"] } },
    { name: "pixel", use: { ...devices["Pixel 5"] } },
    {
      name: "small-320",
      use: {
        viewport: { width: 320, height: 700 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "tablet",
      use: {
        viewport: { width: 768, height: 1024 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
