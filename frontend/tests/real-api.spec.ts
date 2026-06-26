import { expect, test } from "@playwright/test";

// End-to-end smoke against the real FastAPI backend (no route mocking). The built
// SPA loads from uvicorn, issues a live /api/report request for the query string,
// and must render the same total the backend computes. The expected total mirrors
// tests/test_server.py so a backend math drift breaks this test instead of passing
// silently. See playwright.real-api.config.ts for the server wiring.
test("renders a live backend report for query inputs without mocking the API", async ({ page }) => {
  const apiResponses: number[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/report")) {
      apiResponses.push(response.status());
    }
  });

  await page.goto(
    "/?parameters_b=70&context_tokens=8000&weight_bits=4&kv_cache_bits=8&trained=on&use_adapter=on",
  );

  await expect(page.getByRole("heading", { name: "VRAM Deployment Calculator" })).toBeVisible();
  await expect(page.locator(".total")).toHaveText("48.4 GB");
  await expect(page.getByLabel("Hardware recommendations")).toContainText("A100 80GB");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(apiResponses).toContain(200);
});
