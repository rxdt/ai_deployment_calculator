import { expect, test } from "@playwright/test";

const report = {
  total_vram: "20.1 GB",
  host_ram: "32 GB host RAM",
  plan: {
    primary: "RTX 4090",
    primary_fit: "single GPU",
    optimization: "No memory optimization is needed.",
  },
  breakdown: [
    { label: "Weights", value: "16.0 GB" },
    { label: "KV cache", value: "0.8 GB" },
    { label: "Task", value: "0.0 GB" },
    { label: "CUDA/system", value: "1.5 GB" },
  ],
  hardware: [{ name: "RTX 4090", detail: "1 x 24 GB", sharding: "single GPU" }],
  comparison: [
    { precision: "32-bit", total: "37.7 GB", savings: "-17.6 GB", selected: false },
    { precision: "16-bit", total: "20.1 GB", savings: "0.0 GB", selected: true },
    { precision: "8-bit", total: "11.3 GB", savings: "8.8 GB", selected: false },
    { precision: "4-bit", total: "6.9 GB", savings: "13.2 GB", selected: false },
  ],
  assumptions: [
    { label: "Safety margin", value: "10%" },
    { label: "CUDA/system tax", value: "1.5 GB" },
  ],
  calculation: "(16.0 + 0.8 + 0.0 + 1.5) * 1.10",
};

const submittedReport = {
  ...report,
  total_vram: "52.3 GB",
  host_ram: "64 GB host RAM",
  plan: {
    primary: "A100 80GB",
    primary_fit: "single GPU",
    optimization: "Use FP8 KV cache to reduce long-context memory.",
  },
  hardware: [{ name: "A100 80GB", detail: "1 x 80 GB", sharding: "single GPU" }],
};

test("renders the calculator and submits deployment inputs", async ({ page }) => {
  const apiRequests: URL[] = [];

  await page.route("**/api/report?**", async (route) => {
    const url = new URL(route.request().url());
    apiRequests.push(url);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(url.searchParams.get("parameters_b") === "70" ? submittedReport : report),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "VRAM Deployment Calculator" })).toBeVisible();
  await expect(page.locator(".total")).toHaveText("20.1 GB");
  await expect(page.getByLabel("Hardware recommendations")).toContainText("RTX 4090");
  await expect(page.getByLabel("Quantization comparison")).toContainText("16-bit");

  await page.getByLabel("Parameters (billions)").fill("70");
  await page.getByLabel("Context window").fill("16000");
  await page.getByLabel("Quantization").selectOption("4");
  await page.getByLabel("KV cache").selectOption("8");
  await page.getByLabel("Model is trained").check();
  await page.getByLabel("LoRA adapter").check();
  await page.getByRole("button", { name: "Calculate" }).click();

  await expect.poll(() => apiRequests.at(-1)?.searchParams.get("parameters_b")).toBe("70");
  expect(apiRequests.at(-1)?.searchParams.get("context_tokens")).toBe("16000");
  expect(apiRequests.at(-1)?.searchParams.get("weight_bits")).toBe("4");
  expect(apiRequests.at(-1)?.searchParams.get("kv_cache_bits")).toBe("8");
  expect(apiRequests.at(-1)?.searchParams.get("trained")).toBe("on");
  expect(apiRequests.at(-1)?.searchParams.get("use_adapter")).toBe("on");
  await expect(page.locator(".total")).toHaveText("52.3 GB");
  await expect(page.getByLabel("Hardware recommendations")).toContainText("A100 80GB");
  await expect(page.locator(".optimization")).toContainText("Use FP8 KV cache");
});

test("allows tiny decimal model sizes supported by the backend", async ({ page }) => {
  const apiRequests: URL[] = [];

  await page.route("**/api/report?**", async (route) => {
    const url = new URL(route.request().url());
    apiRequests.push(url);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(report),
    });
  });

  await page.goto("/");
  const parameters = page.getByLabel("Parameters (billions)");

  await expect(parameters).toHaveAttribute("step", "any");
  await parameters.fill("0.0004");
  await page.getByRole("button", { name: "Calculate" }).click();

  await expect.poll(() => apiRequests.at(-1)?.searchParams.get("parameters_b")).toBe("0.0004");
});

test("keeps the form visible when the report api fails", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "unavailable" }),
    });
  });

  await page.goto("/");

  await expect(page.getByLabel("Parameters (billions)")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.getByRole("alert")).toContainText("Unable to load report");
});

test("escapes reflected query and report values", async ({ page }) => {
  const hostileQuery = '/?parameters_b=%22%3E%3Cimg%20src=x%20onerror=%22window.injected%20%3D%20true%22%3E';

  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        total_vram: '<img src=x onerror="window.injected = true">20.1 GB',
        plan: {
          ...report.plan,
          primary: "<script>window.injected = true</script>RTX 4090",
          optimization: "<strong>Lower precision</strong>",
        },
      }),
    });
  });

  await page.goto(hostileQuery);

  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.locator(".total")).toContainText("20.1 GB");
  await expect(page.locator(".optimization")).toHaveText("<strong>Lower precision</strong>");
  await expect
    .poll(async () => page.evaluate(() => Boolean((window as Window & { injected?: boolean }).injected)))
    .toBe(false);
});
