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
    { label: "KV cache heuristic", value: "(parameters / 10) * (context / 8k)" },
    { label: "Host RAM rule", value: "At least 32 GB, rounded up in 16 GB increments" },
    { label: "Supported precisions", value: "32-bit, 16-bit, 8-bit, and 4-bit weights and KV cache" },
  ],
  calculation: "(16.0 + 0.8 + 0.0 + 1.5) * 1.10",
};

const malformedPayloadScenarios = [
  {
    name: "rejects malformed report payloads before rendering",
    payload: {
      ...report,
      comparison: [{ precision: "16-bit", total: "20.1 GB", savings: "0.0 GB", selected: "yes" }],
    },
    hiddenSelector: ".total",
  },
  {
    name: "rejects blank top-level report strings before rendering",
    payload: { ...report, total_vram: " ", plan: { ...report.plan, primary: "" } },
    hiddenSelector: ".total",
    hiddenText: "Primary:",
  },
  {
    name: "rejects partial breakdown payloads before rendering",
    payload: { ...report, breakdown: report.breakdown.slice(0, 2) },
    hiddenLabel: "VRAM breakdown",
  },
  {
    name: "rejects breakdown payloads with unexpected labels before rendering",
    payload: { ...report, breakdown: report.breakdown.map((row) => ({ ...row, label: "Unknown subtotal" })) },
    hiddenLabel: "VRAM breakdown",
  },
  {
    name: "rejects empty hardware recommendations before rendering",
    payload: { ...report, hardware: [] },
    hiddenLabel: "Hardware recommendations",
  },
  {
    name: "rejects hardware recommendations with blank text before rendering",
    payload: { ...report, hardware: [{ name: "", detail: " ", sharding: "" }] },
    hiddenLabel: "Hardware recommendations",
  },
  {
    name: "rejects empty assumption summaries before rendering",
    payload: { ...report, assumptions: [] },
    hiddenLabel: "Assumptions",
  },
  {
    name: "rejects assumption summaries with unexpected labels before rendering",
    payload: { ...report, assumptions: report.assumptions.map((row) => ({ ...row, label: "Unknown assumption" })) },
    hiddenLabel: "Assumptions",
  },
  {
    name: "rejects assumption summaries with empty values before rendering",
    payload: { ...report, assumptions: report.assumptions.map((row) => ({ ...row, value: "" })) },
    hiddenLabel: "Assumptions",
  },
  {
    name: "rejects partial quantization comparisons before rendering",
    payload: { ...report, comparison: report.comparison.slice(0, 2) },
    hiddenLabel: "Quantization comparison",
  },
  {
    name: "rejects ambiguous selected quantization comparisons before rendering",
    payload: { ...report, comparison: report.comparison.map((row) => ({ ...row, selected: true })) },
    hiddenLabel: "Quantization comparison",
  },
  {
    name: "rejects selected quantization comparisons that do not match the submitted precision",
    payload: {
      ...report,
      comparison: report.comparison.map((row) => ({ ...row, selected: row.precision === "8-bit" })),
    },
    hiddenLabel: "Quantization comparison",
    url: "/?parameters_b=8&context_tokens=8000&weight_bits=16&kv_cache_bits=16",
  },
  {
    name: "rejects quantization comparisons with blank values before rendering",
    payload: { ...report, comparison: report.comparison.map((row) => ({ ...row, total: "", savings: " " })) },
    hiddenLabel: "Quantization comparison",
  },
];

for (const scenario of malformedPayloadScenarios) {
  test(scenario.name, async ({ page }) => {
    await page.route("**/api/report?**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(scenario.payload),
      });
    });

    await page.goto(scenario.url ?? "/");

    await expect(page.getByRole("alert")).toContainText("Report unavailable");
    if (scenario.hiddenLabel) {
      await expect(page.getByLabel(scenario.hiddenLabel)).toHaveCount(0);
    }
    if (scenario.hiddenSelector) {
      await expect(page.locator(scenario.hiddenSelector)).toHaveCount(0);
    }
    if (scenario.hiddenText) {
      await expect(page.getByText(scenario.hiddenText)).toHaveCount(0);
    }
  });
}

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
  await expect(page.locator(".optimization")).toHaveCount(0);
  await expect(page.getByText("<strong>Lower precision</strong>")).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => Boolean((window as Window & { injected?: boolean }).injected))).toBe(false);
});
