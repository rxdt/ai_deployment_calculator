import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
  await expect(page.getByLabel("Deployment status")).toContainText(
    "source: local TypeScript",
  );
  await expect(page.getByLabel("Deployment status")).toContainText(
    "static Vite app",
  );
  await expect(page.getByLabel("Workload Family")).toHaveValue(
    "text_generation",
  );
  await expect(page.locator(".total")).toHaveText("19.0 GB");
  await expect(page.getByLabel("Required outputs")).toContainText(
    "Minimum Raw VRAM Needed",
  );
  await expect(page.getByLabel("Recommended Hardware")).toContainText(
    "19.0 GB / 85% = 22.4 GB raw VRAM",
  );
  await expect(page.getByLabel("Accuracy")).toContainText("Estimated");
  await expect(page.getByLabel("Warnings")).toContainText("planning estimate");
});

test("recomputes a local GGUF-style exact file deployment", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("Total Resident Parameters").fill("104");
  await page.locator('select[name="precision"]').selectOption("4-bit");
  await page.getByLabel("Runtime Profile").selectOption("Local / Edge");
  await page.getByLabel("Context Window").fill("32000");
  await page.getByText("Advanced assumptions").click();
  await page.getByLabel("Known Model File Size").fill("52");
  await page.getByLabel("KV Cache Precision").selectOption("32-bit");
  await page.getByRole("button", { name: "Calculate" }).click();

  await expect(page.locator(".total")).toHaveText("79.2 GB");
  await expect(page.getByLabel("Accuracy")).toContainText("File-size based");
  await expect(page.getByLabel("Required outputs")).not.toContainText(
    "Cloud cost",
  );
  await expect
    .poll(() =>
      new URL(page.url()).searchParams.get("known_model_file_size_gb"),
    )
    .toBe("52");
});

test("switches adaptive inputs and training workload label", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("Workload Family").selectOption("text_encoder");
  await expect(page.getByLabel("Sequence Length")).toBeVisible();
  await expect(page.getByLabel("Context Window")).toHaveCount(0);
  await expect(page.getByLabel("MoE Model")).toBeVisible();

  await page.getByLabel("Execution Mode").selectOption("QLoRA fine-tuning");
  await expect(page.getByLabel("Micro Batch Size")).toBeVisible();
  await expect(page.getByText("Batch Size", { exact: true })).toHaveCount(0);
});

test("hides MoE for vision and ignores legacy query flags", async ({
  page,
}) => {
  await page.goto("/?trained=on&use_adapter=on");

  await expect(page.getByLabel("Execution Mode")).toHaveValue("Inference");
  await page.getByLabel("Workload Family").selectOption("vision");
  await expect(page.getByLabel("MoE Model")).toBeHidden();
  await expect(page.getByLabel("Image Width")).toBeVisible();
});

test("escapes reflected query values without injecting markup", async ({
  page,
}) => {
  const hostileQuery =
    "/?total_params=%22%3E%3Cimg%20src=x%20onerror=%22window.injected%20%3D%20true%22%3E";

  await page.goto(hostileQuery);

  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.locator(".total")).toHaveText("19.0 GB");
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Boolean((globalThis as unknown as { injected?: boolean }).injected),
      ),
    )
    .toBe(false);
});
