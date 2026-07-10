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
  readonly assumptions: readonly [string, string][];
}

const CANONICAL_BROWSER_CASES = [
  {
    name: "47B MoE server inference keeps full resident weights",
    controls: [
      ["#total-params", "47", "fill"],
      ["#moe-enabled", true, "check"],
      ["#active-params", "1.3", "fill"],
    ],
    total: "113.1 GB",
    gpuClass: "141 GB GPU hardware tier",
    minimumRawVram: "133.1 GB",
    calculationRows: [
      ["Weights_GB (model memory)", "94.0 GB"],
      ["Context memory", "2.6 GB"],
      ["Activation memory", "4.7 GB"],
      ["Runtime_Overhead_GB", "1.5 GB"],
      ["Safety_Buffer_GB", "10.3 GB"],
      ["Required_GB", "113.1 GB"],
    ],
    assumptions: [
      ["Precision", "16-bit"],
      ["Runtime profile", "Server / Cloud"],
      ["Execution mode", "Inference"],
      ["Context tokens", "8000"],
      ["Concurrent batch requests", "1"],
      ["KV Cache precision", "16-bit"],
      ["KV heads used", "8"],
      ["Conservative KV heads", "64"],
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
    gpuClass: "48 GB GPU hardware tier",
    minimumRawVram: "26.3 GB",
    calculationRows: [
      ["Weights_GB (model memory)", "4.6 GB"],
      ["Activation memory", "6.3 GB"],
      ["Training_State_GB", "1.9 GB"],
      ["Runtime_Overhead_GB", "4.0 GB"],
      ["Safety_Buffer_GB", "4.2 GB"],
      ["Required_GB", "21.0 GB"],
    ],
    assumptions: [
      ["Precision", "4-bit"],
      ["Runtime profile", "Local / Edge"],
      ["Execution mode", "QLoRA fine-tuning"],
      ["LoRA trainable parameters", "2%"],
      ["Optimizer", "AdamW"],
      ["Gradient checkpointing", "Enabled"],
      ["Context tokens", "8000"],
      ["Micro batch size", "1"],
    ],
  },
  {
    name: "7B full training includes training state and activations",
    controls: [["#execution-mode", "Full training", "select"]],
    total: "152.9 GB",
    gpuClass: "No single-GPU fit. Enable memory sharding or use offload.",
    minimumRawVram: "191.1 GB",
    calculationRows: [
      ["Weights_GB (model memory)", "14.0 GB"],
      ["Activation memory", "6.3 GB"],
      ["Training_State_GB", "98.0 GB"],
      ["Runtime_Overhead_GB", "4.0 GB"],
      ["Safety_Buffer_GB", "30.6 GB"],
      ["Required_GB", "152.9 GB"],
    ],
    assumptions: [
      ["Precision", "16-bit"],
      ["Runtime profile", "Server / Cloud"],
      ["Execution mode", "Full training"],
      ["Optimizer", "AdamW"],
      ["Gradient checkpointing", "Enabled"],
      ["Context tokens", "8000"],
      ["Micro batch size", "1"],
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
    total: "79.2 GB",
    gpuClass: "141 GB GPU hardware tier",
    minimumRawVram: "88.0 GB",
    calculationRows: [
      ["Weights_GB (model memory)", "52.0 GB"],
      ["Context memory", "25.2 GB"],
      ["Activation memory", "1.6 GB"],
      ["Runtime_Overhead_GB", "0.5 GB"],
      ["Required_GB", "79.2 GB"],
    ],
    assumptions: [
      ["Precision", "4-bit"],
      ["Runtime profile", "Local / Edge"],
      ["Execution mode", "Inference"],
      ["Known Model File Size", "52.0 GB"],
      ["Context tokens", "32000"],
      ["Concurrent batch requests", "1"],
      ["KV Cache precision", "32-bit"],
      ["KV heads used", "8"],
      ["Conservative KV heads", "80"],
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
  await expect(page.locator('[data-out="calculation-rows"] li')).toHaveCount(
    10,
  );
});

test("renders the default 7B estimate consistently across the full report", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator('[data-out="total"]')).toHaveText("19.0 GB");
  await expect(page.locator('[data-out="vram-say"]')).toHaveText(
    "The workload needs 19.0 GB usable VRAM.",
  );
  await expect(page.locator('[data-out="gpu-class"]')).toHaveText(
    "24 GB GPU hardware tier",
  );
  await expectNoConfidenceOutput(page);

  await page.getByText("Why this recommendation").click();
  await expect(page.locator('[data-out="why"]')).toContainText(
    "requires a GPU with at least 22.4 GB advertised VRAM",
  );
  await expect(page.locator('[data-out="min-cap"]')).toHaveText("22.4 GB");
  await expect(page.locator('[data-out="usable-target"]')).toHaveText("85%");
  await expect(page.locator('[data-out="usable-on-class"]')).toHaveText(
    "20.4 GB",
  );
  await expect(page.locator('[data-out="fit-headroom"]')).toHaveText(
    "1.4 GB usable margin",
  );
  await expect(page.locator('[data-out="speed"]')).toHaveText(
    "66.9 tokens/sec",
  );

  await page.getByText("Calculation used").click();
  await expectReportRows(page, "calculation-rows", [
    ["Weights_GB (model memory)", "14.0 GB"],
    ["Context memory", "1.0 GB"],
    ["Activation memory", "0.7 GB"],
    ["Working_Memory_GB subtotal", "1.7 GB"],
    ["Training_State_GB", "0.0 GB"],
    ["Runtime_Overhead_GB", "1.5 GB"],
    ["Base_GB before buffer", "17.2 GB"],
    ["Buffer multiplier", "1.10x"],
    ["Safety_Buffer_GB", "1.7 GB"],
    ["Required_GB", "19.0 GB"],
  ]);

  await page.getByText("Formula used").click();
  await expect(page.locator('[data-out="calc-formula"]')).toHaveText(
    "Required_GB = (Weights_GB + Working_Memory_GB + Training_State_GB + Runtime_Overhead_GB) * Buffer; Safety_Buffer_GB = Base_GB * (Buffer - 1)",
  );

  await page.getByText("Assumptions used").click();
  await expectReportRows(page, "assumptions", [
    ["Precision", "16-bit"],
    ["Runtime profile", "Server / Cloud"],
    ["Execution mode", "Inference"],
    ["Context tokens", "8000"],
    ["Concurrent batch requests", "1"],
    ["KV Cache precision", "16-bit"],
    ["KV heads used", "8"],
    ["Conservative KV heads", "32"],
  ]);
  await expect(page.locator('[data-out="warnings"]')).toBeHidden();
});

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

    await page.getByText("Calculation used").click();
    await expectReportRowsContaining(
      page,
      "calculation-rows",
      scenario.calculationRows,
    );

    await page.getByText("Assumptions used").click();
    await expectReportRows(page, "assumptions", scenario.assumptions);
  });
}

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

  await page.getByText("Calculation used").click();
  await expect(page.locator('[data-out="calculation-rows"]')).toBeVisible();
  await expect(page.locator('[data-out="calculation-rows"] li')).toHaveCount(
    10,
  );

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

  await expect(page.locator("#active-params")).toBeHidden();
  await page.locator("#moe-enabled").check();
  await expect(page.locator("#active-params")).toBeVisible();
});
