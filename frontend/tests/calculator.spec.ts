import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
Assert the label/value rows rendered inside a report list.
@param page Browser page.
@param slot Output slot name.
@param rows Expected label/value pairs.
*/
async function expectReportRows(
  page: Page,
  slot: string,
  rows: readonly [string, string][],
): Promise<void> {
  const items = page.locator(`[data-out="${slot}"] li`);
  await expect(items).toHaveCount(rows.length);
  for (const [index, [label, value]] of rows.entries()) {
    const item = items.nth(index);
    await expect(item.locator("span")).toHaveText(label);
    await expect(item.locator("strong")).toHaveText(value);
  }
}

/**
Assert the retired confidence output is absent without targeting unlisted selectors.
@param page Browser page.
*/
async function expectNoConfidenceOutput(page: Page): Promise<void> {
  const outputNames = await page
    .locator("[data-out]")
    .evaluateAll((nodes) =>
      nodes.map((node) =>
        node instanceof HTMLElement ? node.dataset.out : null,
      ),
    );
  const slotNames = await page
    .locator("[data-slot]")
    .evaluateAll((nodes) =>
      nodes.map((node) =>
        node instanceof HTMLElement ? node.dataset.slot : null,
      ),
    );

  expect(outputNames).not.toContain("confidence");
  expect(slotNames).not.toContain("confidence-label");
}

/**
Assert the hardware tier table exposes exactly one green best-fit marker.
@param page Browser page.
@param ceiling Tier ceiling carried by the best-fit cell.
*/
async function expectBestFitTier(page: Page, ceiling: string): Promise<void> {
  const bestFit = page.locator(`.tier-fit[data-tier-fit="${ceiling}"]`);

  await expect(page.locator(".tier-fit")).toHaveCount(5);
  await expect(page.locator('.tier-fit[data-fit="true"]')).toHaveCount(1);
  await expect(bestFit).toHaveAttribute("data-fit", "true");
  await expect(bestFit).toHaveAttribute("aria-hidden", "false");
  await expect(bestFit).toHaveCSS("color", "rgb(34, 197, 94)");
  await expect(bestFit).toHaveText("✓");
}

test("page has no accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("screen-reader smoke path exposes labels, landmarks, and live results", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("form", { name: "Deployment inputs" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Estimate" })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText(
    "Estimates are planning guidance",
  );
  await expect(
    page.getByRole("status", { name: "Estimated VRAM required" }),
  ).toHaveText("18.8 GB");
  await expect(page.getByLabel("Model Task Family")).toBeVisible();
  await expect(page.getByLabel("Total Model Parameters")).toHaveValue("7");

  await page.getByLabel("Total Model Parameters").fill("400");
  await expect(
    page.getByRole("status", { name: "Estimated VRAM required" }),
  ).not.toHaveText("18.8 GB");
  await expect(
    page.getByRole("note", { name: "Multi-GPU deployment guidance" }),
  ).toBeVisible();
});

test("clamps a malformed hand-edited URL to defaults without crashing", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  await page.goto(
    "/?total-params=<script>alert(1)</script>&precision=nonsense" +
      "&moe-enabled=maybe&context-tokens=-5&workload-family=warp-drive" +
      "&execution-mode=Overclock&unknown-param=1",
  );

  // Every unparsable value falls back to its default, so the page renders the
  // seed 7B estimate instead of crashing or reflecting the injected markup.
  await expect(page.locator('[data-out="total"]')).toHaveText("18.8 GB");
  await expect(page.locator('[data-out="gpu-class"]')).toHaveText(
    "24 GB hardware tier",
  );
  await expect(page.getByLabel("Total Model Parameters")).toHaveValue("7");
  await expect(page.getByLabel("Precision", { exact: true })).toHaveValue(
    "16-bit",
  );
  expect(pageErrors).toEqual([]);
});

test("offers the real GGUF quant ladder and sizes weights by its bits-per-weight", async ({
  page,
}) => {
  await page.goto("/");

  // Q4_K_M is a new GGUF tier grouped under an <optgroup>; selecting it must
  // update the value and the compact status strip.
  await page.getByLabel("Precision", { exact: true }).selectOption("Q4_K_M");
  await expect(page.getByLabel("Precision", { exact: true })).toHaveValue(
    "Q4_K_M",
  );
  await expect(page.locator('[data-slot="status-precision"]')).toHaveText(
    "Q4_K_M",
  );

  // 4.85 bpw => 0.60625 bytes/param; a 7B model's resident weights are
  // 7 * 0.60625 = 4.24 GB -> "4.3 GB" after upward display rounding,
  // distinct from nominal 4-bit ("4.1 GB").
  const modelWeights = page
    .locator('[data-out="stat-chips"] li')
    .filter({ hasText: "Model Weights" })
    .locator("strong");
  await expect(modelWeights).toHaveText("4.3 GB");
});

