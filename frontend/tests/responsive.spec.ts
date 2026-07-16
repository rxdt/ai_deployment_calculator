import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

const pages = ["/"];
const onePageViewports = [
  { height: 720, name: "desktop", width: 1280 },
  { height: 844, name: "mobile", width: 390 },
] as const;
const primaryControls = [
  "Model Task Family",
  "Total Model Parameters",
  "Parameter Unit",
  "Precision",
  "Execution Mode",
  "Runtime Profile",
  "Context Window",
  "Concurrent Batch Requests",
] as const;
// The primary answer heading reads at the heading size. Field captions and the
// GPU-class label are intentionally small uppercase mono HUD labels per the
// design, so they are asserted as technical captions elsewhere, not here.
const readableLabels = ["Estimated VRAM Required"] as const;

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
 Assert the active Playwright viewport exists.
@param page - Playwright page under test.
@returns current viewport size.
*/
function requireViewport(page: Page): {
  readonly height: number;
  readonly width: number;
} {
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error("Missing viewport size");
  }
  return viewport;
}

/**
 Assert the document never overflows horizontally: content grows downward in
 normal flow (the inline expand-down panels may make the page taller and
 scrollable, the accepted accordion pattern), but nothing may extend past the
 viewport's right edge and force a horizontal scrollbar.
@param page - Playwright page under test
*/
async function expectNoHorizontalDocumentOverflow(page: Page): Promise<void> {
  const viewport = requireViewport(page);
  const box = requireBox(await page.locator("html").boundingBox(), "html");
  expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
}

