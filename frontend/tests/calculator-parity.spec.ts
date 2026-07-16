import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Calculator parity is engine-independent: the same TypeScript computes the
// report everywhere, so the sweep runs once per Chromium project instead of
// re-proving identical numbers on every engine.
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "Calculator parity is engine-independent and runs in Chromium projects.",
);

/**
Assert selected label/value rows rendered inside a report list.
@param page Browser page.
@param slot Output slot name.
@param rows Expected label/value pairs.
*/
async function expectReportRowsContaining(
  page: Page,
  slot: string,
  rows: readonly [string, string][],
): Promise<void> {
  const values = await page
    .locator(`[data-out="${slot}"] li`)
    .evaluateAll((items) =>
      items.map((item) => {
        const [labelNode, valueNode] = item.children;
        const label = labelNode?.textContent ?? "";
        const value = valueNode?.textContent ?? "";
        return [label, value] as const;
      }),
    );
  for (const row of rows) {
    expect(values).toContainEqual(row);
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

interface BrowserCalculationCase {
  readonly name: string;
  readonly controls: readonly (readonly [
    string,
    string | boolean,
    "fill" | "select" | "check",
  ])[];
  readonly total: string;
  readonly gpuClass: string;
  readonly minimumRawVram: string;
  readonly calculationRows: readonly [string, string][];
}

const CANONICAL_BROWSER_CASES = [
  {
    name: "47B MoE server inference keeps full resident weights",
    controls: [
      ["#total-params", "47", "fill"],
      ["#moe-enabled", true, "check"],
      ["#active-params", "1.3", "fill"],
    ],
    total: "109.6 GB",
    gpuClass: "141 GB hardware tier",
    minimumRawVram: "128.9 GB",
    calculationRows: [
      ["Model weights", "94.0 GB"],
      ["Context memory", "2.6 GB"],
      ["Activation memory", "1.6 GB"],
      ["Runtime overhead", "1.5 GB"],
      ["Safety buffer", "10.0 GB"],
      ["Total required", "109.6 GB"],
    ],
  },
  {
    name: "8B QLoRA uses quantized base plus adapter state",
    controls: [
      ["#total-params", "8", "fill"],
      ["#execution-mode", "QLoRA fine-tuning", "select"],
      ["#lora-trainable-percent", "2", "fill"],
    ],
    total: "21.0 GB",
    gpuClass: "32 GB hardware tier",
    minimumRawVram: "26.3 GB",
    calculationRows: [
      ["Model weights", "4.6 GB"],
      ["Activation memory", "6.3 GB"],
      ["Training state", "1.9 GB"],
      ["Runtime overhead", "4.0 GB"],
      ["Safety buffer", "4.2 GB"],
      ["Total required", "21.0 GB"],
    ],
  },
  {
    name: "7B full training includes training state and activations",
    controls: [["#execution-mode", "Full training", "select"]],
    total: "152.9 GB",
    gpuClass: "192 GB hardware tier",
    minimumRawVram: "191.1 GB",
    calculationRows: [
      ["Model weights", "14.0 GB"],
      ["Activation memory", "6.3 GB"],
      ["Training state", "98.0 GB"],
      ["Runtime overhead", "4.0 GB"],
      ["Safety buffer", "30.6 GB"],
      ["Total required", "152.9 GB"],
    ],
  },
  {
    name: "104B exact local GGUF file overrides parameter weights",
    controls: [
      ["#total-params", "104", "fill"],
      ["#context-tokens", "32000", "fill"],
      ["#precision", "4-bit", "select"],
      ["#runtime-profile", "Local / Edge", "select"],
      ["#kv-cache-precision", "32-bit", "select"],
      ["#known-model-file-size-gb", "52", "fill"],
    ],
    total: "84.1 GB",
    gpuClass: "95 GB hardware tier",
    minimumRawVram: "93.4 GB",
    calculationRows: [
      ["Model weights", "52.0 GB"],
      ["Context memory", "25.2 GB"],
      ["Activation memory", "6.5 GB"],
      ["Runtime overhead", "0.5 GB"],
      ["Total required", "84.1 GB"],
    ],
  },
] satisfies readonly BrowserCalculationCase[];

/**
Apply one browser-calculation scenario through the real form controls.
@param page Browser page.
@param controls Ordered control operations.
*/
async function applyControls(
  page: Page,
  controls: BrowserCalculationCase["controls"],
): Promise<void> {
  await page.getByText("Advanced assumptions").click();
  for (const [selector, value, action] of controls) {
    const control = page.locator(selector);
    if (action === "fill") {
      await control.fill(String(value));
    } else if (action === "select") {
      await control.selectOption(String(value));
    } else {
      await control.setChecked(Boolean(value));
    }
  }
  await page.locator('[data-slot="advanced-assumptions"]').evaluate((node) => {
    if (node instanceof HTMLDetailsElement) {
      node.open = false;
    }
  });
}

/**
Canonical unit-test scenarios must produce the same visible report when entered
through browser controls, not only when called through TypeScript helpers.
*/
for (const scenario of CANONICAL_BROWSER_CASES) {
  test(`renders ${scenario.name}`, async ({ page }) => {
    await page.goto("/");

    await applyControls(page, scenario.controls);

    await expect(page.locator('[data-out="total"]')).toHaveText(scenario.total);
    await expect(page.locator('[data-out="gpu-class"]')).toHaveText(
      scenario.gpuClass,
    );
    await expectNoConfidenceOutput(page);

    await page.getByText("Why this recommendation").click();
    await expect(page.locator('[data-out="min-cap"]')).toHaveText(
      scenario.minimumRawVram,
    );

    await page.getByText("Values Used In Calculations").click();
    await expectReportRowsContaining(
      page,
      "calculation-rows",
      scenario.calculationRows,
    );

    // Assumptions are generic methodology notes (covered in report.test.ts), not
    // per-scenario values, so this parity sweep only checks the computed numbers.
    await page.getByText("Assumptions used").click();
    await expect(page.locator('[data-out="assumptions"] li')).not.toHaveCount(
      0,
    );
  });
}
