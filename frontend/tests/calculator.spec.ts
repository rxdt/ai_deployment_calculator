import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

test("page has no accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("renders the default deployment computed locally", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "VRAM Deployment Calculator" }),
  ).toBeVisible();
  await expect(page.locator('[data-out="total"]')).toHaveText("19.0 GB");
  await expect(page.locator('[data-out="gpu-class"]')).toHaveText(
    "24 GB GPU hardware tier",
  );
  await expect(page.locator('[data-out="min-cap"]')).toHaveText("22.4 GB");
  await expect(page.locator('[data-out="speed"]')).toContainText("tokens/sec");
  await expect(page.locator('[data-out="breakdown"] li')).toHaveCount(5);
});

test("recomputes when parameters change", async ({ page }) => {
  await page.goto("/");

  await page.locator("#total-params").fill("104");
  await expect(page.locator('[data-out="total"]')).toHaveText("245.4 GB");
});

test("rejects negatives, exponents, and unbounded numbers", async ({
  page,
}) => {
  await page.goto("/");

  await page.locator("#context-tokens").fill("-9e5");
  await expect(page.locator("#context-tokens")).toHaveValue("95");

  await page.locator("#context-tokens").fill("1000000");
  await expect(page.locator("#context-tokens")).toHaveValue("999999");
});

test("reset zeroes inputs and outputs", async ({ page }) => {
  await page.goto("/");

  await page.locator("#total-params").fill("104");
  await expect(page.locator('[data-out="total"]')).not.toHaveText("0.0 GB");

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator("#total-params")).toHaveValue("0");
  await expect(page.locator('[data-out="total"]')).toHaveText("0.0 GB");
});

test("keeps secondary math hidden until detail panels expand", async ({
  page,
}) => {
  await page.goto("/");

  for (const output of [
    "why",
    "min-cap",
    "usable-target",
    "usable-on-class",
    "fit-headroom",
    "speed",
    "breakdown",
    "calc-formula",
    "assumptions",
  ]) {
    await expect(page.locator(`[data-out="${output}"]`)).toBeHidden();
  }
  await expect(page.locator('[data-out="total"]')).toBeVisible();
  await expect(page.locator('[data-out="gpu-class"]')).toBeVisible();

  await expect(page.locator('[data-out="calc-formula"]')).toBeHidden();
  await page.getByText("Why this recommendation").click();
  await expect(page.locator('[data-out="usable-on-class"]')).toBeVisible();
  await expect(page.locator('[data-out="fit-headroom"]')).toBeVisible();

  await page.getByText("Calculation used").click();
  await expect(page.locator('[data-out="breakdown"]')).toBeVisible();
  await expect(page.locator('[data-out="breakdown"] li')).toHaveCount(5);

  await page.getByText("Formula used").click();
  await expect(page.locator('[data-out="calc-formula"]')).toBeVisible();

  await page.getByText("Assumptions used").click();
  await expect(page.locator('[data-out="assumptions"]')).toBeVisible();
});

test("uses cyan only for expanded result detail headings", async ({ page }) => {
  await page.goto("/");
  const why = page.getByText("Why this recommendation", { exact: true });
  const formula = page.getByText("Formula used", { exact: true });

  await expect(why).toHaveCSS("color", "rgb(248, 250, 252)");
  await expect(formula).toHaveCSS("color", "rgb(248, 250, 252)");

  await why.click();

  await expect(why).toHaveCSS("color", "rgb(103, 232, 249)");
  await expect(formula).toHaveCSS("color", "rgb(248, 250, 252)");
});

test("ignores reflected query values without injecting markup", async ({
  page,
}) => {
  await page.goto(
    "/?total-params=%22%3E%3Cimg%20src=x%20onerror=%22window.injected=true%22%3E",
  );

  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.locator("img")).toHaveCount(1);
  const wasInjected = await page.evaluate(() =>
    Boolean(Reflect.get(globalThis, "injected")),
  );
  expect(wasInjected).toBe(false);
  await expect(page.locator('[data-out="total"]')).toHaveText("19.0 GB");
});

test("swaps adaptive inputs and hides MoE per workload family", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByText("Advanced assumptions").click();
  await expect(page.locator("#context-tokens")).toBeVisible();
  await expect(page.locator("#kv-cache-precision")).toBeVisible();
  await page.locator("#workload-family").selectOption("vision");
  await expect(page.locator("#context-tokens")).toBeHidden();
  await expect(page.locator("#image-width")).toBeVisible();
  await expect(page.locator("#moe-enabled")).toBeHidden();
  await expect(page.locator("#kv-cache-precision")).toBeHidden();
  await page.locator("#workload-family").selectOption("encoder_decoder");
  await expect(page.locator("#kv-cache-precision")).toBeVisible();
  await page.locator("#execution-mode").selectOption("Full training");
  await expect(page.locator("#kv-cache-precision")).toBeHidden();
});

test("switches the workload size label and never shows generic Batch Size", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator("[data-workload-label]")).toHaveText(
    "Concurrent Requests",
  );
  await page.locator("#execution-mode").selectOption("Full training");
  await expect(page.locator("[data-workload-label]")).toHaveText(
    "Micro Batch Size",
  );
  await expect(page.getByText("Batch Size", { exact: true })).toHaveCount(0);
});

test("reveals active parameters only when MoE is enabled", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#active-params")).toBeHidden();
  await page.locator("#moe-enabled").check();
  await expect(page.locator("#active-params")).toBeVisible();
});