test("renders the default deployment computed locally", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "AI Deployment Calculator",
    }),
  ).toBeVisible();
  await expect(page.locator('[data-out="total"]')).toHaveText("18.8 GB");
  await expect(page.locator('[data-out="gpu-class"]')).toHaveText(
    "24 GB hardware tier",
  );
  // A single randomly picked example card surfaces on the hero GPU card
  // itself, visible at first glance without expanding any reasoning panel.
  // The pick is random in the browser, so assert the shape: one non-empty
  // card, never a " / "-joined catalog.
  const examples = page.locator('[data-slot="gpu-examples-row"]');
  await expect(examples).toBeVisible();
  await expect(examples).toContainText("e.g.");
  await expect(page.locator('[data-out="gpu-examples"]')).toHaveText(
    /^[^/]+$/u,
  );
  await expect(
    page.locator('[data-slot="hero-gpu-card"] [data-slot="gpu-examples-row"]'),
  ).toHaveCount(1);
  await expect(page.locator('[data-out="min-cap"]')).toHaveText("22.2 GB");
  await expect(page.locator('[data-out="speed"]')).toContainText("tokens/sec");
  await expect(page.locator('[data-out="calculation-rows"] li')).toHaveCount(
    10,
  );
});

test("keeps the hardware tier best-fit check visible as estimates change", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator('[data-out="gpu-class"]')).toHaveText(
    "24 GB hardware tier",
  );
  await expectBestFitTier(page, "24");

  await page.getByLabel("Total Model Parameters").fill("70");
  await expect(page.locator('[data-out="gpu-class"]')).toHaveText(
    "192 GB hardware tier",
  );
  await expectBestFitTier(page, "192");

  await page.getByLabel("Total Model Parameters").fill("400");
  await expect(page.locator('[data-out="gpu-class"]')).toContainText(
    "distributed multi-node",
  );
  await expectBestFitTier(page, "100000");

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator('[data-out="gpu-class"]')).toHaveText(
    "No model loaded",
  );
  await expect(page.locator('.tier-fit[data-fit="true"]')).toHaveCount(0);
  await expect(page.locator('.tier-fit[aria-hidden="false"]')).toHaveCount(0);
});

test("renders the default 7B estimate consistently across the full report", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator('[data-out="total"]')).toHaveText("18.8 GB");
  await expect(page.locator('[data-out="vram-say"]')).toHaveText(
    "Fits on one 24 GB card: 18.8 GB uses 92% of its 20.4 GB usable VRAM.",
  );
  await expect(page.locator('[data-out="gpu-class"]')).toHaveText(
    "24 GB hardware tier",
  );
  await expectNoConfidenceOutput(page);

  await page.getByText("Why this recommendation").click();
  await expect(page.locator('[data-out="why"]')).toContainText(
    "requires hardware with at least 22.2 GB accelerator memory",
  );
  await expect(page.locator('[data-out="min-cap"]')).toHaveText("22.2 GB");
  await expect(page.locator('[data-out="usable-target"]')).toHaveText("85%");
  await expect(page.locator('[data-out="usable-on-class"]')).toHaveText(
    "20.4 GB",
  );
  await expect(page.locator('[data-out="fit-headroom"]')).toHaveText(
    "1.6 GB usable margin",
  );
  await expect(page.locator('[data-out="speed"]')).toHaveText(
    "66.9 tokens/sec",
  );

  await page.getByText("Values Used In Calculations").click();
  await expectReportRows(page, "calculation-rows", [
    ["Model weights", "14.0 GB"],
    ["Context memory", "1.1 GB"],
    ["Activation memory", "0.5 GB"],
    ["Working memory subtotal", "1.6 GB"],
    ["Training state", "0.0 GB"],
    ["Runtime overhead", "1.5 GB"],
    ["Base subtotal before buffer", "17.1 GB"],
    ["Buffer multiplier", "1.10x"],
    ["Safety buffer", "1.8 GB"],
    ["Total required", "18.8 GB"],
  ]);

  await page.getByText("Formula used").click();
  await expect(page.locator('[data-out="calc-formula"]')).toHaveText(
    "VRAM = (weights + KV cache + activations + runtime overhead) × buffer",
  );
  // The general formula is followed by the same terms with the real numbers.
  await expect(page.locator('[data-out="calc-numbers"]')).toHaveText(
    "18.8 GB ≈ (14.0 + 1.1 + 0.5 + 1.5) GB × 1.10",
  );

  // Assumptions are short methodology notes (green-bulleted prose), not an echo
  // of the inputs the user already entered.
  await page.getByText("Assumptions used").click();
  await expect(page.locator('[data-out="assumptions"] li span')).toHaveText([
    "Runtime / CUDA overhead estimated at a fixed 1.5 GB for this mode and runtime profile.",
    "KV cache precision: 16-bit.",
    "Activation memory estimated at fp16 compute precision.",
    "15% of advertised card VRAM reserved for the driver + CUDA context.",
  ]);
  await expect(page.locator('[data-out="warnings"]')).toBeHidden();
  await expect(page.locator('[data-slot="parallelism"]')).toBeHidden();
});

