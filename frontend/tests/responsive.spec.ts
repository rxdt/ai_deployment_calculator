import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
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

/**
 Assert vertical overflow is contained inside panes by trying to scroll the page.
@param page - Playwright page under test.
*/
async function expectNoVerticalDocumentOverflow(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.evaluate(() => {
    window.scrollBy(0, 800);
  });
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(0);
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

/**
 Assert a first-glance result card does not use the cyan detail accent.
@param card Playwright locator for the result card.
*/
async function expectNoCyanHeroPaint(card: Locator): Promise<void> {
  const paints = await card.evaluate((node) => {
    const base = getComputedStyle(node);
    const before = getComputedStyle(node, "::before");
    const after = getComputedStyle(node, "::after");

    return [
      base.backgroundColor,
      base.borderColor,
      base.color,
      before.backgroundColor,
      after.backgroundColor,
    ];
  });

  expect(paints).not.toContain("rgb(103, 232, 249)");
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
    await expectNoVerticalDocumentOverflow(page);

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
    await expect(
      page.getByText("Memory breakdown", { exact: true }),
    ).toBeInViewport();
  });

  test(`all expanded panels avoid page scroll on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await page.locator("details").evaluateAll((nodes) => {
      for (const node of nodes) {
        node.setAttribute("open", "");
      }
    });

    await expectNoVerticalDocumentOverflow(page);
    await expect(page.getByLabel("GitHub repository")).toBeInViewport();
    await expect(page.getByLabel("Model Family")).toBeInViewport();
    await expect(page.locator('[data-out="total"]')).toBeInViewport();
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
 Ensure keyboard users get the same restrained cyan affordance promised by the
 design tokens on real controls and disclosure summaries.
*/
test("keyboard focus uses the cyan token without resizing calculator controls", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/");

  const modelFamily = page.getByLabel("Model Family", { exact: true });
  const reset = page.getByRole("button", { name: "Reset" });
  const advanced = page.locator('[data-slot="advanced-assumptions-label"]');
  const why = page.getByText("Why this recommendation", { exact: true });
  const focusedControls = [modelFamily, reset, advanced, why];
  const baselineHeights = await Promise.all(
    focusedControls.map(
      async (control) =>
        requireBox(await control.boundingBox(), "focused control").height,
    ),
  );

  for (const [index, control] of focusedControls.entries()) {
    await control.focus();
    await expect(control).toHaveCSS("outline-color", "rgb(103, 232, 249)");
    await expect(control).toHaveCSS("outline-style", "solid");
    await expect(control).toHaveCSS("outline-width", "1px");
    expect(
      requireBox(await control.boundingBox(), "focused control").height,
    ).toBe(baselineHeights[index]);
  }
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
  expect(totalBox?.height ?? 0).toBeLessThan(120);
  expect(gpuBox?.height ?? 0).toBeLessThan(120);
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
  await expect
    .poll(async () =>
      totalCard.evaluate((node) => getComputedStyle(node, "::before").height),
    )
    .toBe("4px");
  await expectNoCyanHeroPaint(totalCard);
  await expectNoCyanHeroPaint(gpuCard);
});

/**
 Ensure the hero fit meter reads the recommended class as a consumed budget and
 disappears cleanly when no single class can hold the workload.
*/
test("hero fit meter shows class usage and hides when nothing fits", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/");

  const meter = page.locator('[data-slot="fit-meter"]');
  await expect(meter).toBeVisible();
  await expect(meter).toBeInViewport();
  await expect(meter).toHaveJSProperty("max", 100);
  await expect(meter).toHaveJSProperty("value", 93);
  await expect(page.locator('[data-out="vram-say"]')).toHaveText(
    "Fits a 24 GB card with 1.4 GB usable headroom (7% spare).",
  );

  await page.getByLabel("Total Model Parameters").fill("400");
  await expect(meter).toBeHidden();
  await expect(page.locator('[data-out="vram-say"]')).toContainText(
    "usable VRAM",
  );
});

/**
 Ensure the command-center atmosphere renders as pure decoration: the nav stays
 translucent and blurred over a layered grid/glow background, and the added paint
 never introduces page scroll on either one-viewport breakpoint.
*/
for (const viewport of onePageViewports) {
  test(`decorative atmosphere stays behind content on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const topbar = page.locator(".topbar");
    await expect(topbar).toHaveCSS("background-color", /^rgba\(/u);
    await expect(topbar).toHaveCSS("backdrop-filter", /blur/u);

    const backgroundImage = await page
      .locator("body")
      .evaluate((node) => getComputedStyle(node).backgroundImage);
    expect(backgroundImage).toContain("linear-gradient");
    expect(backgroundImage).toContain("radial-gradient");

    await expectNoVerticalDocumentOverflow(page);
    await expectNoHorizontalDocumentOverflow(page);
  });
}

