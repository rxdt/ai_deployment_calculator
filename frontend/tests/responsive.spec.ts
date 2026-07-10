import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

const pages = ["/"];
const onePageViewports = [
  { height: 720, name: "desktop", width: 1280 },
  { height: 844, name: "mobile", width: 390 },
] as const;
const primaryControls = [
  "Model Family",
  "Total Model Parameters",
  "Parameter Unit",
  "Precision",
  "Execution Mode",
  "Runtime Profile",
  "Context Window",
  "Concurrent Batch Requests",
] as const;
const readableLabels = [
  "Model Family",
  "Estimated VRAM Required",
  "Recommended GPU Class",
] as const;

/**
 Assert representative left and right edge content remains in the viewport.
@param page - Playwright page under test
*/
async function expectNoHorizontalDocumentOverflow(page: Page): Promise<void> {
  await expect(page.getByLabel("GitHub repository")).toBeInViewport();
  await expect(page.getByLabel("Model Family")).toBeInViewport();
  await expect(page.locator('[data-out="gpu-class"]')).toBeInViewport();
}

interface ElementBox {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

/**
 Assert a measured element box exists.
@param box Measured Playwright element box.
@param name Human-readable element name for failures.
@returns The measured element box.
*/
function requireBox(box: ElementBox | null, name: string): ElementBox {
  if (box === null) {
    throw new Error(`Missing ${name} box`);
  }
  return box;
}

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
      page.locator('[data-slot="advanced-assumptions"] > summary'),
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

  test(`typography separates reading text from technical controls: ${path}`, async ({
    page,
  }) => {
    await page.goto(path);

    await expect(page.locator("body")).not.toHaveCSS(
      "font-family",
      /JetBrains Mono/u,
    );
    await expect(
      page.getByRole("heading", { name: "VRAM Deployment Calculator" }),
    ).not.toHaveCSS("font-family", /JetBrains Mono/u);
    await expect(page.locator('[data-out="total"]')).not.toHaveCSS(
      "font-family",
      /JetBrains Mono/u,
    );
    await expect(page.getByLabel("Total Model Parameters")).toHaveCSS(
      "font-family",
      /JetBrains Mono/u,
    );
    await expect(page.getByLabel("Model Family")).toHaveCSS(
      "font-family",
      /JetBrains Mono/u,
    );
    await expect(page.getByText("Calculation used", { exact: true })).toHaveCSS(
      "font-family",
      /JetBrains Mono/u,
    );
    await page.getByText("Formula used", { exact: true }).click();
    await expect(page.locator('[data-out="calc-formula"]')).toHaveCSS(
      "font-family",
      /JetBrains Mono/u,
    );
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
    await expect(page.getByLabel("Model Family")).toBeInViewport();
    await expect(page.locator('[data-out="gpu-class"]')).toBeInViewport();

    await page.locator("#workload-family").selectOption("text_encoder");
    await expect(page.getByLabel("Model Family")).toBeInViewport();
    await expect(page.locator('[data-out="gpu-class"]')).toBeInViewport();

    await page.getByText("Advanced assumptions", { exact: true }).click();
    await expect(page.getByLabel("Known Model File Size")).toBeInViewport();
    await expect(page.getByLabel("Memory Sharding")).toBeInViewport();
  });