test("surfaces the multi-GPU parallelism callout when no single card fits", async ({
  page,
}) => {
  await page.goto("/");

  // A single-accelerator workload keeps the callout out of the way.
  const callout = page.locator('[data-slot="parallelism"]');
  await expect(callout).toBeHidden();

  // Full training of 8B overflows every single-accelerator tier.
  await page.locator("#execution-mode").selectOption("Full training");
  await page.locator("#total-params").fill("8");
  await expect(callout).toBeVisible();
  await expect(callout).toContainText(
    "Too large for any single GPU or accelerator. Split the model",
  );

  const links = callout.locator('[data-out="parallelism-links"] a');
  await expect(links).toHaveText(["FSDP", "ZeRO", "vLLM", "TP"]);
  await expect(links.first()).toHaveAttribute(
    "href",
    "https://pytorch.org/docs/stable/fsdp.html",
  );
  await expect(links.first()).toHaveAttribute("target", "_blank");
  await expect(links.first()).toHaveAttribute("rel", "noopener noreferrer");
});

test("hardware tier reference marks fits and opens one row at a time", async ({
  page,
}) => {
  await page.goto("/");

  const rows = page.locator("details.tier");
  await expect(rows).toHaveCount(5);
  // The default 7B fits the 24 GB tier; only that best-fit check paints in.
  await expect(page.locator('[data-tier-fit][data-fit="true"]')).toHaveCount(1);
  await expect(
    page.locator('[data-tier-fit][data-fit="true"]'),
  ).toHaveAttribute("data-tier-fit", "24");

  // name="hardware-tier" keeps the accordion exclusive with no JS: opening
  // the second row closes the first.
  await rows.nth(0).locator("summary").click();
  await expect(rows.nth(0)).toHaveJSProperty("open", true);
  await rows.nth(1).locator("summary").click();
  await expect(rows.nth(1)).toHaveJSProperty("open", true);
  await expect(rows.nth(0)).toHaveJSProperty("open", false);

  // A giant model clears every single-accelerator check; only the
  // beyond-single row still fits.
  await page.locator("#total-params").fill("400");
  await expect(page.locator('[data-tier-fit][data-fit="true"]')).toHaveCount(1);
});

test("recomputes when parameters change", async ({ page }) => {
  await page.goto("/");

  await page.locator("#total-params").fill("104");
  await expect(page.locator('[data-out="total"]')).toHaveText("237.7 GB");
});

test("rejects negatives, exponents, and unbounded numbers", async ({
  page,
}) => {
  await page.goto("/");

  // Insertions carrying a sign or exponent are rejected outright before they
  // land, so the field visibly keeps its previous value; nothing is silently
  // reshaped into a plausible-but-wrong magnitude like "95".
  await page.locator("#context-tokens").fill("-9e5");
  await expect(page.locator("#context-tokens")).toHaveValue("8000");

  await page.locator("#context-tokens").fill("9e5");
  await expect(page.locator("#context-tokens")).toHaveValue("8000");

  // Pure digits pass through and only clamp at the supported maximum.
  await page.locator("#context-tokens").fill("100000000");
  await expect(page.locator("#context-tokens")).toHaveValue("99999999");
});

test("reset zeroes inputs and outputs", async ({ page }) => {
  await page.goto("/");

  await page.locator("#total-params").fill("104");
  await expect(page.locator('[data-out="total"]')).not.toHaveText("0.0 GB");

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator("#total-params")).toHaveValue("0");
  await expect(page.locator('[data-out="total"]')).toHaveText("0.0 GB");
});