/**
 Ensure the structural HUD labels (top status strip and section legends) render
 the DESIGN.md hud-label treatment: uppercased, widely letter-spaced, and still
 within the one-viewport no-overflow contract on both breakpoints.
*/
for (const viewport of onePageViewports) {
  test(`HUD labels render the widely-spaced uppercase treatment on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const statusLabel = page.locator(".status-item span").first();
    const legend = page.getByText("Model", { exact: true });

    const statusSpacing = await statusLabel.evaluate(
      (node) => getComputedStyle(node).letterSpacing,
    );
    const legendStyle = await legend.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        letterSpacing: style.letterSpacing,
        textTransform: style.textTransform,
      };
    });

    // A widely-spaced HUD label resolves to a positive px value, never the
    // "normal" default or a collapsed "0px".
    expect(statusSpacing).not.toBe("normal");
    expect(statusSpacing).not.toBe("0px");
    expect(legendStyle.textTransform).toBe("uppercase");
    expect(legendStyle.letterSpacing).not.toBe("normal");
    expect(legendStyle.letterSpacing).not.toBe("0px");

    // Wider labels must not break the one-viewport or horizontal-edge contract.
    await expectNoHorizontalDocumentOverflow(page);
    await expectNoVerticalDocumentOverflow(page);
  });
}

test("desktop result detail panels stay compact beneath the answer", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/");

  const panels = page.locator(".results > details.panel");
  await expect(panels).toHaveCount(5);

  const whyBox = requireBox(await panels.nth(0).boundingBox(), "why panel");
  const calculationBox = requireBox(
    await panels.nth(1).boundingBox(),
    "calculation panel",
  );
  const formulaBox = requireBox(
    await panels.nth(2).boundingBox(),
    "formula panel",
  );
  const assumptionsBox = requireBox(
    await panels.nth(3).boundingBox(),
    "assumptions panel",
  );
  const breakdownBox = requireBox(
    await panels.nth(4).boundingBox(),
    "breakdown panel",
  );

  expect(calculationBox.y).toBe(formulaBox.y);
  expect(formulaBox.x).toBeGreaterThan(calculationBox.x);
  expect(calculationBox.width).toBeLessThan(whyBox.width * 0.75);
  expect(formulaBox.width).toBeLessThan(whyBox.width * 0.75);
  // The breakdown fills the empty cell beside the assumptions panel, so it adds
  // no new collapsed row to the one-viewport result stack.
  expect(breakdownBox.y).toBe(assumptionsBox.y);
  expect(breakdownBox.x).toBeGreaterThan(assumptionsBox.x);
});

/**
 Ensure expanded supporting rows keep labels and technical values aligned while
 warning prose remains readable as a single column.
*/
test("expanded result rows preserve alignment and warning prose", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/");

  await page.getByText("Why this recommendation", { exact: true }).click();
  await page.getByText("Calculation used", { exact: true }).click();
  await page.getByText("Assumptions used", { exact: true }).click();

  const fitRow = page.locator(".fit li").first();
  const calculationRow = page.locator(".calculation .metric").first();
  const assumptionRow = page.locator(".assumptions .metric").first();
  const rows = [fitRow, calculationRow, assumptionRow];

  for (const row of rows) {
    await expect(row).toHaveCSS("display", "grid");
    await expect(row).toHaveCSS("border-bottom-style", "solid");
  }
  await expect(fitRow.locator("strong")).toHaveCSS("text-align", "right");
  await expect(calculationRow.locator("strong")).toHaveCSS(
    "text-align",
    "right",
  );
  await expect(assumptionRow.locator("strong")).toHaveCSS(
    "text-align",
    "right",
  );
  await page.getByLabel("Execution Mode").selectOption("Full training");
  const warning = page.locator(".warnings .metric").first();
  await expect(warning).toHaveCSS("display", "block");
  await expect(warning.locator("strong")).toHaveCSS("display", "none");
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