  test(`content changes do not create horizontal overflow on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expectNoHorizontalDocumentOverflow(page);
    await page.locator("#workload-family").selectOption("text_encoder");
    await expectNoHorizontalDocumentOverflow(page);
    await page.getByText("Advanced assumptions", { exact: true }).click();
    await expectNoHorizontalDocumentOverflow(page);
  });
}

test("axe accessibility scan", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("input actions align to the calculator pane center", async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/");

  const pane = requireBox(
    await page.locator('[data-slot="inputs-form"]').boundingBox(),
    "inputs pane",
  );
  const reset = requireBox(
    await page.getByRole("button", { name: "Reset" }).boundingBox(),
    "reset button",
  );
  const advancedLabel = page.locator(
    '[data-slot="advanced-assumptions-label"]',
  );
  const advancedBox = requireBox(
    await advancedLabel.boundingBox(),
    "advanced assumptions label",
  );
  const paneCenter = pane.x + pane.width / 2;

  await expect(advancedLabel).toHaveCSS("justify-content", "center");
  expect(reset.x + reset.width / 2).toBeCloseTo(paneCenter, 0);
  expect(advancedBox.x + advancedBox.width / 2).toBeCloseTo(paneCenter, 0);
});

/**
 Ensure the first-glance result cards present one primary answer and one
 secondary recommendation instead of two competing green metrics.
*/
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
  await expect(page.locator('[data-out="total"]')).toHaveCSS(
    "color",
    "rgb(34, 197, 94)",
  );
  await expect(page.locator('[data-out="gpu-class"]')).toHaveCSS(
    "color",
    "rgb(248, 250, 252)",
  );
  await expect(page.locator('[data-out="total"]')).not.toHaveCSS(
    "font-family",
    /JetBrains Mono/u,
  );
  await expect
    .poll(async () =>
      totalCard.evaluate(
        (node) => getComputedStyle(node, "::before").backgroundColor,
      ),
    )
    .toBe("rgb(34, 197, 94)");
  await expect
    .poll(async () =>
      gpuCard.evaluate(
        (node) => getComputedStyle(node, "::before").backgroundColor,
      ),
    )
    .toBe("rgb(59, 130, 246)");
});

test("desktop result detail panels stay compact beneath the answer", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/");

  const panels = page.locator(".results > details.panel");
  await expect(panels).toHaveCount(4);

  const whyBox = requireBox(await panels.nth(0).boundingBox(), "why panel");
  const calculationBox = requireBox(
    await panels.nth(1).boundingBox(),
    "calculation panel",
  );
  const formulaBox = requireBox(
    await panels.nth(2).boundingBox(),
    "formula panel",
  );

  expect(calculationBox.y).toBe(formulaBox.y);
  expect(formulaBox.x).toBeGreaterThan(calculationBox.x);
  expect(calculationBox.width).toBeLessThan(whyBox.width * 0.75);
  expect(formulaBox.width).toBeLessThan(whyBox.width * 0.75);
});

test("expanded advanced assumptions stay inside the input pane", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/");
  await page.getByText("Why this recommendation", { exact: true }).click();
  await page.getByText("Advanced assumptions", { exact: true }).click();

  const advancedBox = requireBox(
    await page.locator(".advanced[open] .group").boundingBox(),
    "advanced assumptions panel",
  );
  const resultsBox = requireBox(
    await page.locator(".results").boundingBox(),
    "results pane",
  );

  expect(advancedBox.x + advancedBox.width).toBeLessThanOrEqual(resultsBox.x);
});

test("checkboxes render selected checks and empty unchecked indicators", async ({
  page,
}) => {
  await page.goto("/");

  const moeState = page.locator(
    'label:has(#moe-enabled) [data-slot="checkbox-indicator"]',
  );
  await expect(moeState).toBeVisible();
  await expect(moeState).toHaveCSS("min-width", "40px");
  await expect
    .poll(async () =>
      moeState.evaluate((node) => getComputedStyle(node, "::before").content),
    )
    .toBe('""');

  await page.getByLabel("MoE Model", { exact: true }).check();
  await expect
    .poll(async () =>
      moeState.evaluate((node) => getComputedStyle(node, "::before").content),
    )
    .toContain("\u{2713}");

  await page.getByText("Advanced assumptions", { exact: true }).click();
  const gradientState = page.locator(
    'label:has(#gradient-checkpointing) [data-slot="checkbox-indicator"]',
  );
  const shardingState = page.locator(
    'label:has(#memory-sharding-enabled) [data-slot="checkbox-indicator"]',
  );
  await expect
    .poll(async () =>
      gradientState.evaluate(
        (node) => getComputedStyle(node, "::before").content,
      ),
    )
    .toContain("\u{2713}");
  await page.getByLabel("Gradient Checkpointing", { exact: true }).uncheck();
  await expect
    .poll(async () =>
      gradientState.evaluate(
        (node) => getComputedStyle(node, "::before").content,
      ),
    )
    .toBe('""');
  await expect
    .poll(async () =>
      shardingState.evaluate(
        (node) => getComputedStyle(node, "::before").content,
      ),
    )
    .toBe('""');
});