test("keyboard-only walkthrough reaches and activates core controls", async ({
  page,
}) => {
  await page.goto("/");

  const advanced = page.getByText("Advanced assumptions", { exact: true });
  await advanced.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Known Model File Size")).toBeVisible();

  const moe = page.getByLabel("MoE Model", { exact: true });
  await moe.focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Active Parameters")).toBeVisible();

  const why = page.getByText("Why this recommendation", { exact: true });
  await why.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-out="why"]')).toBeVisible();

  await page.getByLabel("Total Model Parameters").fill("104");
  await expect(page.locator('[data-out="total"]')).not.toHaveText("0.0 GB");
  await page.getByRole("button", { name: "Reset" }).focus();
  await page.keyboard.press("Enter");
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
    "calculation-rows",
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

  await page.getByText("Values Used In Calculations").click();
  await expect(page.locator('[data-out="calculation-rows"]')).toBeVisible();
  await expect(page.locator('[data-out="calculation-rows"] li')).toHaveCount(
    10,
  );

  await page.getByText("Formula used").click();
  await expect(page.locator('[data-out="calc-formula"]')).toBeVisible();

  await page.getByText("Assumptions used").click();
  await expect(page.locator('[data-out="assumptions"]')).toBeVisible();

  await expect(page.locator('[data-slot="vram-reference-table"]')).toBeHidden();
  await page.getByText("How VRAM is calculated", { exact: true }).click();
  await expect(
    page.locator('[data-slot="vram-reference-table"]'),
  ).toBeVisible();
});

test("uses green only for expanded result detail headings", async ({
  page,
}) => {
  await page.goto("/");
  const why = page.getByText("Why this recommendation", { exact: true });
  const formula = page.getByText("Formula used", { exact: true });

  // Collapsed headings read as muted HUD captions (the stat-chip grey); only
  // the expanded one turns green to mark the active section.
  await expect(why).toHaveCSS("color", "rgb(139, 139, 147)");
  await expect(formula).toHaveCSS("color", "rgb(139, 139, 147)");

  await why.click();

  await expect(why).toHaveCSS("color", "rgb(34, 197, 94)");
  await expect(formula).toHaveCSS("color", "rgb(139, 139, 147)");
});

test("marks expandable detail panels with a token chevron, not a button", async ({
  page,
}) => {
  await page.goto("/");
  const summary = page.getByText("Why this recommendation", { exact: true });

  // The native disclosure triangle is suppressed so the styled chevron is the
  // only expansion marker the reader sees.
  await expect(summary).toHaveCSS("list-style-type", "none");

  const readChevron = async (): Promise<{
    content: string;
    borderBottomStyle: string;
    borderBottomWidth: string;
    transform: string;
  }> =>
    summary.evaluate((node) => {
      const style = getComputedStyle(node, "::after");
      return {
        content: style.content,
        borderBottomStyle: style.borderBottomStyle,
        borderBottomWidth: style.borderBottomWidth,
        transform: style.transform,
      };
    });

  const closed = await readChevron();
  expect(closed.borderBottomStyle).toBe("solid");
  expect(closed.borderBottomWidth).not.toBe("0px");
  expect(closed.transform).not.toBe("none");

  // Expanding the panel rotates the same chevron so the affordance tracks
  // state. Toggle the disclosure directly to avoid mobile tap emulation quirks.
  await page.locator('[data-slot="why-panel"]').evaluate((node) => {
    if (node instanceof HTMLDetailsElement) {
      node.open = true;
    }
  });
  // Poll past the rotation transition so the settled open transform is read.
  await expect
    .poll(async () => {
      const chevron = await readChevron();
      return chevron.transform;
    })
    .not.toBe(closed.transform);
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
  await expect(page.locator('[data-out="total"]')).toHaveText("18.8 GB");
});

test("introduces the calculator with its purpose subtitle in the input pane", async ({
  page,
}) => {
  await page.goto("/");

  const subtitle = page
    .locator(".inputs .intro p")
    .filter({ hasText: "Estimate the GPU VRAM" });
  await expect(subtitle).toBeVisible();
  await expect(subtitle).toHaveText(
    "Estimate the GPU VRAM and hardware tier needed to deploy an AI model's workload.",
  );
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
    "Concurrent Batch Requests",
  );
  await page.locator("#execution-mode").selectOption("Full training");
  await expect(page.locator("[data-workload-label]")).toHaveText(
    "Micro Batch Size",
  );
  await expect(page.getByText("Batch Size", { exact: true })).toHaveCount(0);
});

test("reveals active parameters only when MoE is enabled", async ({ page }) => {
  await page.goto("/");

  // MoE and its dependent Active Parameters field live in the advanced panel.
  await page.getByText("Advanced assumptions", { exact: true }).click();

  await expect(page.locator("#active-params")).toBeHidden();
  await page.locator("#moe-enabled").check();
  await expect(page.locator("#active-params")).toBeVisible();
});
