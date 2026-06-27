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
    "~/vram-calc",
  );
  await expect(page.getByLabel("Deployment status")).toContainText(
    "system: online",
  );
  await expect(page.locator(".total")).toHaveText("20.1 GB");
  await expect(page.getByLabel("Hardware recommendations")).toContainText(
    "RTX 4090",
  );
  await expect(page.getByLabel("Quantization comparison")).toContainText(
    "16-bit",
  );
  await expect(page.getByLabel("Assumptions")).toContainText("Safety margin");
  await expect(page.getByLabel("Assumptions")).toContainText("CUDA/system tax");
  await expect(page.getByLabel("Assumptions")).toContainText(
    "KV cache heuristic",
  );
  await expect(page.getByLabel("Assumptions")).toContainText("Host RAM rule");
  await expect(page.getByLabel("Assumptions")).toContainText(
    "Supported precisions",
  );
});

test("recomputes the deployment from submitted inputs", async ({ page }) => {
  await page.goto("/");

  await page
    .getByRole("spinbutton", { name: "Parameters (billions)", exact: true })
    .fill("70");
  await page.getByLabel("Context window").fill("16000");
  await page.locator('select[name="weight_bits"]').selectOption("4");
  await page.getByLabel("KV cache").selectOption("8");
  await page.getByLabel("Runtime").selectOption("llama_cpp_gguf");
  await page.getByLabel("Architecture").selectOption("moe");
  await expect(page.getByLabel("Active parameters (billions)")).toBeEnabled();
  await page.getByLabel("Active parameters (billions)").fill("8");
  await expect(page.getByLabel("LoRA adapter")).toBeDisabled();
  await page.getByLabel("GPUs are for model training").check();
  await expect(page.getByLabel("LoRA adapter")).toBeEnabled();
  await page.getByLabel("LoRA adapter").check();
  await page.getByRole("button", { name: "Calculate" }).click();

  await expect(page.locator(".total")).toHaveText("48.5 GB");
  await expect(page.getByLabel("Hardware recommendations")).toContainText(
    "A100 80GB",
  );
  await expect(page.locator(".optimization")).toHaveCount(0);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("parameters_b"))
    .toBe("70");
  expect(new URL(page.url()).searchParams.get("use_adapter")).toBe("on");
});

test("clears adapter use when training is turned off", async ({ page }) => {
  await page.goto(
    "/?parameters_b=8&context_tokens=8000&weight_bits=16&kv_cache_bits=16&trained=on&use_adapter=on",
  );
  await expect(page.getByLabel("LoRA adapter")).toBeChecked();

  await page.getByLabel("GPUs are for model training").uncheck();
  await expect(page.getByLabel("LoRA adapter")).toBeDisabled();
  await expect(page.getByLabel("LoRA adapter")).not.toBeChecked();
  await page.getByRole("button", { name: "Calculate" }).click();

  await expect
    .poll(() => new URL(page.url()).searchParams.get("trained"))
    .toBe(null);
  expect(new URL(page.url()).searchParams.get("use_adapter")).toBe(null);
});

test("allows tiny decimal model sizes", async ({ page }) => {
  await page.goto("/");
  const parameters = page.getByRole("spinbutton", {
    name: "Parameters (billions)",
    exact: true,
  });

  await expect(parameters).toHaveAttribute("step", "any");
  await parameters.fill("0.0004");
  await page.getByRole("button", { name: "Calculate" }).click();

  await expect
    .poll(() => new URL(page.url()).searchParams.get("parameters_b"))
    .toBe("0.0004");
  await expect(page.locator(".total")).toBeVisible();
});

test("normalizes invalid query values before rendering", async ({ page }) => {
  await page.goto(
    "/?parameters_b=0&context_tokens=8000&weight_bits=99&kv_cache_bits=4&runtime=tensorflow&trained=on&use_adapter=on",
  );

  await expect(
    page.getByRole("spinbutton", {
      name: "Parameters (billions)",
      exact: true,
    }),
  ).toHaveValue("8");
  await expect(page.getByLabel("Context window")).toHaveValue("8000");
  await expect(page.locator('select[name="weight_bits"]')).toHaveValue("16");
  await expect(page.getByLabel("KV cache")).toHaveValue("16");
  await expect(page.getByLabel("Runtime")).toHaveValue("pytorch");
  await expect(page.getByLabel("Architecture")).toHaveValue("dense");
  await expect(page.getByLabel("Active parameters (billions)")).toBeDisabled();
  await expect(
    page.getByLabel("GPUs are for model training"),
  ).not.toBeChecked();
  await expect(page.getByLabel("LoRA adapter")).toBeDisabled();
  await expect(page.getByLabel("LoRA adapter")).not.toBeChecked();
  await expect(page.locator(".total")).toHaveText("20.1 GB");
});

test("rejects non-decimal numeric query values", async ({ page }) => {
  await page.goto("/?parameters_b=0x10&context_tokens=8000");

  await expect(
    page.getByRole("spinbutton", {
      name: "Parameters (billions)",
      exact: true,
    }),
  ).toHaveValue("8");
  await expect(page.getByLabel("Context window")).toHaveValue("8000");
});

test("drops stale active parameters from dense query state", async ({
  page,
}) => {
  await page.goto(
    "/?parameters_b=8&context_tokens=8000&architecture=dense&active_parameters_b=999",
  );

  await expect(page.getByLabel("Architecture")).toHaveValue("dense");
  await expect(page.getByLabel("Active parameters (billions)")).toBeDisabled();
  await expect(page.getByLabel("Active parameters (billions)")).toHaveValue(
    "1.3",
  );
});

test("escapes reflected query values without injecting markup", async ({
  page,
}) => {
  const hostileQuery =
    "/?parameters_b=%22%3E%3Cimg%20src=x%20onerror=%22window.injected%20%3D%20true%22%3E";

  await page.goto(hostileQuery);

  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.locator(".total")).toHaveText("20.1 GB");
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Boolean((globalThis as unknown as { injected?: boolean }).injected),
      ),
    )
    .toBe(false);
});
