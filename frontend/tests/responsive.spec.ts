import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

const pages = ["/"];
const onePageViewports = [
  { height: 720, name: "desktop", width: 1280 },
  { height: 844, name: "mobile", width: 390 },
] as const;
const primaryControls = [
  "Workload Family",
  "Total Model Parameters",
  "Parameter Unit",
  "Precision",
  "Execution Mode",
  "Runtime Profile",
  "Context Window",
  "Concurrent Requests",
] as const;
const readableLabels = [
  "Workload Family",
  "Estimated VRAM Required",
  "Recommended GPU Class",
] as const;

for (const path of pages) {
  test(`core collapsed controls stay visible: ${path}`, async ({ page }) => {
    await page.goto(path);

    for (const name of primaryControls) {
      await expect(page.getByLabel(name, { exact: true })).toBeVisible();
    }
    await expect(page.getByLabel("MoE Model", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
    await expect(page.getByText("Batch Size", { exact: true })).toHaveCount(0);
  });

  test(`primary touch targets use the control size token: ${path}`, async ({
    page,
  }) => {
    await page.goto(path);

    for (const name of primaryControls) {
      await expect(page.getByLabel(name, { exact: true })).toHaveCSS(
        "min-height",
        "40px",
      );
    }
    await expect(page.getByLabel("MoE Model", { exact: true })).toHaveCSS(
      "min-width",
      "40px",
    );
    await expect(page.getByRole("button", { name: "Reset" })).toHaveCSS(
      "min-height",
      "40px",
    );
    await expect(
      page.getByText("Advanced assumptions", { exact: true }),
    ).toHaveCSS("min-height", "40px");
  });

  test(`primary labels use readable type: ${path}`, async ({ page }) => {
    await page.goto(path);

    for (const label of readableLabels) {
      await expect(page.getByText(label, { exact: true })).toHaveCSS(
        "font-size",
        "13px",
      );
    }
  });
}

for (const viewport of onePageViewports) {
  test(`collapsed default estimate fits one viewport on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "VRAM Deployment Calculator" }),
    ).toBeInViewport();
    await expect(page.getByRole("button", { name: "Reset" })).toBeInViewport();
    await expect(page.locator('[data-out="total"]')).toBeInViewport();
    await expect(page.locator('[data-out="gpu-class"]')).toBeInViewport();
    await expect(
      page.getByText("Calculation used", { exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByText("Assumptions used", { exact: true }),
    ).toBeInViewport();
  });

  test(`expanded advanced assumptions keep key content visible on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByText("Advanced assumptions", { exact: true }).click();

    await expect(page.getByLabel("Known Model File Size")).toBeInViewport();
    await expect(page.getByLabel("Memory Sharding")).toBeInViewport({
      ratio: 1,
    });
    await expect(
      page.getByText("Assumptions used", { exact: true }),
    ).toBeInViewport();
  });

  test(`responsive edges stay in viewport on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(page.getByLabel("GitHub repository")).toBeInViewport();
    await expect(page.getByLabel("Workload Family")).toBeInViewport();
    await expect(page.locator('[data-out="gpu-class"]')).toBeInViewport();

    await page.locator("#workload-family").selectOption("text_encoder");
    await expect(page.getByLabel("Workload Family")).toBeInViewport();
    await expect(page.locator('[data-out="gpu-class"]')).toBeInViewport();

    await page.getByText("Advanced assumptions", { exact: true }).click();
    await expect(page.getByLabel("Known Model File Size")).toBeInViewport();
    await expect(page.getByLabel("Memory Sharding")).toBeInViewport();
  });
}

test("axe accessibility scan", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("first glance result hierarchy makes the VRAM answer dominant", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/");

  const totalCard = page.locator('[data-slot="hero-total-card"]');
  const gpuCard = page.locator('[data-slot="hero-gpu-card"]');
  const totalBox = await totalCard.boundingBox();
  const gpuBox = await gpuCard.boundingBox();

  expect(totalBox).not.toBeNull();
  expect(gpuBox).not.toBeNull();
  expect(totalBox?.width ?? 0).toBeGreaterThan((gpuBox?.width ?? 0) * 1.5);
  await expect(page.locator('[data-out="total"]')).toHaveCSS(
    "font-variant-numeric",
    "tabular-nums",
  );
  await expect(page.locator('[data-out="total"]')).not.toHaveCSS(
    "font-family",
    /JetBrains Mono/u,
  );
});
