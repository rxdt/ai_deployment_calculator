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
  await expect(page.getByText("Thousands")).toHaveCount(0);
  await expect(page.locator(".total")).toHaveText("19.0 GB");
  await expect(page.getByText("Estimated GPU VRAM required")).toHaveCount(0);
  await expect(page.getByText("Estimated speed")).toBeVisible();
  await expect(page.getByLabel("Required outputs")).toContainText(
    "Minimum GPU memory needed",
  );
  await expect(page.getByLabel("Recommended Hardware")).toContainText(
    "Estimated workload memory is 19.0 GB. With a 85% usable VRAM target, use a GPU with at least 22.4 GB of physical VRAM so the workload does not consume the entire card.",
  );
  await page.getByText("Calculation used").click();
  await expect(page.getByLabel("Assumptions")).not.toContainText("Accuracy:");
  await expect(page.getByLabel("Assumptions")).toContainText("Precision");
  await expect(page.getByLabel("Warnings")).not.toContainText(
    "planning estimate",
  );
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
  await page.getByLabel("Context Memory Precision").selectOption("32-bit");
  await expect(page.locator(".total")).toHaveText("79.2 GB");
  await page.getByRole("button", { name: "Save estimate URL" }).click();

  await expect(page.locator(".total")).toHaveText("79.2 GB");
  await page.getByText("Calculation used").click();
  await expect(page.getByLabel("Assumptions")).not.toContainText("Accuracy:");
  await expect(page.getByLabel("Assumptions")).toContainText(
    "Precision: 4-bit",
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
  await expect(page.locator('select[name="precision"]')).toBeDisabled();
  await expect(page.locator('select[name="precision"]')).toHaveValue(
    "4-bit QLoRA base",
  );
  await expect(page.getByLabel("Runtime Profile")).toBeDisabled();
  await expect(page.getByLabel("Runtime Profile")).toHaveValue("Local / Edge");
  await expect(
    page.getByText(
      "QLoRA uses a frozen 4-bit base model plus trainable adapters.",
    ),
  ).toBeVisible();
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