/**
 Assert the interactive calculator stays in the first desktop viewport even
 when static crawlable reference content continues below it.
@param page - Playwright page under test.
*/
async function expectCalculatorFitsFirstViewport(page: Page): Promise<void> {
  const viewport = requireViewport(page);
  const box = requireBox(
    await page.locator("main.layout").boundingBox(),
    "layout",
  );
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
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
    // MoE Model now lives inside the collapsed Advanced Assumptions panel per the
    // design, so it is not visible until the disclosure is opened.
    await expect(page.getByLabel("MoE Model", { exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
    await expect(page.getByText("Batch Size", { exact: true })).toHaveCount(0);
  });

  test(`primary touch targets use the control size token: ${path}`, async ({
    page,
  }) => {
    await page.goto(path);

    // Controls render at the design's compact 24px, the WCAG 2.2 AA target-size
    // minimum.
    for (const name of primaryControls) {
      await expect(page.getByLabel(name, { exact: true })).toHaveCSS(
        "min-height",
        "24px",
      );
    }
    // The MoE checkbox lives in the advanced panel; open it, then confirm the
    // checkbox hit target holds the 24px AA minimum.
    await page.getByText("Advanced assumptions", { exact: true }).click();
    await expect(page.getByLabel("MoE Model", { exact: true })).toHaveCSS(
      "min-width",
      "24px",
    );
    await expect(page.getByRole("button", { name: "Reset" })).toHaveCSS(
      "min-height",
      "24px",
    );
    await expect(
      page.locator('[data-slot="advanced-assumptions"] > summary'),
    ).toHaveCSS("min-height", "24px");
  });

  test(`primary labels use readable type: ${path}`, async ({ page }) => {
    await page.goto(path);

    for (const label of readableLabels) {
      await expect(page.getByText(label, { exact: true })).toHaveCSS(
        "font-size",
        "15px",
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
      page.getByRole("heading", {
        name: "AI Deployment Calculator",
      }),
    ).not.toHaveCSS("font-family", /JetBrains Mono/u);
    // The hero total is a technical readout, so it takes the mono face like the
    // controls, while the reading text (body, heading) stays sans.
    await expect(page.locator('[data-out="total"]')).toHaveCSS(
      "font-family",
      /JetBrains Mono/u,
    );
    await expect(page.getByLabel("Total Model Parameters")).toHaveCSS(
      "font-family",
      /JetBrains Mono/u,
    );
    await expect(page.getByLabel("Model Task Family")).toHaveCSS(
      "font-family",
      /JetBrains Mono/u,
    );
    // Collapsed panel titles share the stat-chip caption voice (sans), so the
    // mono face stays reserved for controls and technical readouts.
    await expect(
      page.getByText("Values Used In Calculations", { exact: true }),
    ).not.toHaveCSS("font-family", /JetBrains Mono/u);
    await page.getByText("Formula used", { exact: true }).click();
    await expect(page.locator('[data-out="calc-formula"]')).toHaveCSS(
      "font-family",
      /JetBrains Mono/u,
    );
  });
}

for (const viewport of onePageViewports) {
  test(`collapsed default estimate stays reachable on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    // Desktop holds the interactive calculator in one viewport while the
    // crawlable reference content continues below it. Phones stack the two
    // panes into one column (WCAG reflow), so the page scrolls vertically by
    // design; first-glance controls still need to remain reachable.
    if (viewport.name === "desktop") {
      await expectCalculatorFitsFirstViewport(page);
    }
    await expectNoHorizontalDocumentOverflow(page);

    const firstGlance = [
      page.getByRole("heading", {
        name: "AI Deployment Calculator",
      }),
      page.getByRole("button", { name: "Reset" }),
      page.locator('[data-out="total"]'),
      page.locator('[data-out="gpu-class"]'),
      page.getByText("Values Used In Calculations", { exact: true }),
      page.getByText("Assumptions used", { exact: true }),
    ];
    for (const target of firstGlance) {
      await target.scrollIntoViewIfNeeded();
      await expect(target).toBeInViewport();
    }
  });

  test(`all expanded panels avoid horizontal overflow on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await page.locator("details").evaluateAll((nodes) => {
      for (const node of nodes) {
        node.setAttribute("open", "");
      }
    });

    await expectNoHorizontalDocumentOverflow(page);
    await expect(page.getByLabel("GitHub repository")).toBeInViewport();
    await expect(page.getByLabel("Model Task Family")).toBeInViewport();
    // On the stacked phone column the hero sits below the expanded form.
    await page.locator('[data-out="total"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-out="total"]')).toBeInViewport();
  });

  test(`expanded advanced assumptions keep key content reachable on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByText("Advanced assumptions", { exact: true }).click();

    // Inline expand-down grows the page in normal flow (the accepted accordion
    // pattern), so the panel's controls stay reachable by scrolling rather than
    // all fitting one short viewport. Each key control must be visible once
    // scrolled to, and the expansion must never introduce horizontal overflow.
    const knownFileSize = page.getByLabel("Known Model File Size");
    const memorySharding = page.getByLabel("Memory Sharding");
    const assumptions = page.getByText("Assumptions used", { exact: true });

    await knownFileSize.scrollIntoViewIfNeeded();
    await expect(knownFileSize).toBeInViewport();
    await memorySharding.scrollIntoViewIfNeeded();
    await expect(memorySharding).toBeInViewport({ ratio: 1 });
    await assumptions.scrollIntoViewIfNeeded();
    await expect(assumptions).toBeInViewport();
    await expectNoHorizontalDocumentOverflow(page);
  });

  test(`responsive edges stay reachable on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    // The stacked phone column scrolls, so each edge is asserted reachable
    // rather than simultaneously visible.
    const gpuClass = page.locator('[data-out="gpu-class"]');
    await expect(page.getByLabel("GitHub repository")).toBeInViewport();
    await expect(page.getByLabel("Model Task Family")).toBeInViewport();
    await gpuClass.scrollIntoViewIfNeeded();
    await expect(gpuClass).toBeInViewport();

    await page.locator("#workload-family").selectOption("text_encoder");
    await page.getByLabel("Model Task Family").scrollIntoViewIfNeeded();
    await expect(page.getByLabel("Model Task Family")).toBeInViewport();
    await gpuClass.scrollIntoViewIfNeeded();
    await expect(gpuClass).toBeInViewport();

    await page.getByText("Advanced assumptions", { exact: true }).click();
    await page.getByLabel("Known Model File Size").scrollIntoViewIfNeeded();
    await expect(page.getByLabel("Known Model File Size")).toBeInViewport();
    await page.getByLabel("Memory Sharding").scrollIntoViewIfNeeded();
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
  const actions = requireBox(
    await page.locator('[data-slot="form-actions"]').boundingBox(),
    "form actions",
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
  expect(actions.x + actions.width / 2).toBeCloseTo(paneCenter, 0);
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

  const modelFamily = page.getByLabel("Model Task Family", { exact: true });
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

  const hero = page.locator('[data-slot="hero-card"]');
  const totalCard = page.locator('[data-slot="hero-total-card"]');
  const gpuCard = page.locator('[data-slot="hero-gpu-card"]');
  const totalBox = await totalCard.boundingBox();
  const gpuBox = await gpuCard.boundingBox();

  expect(totalBox).not.toBeNull();
  expect(gpuBox).not.toBeNull();
  expect(totalBox?.width ?? 0).toBeGreaterThan(gpuBox?.width ?? 0);
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
  // The big total is a technical mono readout per the design.
  await expect(page.locator('[data-out="total"]')).toHaveCSS(
    "font-family",
    /JetBrains Mono/u,
  );
  // No solid green strip across the hero top: the card's role reads from its
  // corner glow alone, so the ::before pseudo-element renders nothing.
  await expect
    .poll(async () =>
      hero.evaluate((node) => getComputedStyle(node, "::before").content),
    )
    .toBe("none");
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
  await expect(meter).toHaveJSProperty("value", 92);
  await expect(page.locator('[data-out="vram-say"]')).toHaveText(
    "Fits on one 24 GB card: 18.8 GB uses 92% of its 20.4 GB usable VRAM.",
  );
  // The scale row labels the bar: USAGE on the left, the usable budget the
  // bar measures on the right.
  const scale = page.locator('[data-slot="fit-scale"]');
  await expect(scale).toBeVisible();
  await expect(scale).toContainText("Capacity 20.4 GB usable of 24 GB");

  // Overflow keeps the bar visible, pegged full and red, with a +100% caption;
  // only the capacity scale row leaves (there is no single class to label).
  await page.getByLabel("Total Model Parameters").fill("400");
  await expect(meter).toBeVisible();
  await expect(meter).toHaveJSProperty("value", 100);
  await expect(meter).toHaveAttribute("data-over", "true");
  await expect(scale).toBeHidden();
  await expect(page.locator('[data-out="vram-say"]')).toContainText(
    "+100% usage",
  );
});

/**
 Ensure the command-center atmosphere renders as pure decoration: the nav stays
 translucent and blurred over a layered grid/glow background, and the added paint
 never pushes the calculator below the first desktop viewport.
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

    if (viewport.name === "desktop") {
      await expectCalculatorFitsFirstViewport(page);
    }
    await expectNoHorizontalDocumentOverflow(page);
  });
}

test("large desktop keeps the calculator centered and readable", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/");

  const box = requireBox(await page.locator(".layout").boundingBox(), "layout");
  expect(box.width).toBeLessThanOrEqual(1030);
  expect(box.x).toBeGreaterThan(190);
  await expectNoHorizontalDocumentOverflow(page);
  await expect(page.locator('[data-out="total"]')).toBeInViewport();
  await expect(page.getByLabel("GitHub repository")).toBeInViewport();
});

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
    const legend = page
      .getByLabel("Deployment inputs")
      .getByText("Model", { exact: true });

    const statusSpacing = await statusLabel.evaluate(
      (node) => getComputedStyle(node).letterSpacing,
    );
    const legendStyle = await legend.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        letterSpacing: style.letterSpacing,
        textAlign: style.textAlign,
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
    // The section headers center over their group, matching the design's
    // "MODEL" / "DEPLOYMENT" HUD headers rather than the default left edge.
    expect(legendStyle.textAlign).toBe("center");

    // Wider labels must never force a horizontal scrollbar; the desktop layout
    // keeps the calculator itself in the first viewport.
    await expectNoHorizontalDocumentOverflow(page);
    if (viewport.name === "desktop") {
      await expectCalculatorFitsFirstViewport(page);
    }
  });
}

test("desktop result detail panels group as rows on one bordered surface", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/");

  // The reasoning disclosures live inside one bordered group container.
  const group = page.locator(".results .panel-group");
  await expect(group).toHaveCSS("border-top-style", "solid");
  const panels = group.locator("> details.panel");
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
  const guideBox = requireBox(await panels.nth(4).boundingBox(), "guide panel");

  // The panels stack as full-width rows of the group: each shares the left
  // edge and width of the "why" panel and sits strictly below the one before.
  const stacked = [
    whyBox,
    calculationBox,
    formulaBox,
    assumptionsBox,
    guideBox,
  ];
  let previousY = -Infinity;
  for (const box of stacked) {
    expect(box.x).toBeCloseTo(whyBox.x, 0);
    expect(box.width).toBeCloseTo(whyBox.width, 0);
    expect(box.y).toBeGreaterThan(previousY);
    previousY = box.y;
  }

  // Rows carry no card chrome of their own: no borders or divider lines and
  // transparent backgrounds, so all four read as one dark panel.
  await expect(panels.nth(0)).toHaveCSS("border-top-width", "0px");
  await expect(panels.nth(1)).toHaveCSS("border-top-width", "0px");
  await expect(panels.nth(1)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
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
  await page.getByText("Values Used In Calculations", { exact: true }).click();
  await page.getByText("Assumptions used", { exact: true }).click();

  const fitRow = page.locator(".fit li").first();
  const calculationRow = page.locator(".calculation .metric").first();
  const assumptionRow = page.locator(".assumptions .metric").first();

  // Ledger rows (why/calculation) keep the label/value grid with right-aligned
  // values and no divider rules between rows, per the design.
  for (const row of [fitRow, calculationRow]) {
    await expect(row).toHaveCSS("display", "grid");
    await expect(row).toHaveCSS("border-bottom-style", "none");
  }
  await expect(fitRow.locator("strong")).toHaveCSS("text-align", "right");
  await expect(calculationRow.locator("strong")).toHaveCSS(
    "text-align",
    "right",
  );
  // Assumptions are green-bulleted methodology prose, not a label/value ledger:
  // a flex line whose empty value cell stays hidden.
  await expect(assumptionRow).toHaveCSS("display", "flex");
  await expect(assumptionRow.locator("strong")).toHaveCSS("display", "none");
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

/**
 Ensure the Model group's parameter count, unit, and precision sit three-across
 on one row (the design's Total Parameters | Unit | Precision layout) rather than
 wrapping two-then-one, and that the model-family control still spans the row above.
*/
test("model parameter, unit, and precision fields share one three-across row", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/");

  const modelGroup = requireBox(
    await page.locator("fieldset.group").first().boundingBox(),
    "model fieldset",
  );
  const family = requireBox(
    await page.locator("p.field:has(#workload-family)").boundingBox(),
    "model family field",
  );
  const total = requireBox(
    await page.locator("p.field:has(#total-params)").boundingBox(),
    "total parameters field",
  );
  const unit = requireBox(
    await page.locator("p.field:has(#parameter-unit)").boundingBox(),
    "parameter unit field",
  );
  const precision = requireBox(
    await page.locator("p.field:has(#precision)").boundingBox(),
    "precision field",
  );

  // The three parameter fields align on one row beneath the full-width family
  // select; equal tops distinguish three-across from the old two-then-one wrap
  // that would drop precision onto its own lower row.
  expect(total.y).toBeCloseTo(unit.y, 0);
  expect(unit.y).toBeCloseTo(precision.y, 0);
  expect(family.y).toBeLessThan(total.y);
  expect(family.width).toBeGreaterThan(modelGroup.width * 0.8);

  // Each of the three shares roughly a third of the row, so every field stays
  // well under the half-width a two-across wrap would give it.
  for (const field of [total, unit, precision]) {
    expect(field.width).toBeLessThan(modelGroup.width * 0.4);
  }
});

test("checkboxes render selected checks and empty unchecked indicators", async ({
  page,
}) => {
  await page.goto("/");

  // MoE, sharding, and gradient checkpointing all live in the advanced panel per
  // the design, so open it before inspecting their checkbox indicators.
  await page.getByText("Advanced assumptions", { exact: true }).click();

  const moeState = page.locator(
    'label:has(#moe-enabled) [data-slot="checkbox-indicator"]',
  );
  await expect(moeState).toBeVisible();
  // The visual glyph draws at 16px; the invisible native input keeps the
  // 24px WCAG hit target (asserted in the touch-target test above).
  await expect(moeState).toHaveCSS("min-width", "16px");
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

  // Gradient checkpointing is a training-only input hidden during Inference;
  // switch modes before inspecting its indicator.
  await page.locator("#execution-mode").selectOption("Full training");

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
