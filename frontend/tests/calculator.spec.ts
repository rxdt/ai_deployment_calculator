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
  comparison: report.comparison.map((row) => ({ ...row, selected: row.precision === "4-bit" })),
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
  await expect(page.getByLabel("Deployment status")).toContainText("~/vram-calc");
  await expect(page.getByLabel("Deployment status")).toContainText("system: online");
  await expect(page.locator(".total")).toHaveText("20.1 GB");
  await expect(page.getByLabel("Hardware recommendations")).toContainText("RTX 4090");
  await expect(page.getByLabel("Quantization comparison")).toContainText("16-bit");
  await expect(page.getByLabel("Assumptions")).toContainText("Safety margin");
  await expect(page.getByLabel("Assumptions")).toContainText("CUDA/system tax");
  await expect(page.getByLabel("Assumptions")).toContainText("KV cache heuristic");
  await expect(page.getByLabel("Assumptions")).toContainText("Host RAM rule");
  await expect(page.getByLabel("Assumptions")).toContainText("Supported precisions");

  await page.getByRole("spinbutton", { name: "Parameters (billions)", exact: true }).fill("70");
  await page.getByLabel("Context window").fill("16000");
  await page.locator('select[name="weight_bits"]').selectOption("4");
  await page.getByLabel("KV cache").selectOption("8");
  await page.getByLabel("Runtime").selectOption("llama_cpp_gguf");
  await page.getByLabel("Architecture").selectOption("moe");
  await expect(page.getByLabel("Active parameters (billions)")).toBeEnabled();
  await page.getByLabel("Active parameters (billions)").fill("8");
  await expect(page.getByLabel("LoRA adapter")).toBeDisabled();
  await page.getByLabel("Model is trained").check();
  await expect(page.getByLabel("LoRA adapter")).toBeEnabled();
  await page.getByLabel("LoRA adapter").check();
  await page.getByRole("button", { name: "Calculate" }).click();

  await expect.poll(() => apiRequests.at(-1)?.searchParams.get("parameters_b")).toBe("70");
  expect(apiRequests.at(-1)?.searchParams.get("context_tokens")).toBe("16000");
  expect(apiRequests.at(-1)?.searchParams.get("weight_bits")).toBe("4");
  expect(apiRequests.at(-1)?.searchParams.get("kv_cache_bits")).toBe("8");
  expect(apiRequests.at(-1)?.searchParams.get("runtime")).toBe("llama_cpp_gguf");
  expect(apiRequests.at(-1)?.searchParams.get("architecture")).toBe("moe");
  expect(apiRequests.at(-1)?.searchParams.get("active_parameters_b")).toBe("8");
  expect(apiRequests.at(-1)?.searchParams.get("trained")).toBe("on");
  expect(apiRequests.at(-1)?.searchParams.get("use_adapter")).toBe("on");
  await expect(page.locator(".total")).toHaveText("52.3 GB");
  await expect(page.getByLabel("Hardware recommendations")).toContainText("A100 80GB");
  await expect(page.locator(".optimization")).toHaveCount(0);
  await expect(page.getByText("Use FP8 KV cache")).toHaveCount(0);
});

test("clears adapter use when training is turned off", async ({ page }) => {
  const apiRequests: URL[] = [];

  await page.route("**/api/report?**", async (route) => {
    const url = new URL(route.request().url());
    apiRequests.push(url);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(report),
    });
  });

  await page.goto("/?parameters_b=8&context_tokens=8000&weight_bits=16&kv_cache_bits=16&trained=on&use_adapter=on");
  await expect(page.getByLabel("LoRA adapter")).toBeChecked();

  await page.getByLabel("Model is trained").uncheck();
  await expect(page.getByLabel("LoRA adapter")).toBeDisabled();
  await expect(page.getByLabel("LoRA adapter")).not.toBeChecked();
  await page.getByRole("button", { name: "Calculate" }).click();

  await expect.poll(() => apiRequests.at(-1)?.searchParams.get("trained")).toBe(null);
  expect(apiRequests.at(-1)?.searchParams.get("use_adapter")).toBe(null);
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
  const parameters = page.getByRole("spinbutton", { name: "Parameters (billions)", exact: true });

  await expect(parameters).toHaveAttribute("step", "any");
  await parameters.fill("0.0004");
  await page.getByRole("button", { name: "Calculate" }).click();

  await expect.poll(() => apiRequests.at(-1)?.searchParams.get("parameters_b")).toBe("0.0004");
});

test("keeps the latest submitted report when an earlier request finishes late", async ({ page }) => {
  let releaseStaleRequest: (() => void) | undefined;
  let markStaleRequestDone: (() => void) | undefined;
  const staleRequestDone = new Promise<void>((resolve) => {
    markStaleRequestDone = resolve;
  });

  await page.route("**/api/report?**", async (route) => {
    const url = new URL(route.request().url());
    const parameters = url.searchParams.get("parameters_b");
    if (parameters === "70") {
      await new Promise<void>((resolve) => {
        releaseStaleRequest = resolve;
      });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...report, total_vram: "70.0 GB" }),
      });
      markStaleRequestDone?.();
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(parameters === "13" ? { ...report, total_vram: "13.0 GB" } : report),
    });
  });

  await page.goto("/");
  await expect(page.locator(".total")).toHaveText("20.1 GB");

  await page.getByRole("spinbutton", { name: "Parameters (billions)", exact: true }).fill("70");
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect.poll(() => Boolean(releaseStaleRequest)).toBe(true);

  await page.getByRole("spinbutton", { name: "Parameters (billions)", exact: true }).fill("13");
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.locator(".total")).toHaveText("13.0 GB");

  releaseStaleRequest?.();
  await staleRequestDone;
  await expect(page.locator(".total")).toHaveText("13.0 GB");
});

test("normalizes invalid query values before rendering and requesting a report", async ({ page }) => {
  const apiRequests: URL[] = [];

  await page.route("**/api/report?**", async (route) => {
    const url = new URL(route.request().url());
    apiRequests.push(url);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(report),
    });
  });

  await page.goto(
    "/?parameters_b=0&context_tokens=8000&weight_bits=99&kv_cache_bits=4&runtime=tensorflow&trained=on&use_adapter=on",
  );

  await expect.poll(() => apiRequests.at(0)?.searchParams.get("parameters_b")).toBe("8");
  expect(apiRequests.at(0)?.searchParams.get("context_tokens")).toBe("8000");
  expect(apiRequests.at(0)?.searchParams.get("weight_bits")).toBe("16");
  expect(apiRequests.at(0)?.searchParams.get("kv_cache_bits")).toBe("16");
  expect(apiRequests.at(0)?.searchParams.get("runtime")).toBe("pytorch");
  expect(apiRequests.at(0)?.searchParams.get("architecture")).toBe("dense");
  expect(apiRequests.at(0)?.searchParams.get("active_parameters_b")).toBe(null);
  expect(apiRequests.at(0)?.searchParams.get("trained")).toBe(null);
  expect(apiRequests.at(0)?.searchParams.get("use_adapter")).toBe(null);
  await expect(page.getByRole("spinbutton", { name: "Parameters (billions)", exact: true })).toHaveValue("8");
  await expect(page.getByLabel("Context window")).toHaveValue("8000");
  await expect(page.locator('select[name="weight_bits"]')).toHaveValue("16");
  await expect(page.getByLabel("KV cache")).toHaveValue("16");
  await expect(page.getByLabel("Runtime")).toHaveValue("pytorch");
  await expect(page.getByLabel("Architecture")).toHaveValue("dense");
  await expect(page.getByLabel("Active parameters (billions)")).toBeDisabled();
  await expect(page.getByLabel("Model is trained")).not.toBeChecked();
  await expect(page.getByLabel("LoRA adapter")).toBeDisabled();
  await expect(page.getByLabel("LoRA adapter")).not.toBeChecked();
});

test("rejects non-decimal numeric query values before requesting a report", async ({ page }) => {
  const apiRequests: URL[] = [];

  await page.route("**/api/report?**", async (route) => {
    const url = new URL(route.request().url());
    apiRequests.push(url);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(report),
    });
  });

  await page.goto("/?parameters_b=0x10&context_tokens=8000");

  await expect.poll(() => apiRequests.at(0)?.searchParams.get("parameters_b")).toBe("8");
  expect(apiRequests.at(0)?.searchParams.get("context_tokens")).toBe("8000");
  await expect(page.getByRole("spinbutton", { name: "Parameters (billions)", exact: true })).toHaveValue("8");
});

test("drops stale active parameters from dense query state", async ({ page }) => {
  const apiRequests: URL[] = [];

  await page.route("**/api/report?**", async (route) => {
    const url = new URL(route.request().url());
    apiRequests.push(url);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(report),
    });
  });

  await page.goto("/?parameters_b=8&context_tokens=8000&architecture=dense&active_parameters_b=999");

  await expect.poll(() => apiRequests.at(0)?.searchParams.get("active_parameters_b")).toBe(null);
  await expect(page.getByLabel("Architecture")).toHaveValue("dense");
  await expect(page.getByLabel("Active parameters (billions)")).toBeDisabled();
  await expect(page.getByLabel("Active parameters (billions)")).toHaveValue("1.3");
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

  await expect(page.getByRole("spinbutton", { name: "Parameters (billions)", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.getByRole("alert")).toContainText("Unable to load report");
});

test("rejects malformed report payloads before rendering", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        comparison: [{ precision: "16-bit", total: "20.1 GB", savings: "0.0 GB", selected: "yes" }],
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("spinbutton", { name: "Parameters (billions)", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.locator(".total")).toHaveCount(0);
});

test("rejects blank top-level report strings before rendering", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        total_vram: " ",
        plan: {
          ...report.plan,
          primary: "",
        },
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.locator(".total")).toHaveCount(0);
  await expect(page.getByText("Primary:")).toHaveCount(0);
});

test("rejects partial breakdown payloads before rendering", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        breakdown: report.breakdown.slice(0, 2),
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.getByLabel("VRAM breakdown")).toHaveCount(0);
});

test("rejects breakdown payloads with unexpected labels before rendering", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        breakdown: report.breakdown.map((row) => ({ ...row, label: "Unknown subtotal" })),
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.getByLabel("VRAM breakdown")).toHaveCount(0);
});

test("rejects empty hardware recommendations before rendering", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        hardware: [],
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.getByLabel("Hardware recommendations")).toHaveCount(0);
});

test("rejects hardware recommendations with blank text before rendering", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        hardware: [{ name: "", detail: " ", sharding: "" }],
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.getByLabel("Hardware recommendations")).toHaveCount(0);
});

test("rejects empty assumption summaries before rendering", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        assumptions: [],
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.getByLabel("Assumptions")).toHaveCount(0);
});

test("rejects assumption summaries with unexpected labels before rendering", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        assumptions: report.assumptions.map((row) => ({ ...row, label: "Unknown assumption" })),
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.getByLabel("Assumptions")).toHaveCount(0);
});

test("rejects assumption summaries with empty values before rendering", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        assumptions: report.assumptions.map((row) => ({ ...row, value: "" })),
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.getByLabel("Assumptions")).toHaveCount(0);
});

test("rejects partial quantization comparisons before rendering", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        comparison: report.comparison.slice(0, 2),
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.getByLabel("Quantization comparison")).toHaveCount(0);
});

test("rejects ambiguous selected quantization comparisons before rendering", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        comparison: report.comparison.map((row) => ({ ...row, selected: true })),
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.getByLabel("Quantization comparison")).toHaveCount(0);
});

test("rejects selected quantization comparisons that do not match the submitted precision", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        comparison: report.comparison.map((row) => ({
          ...row,
          selected: row.precision === "8-bit",
        })),
      }),
    });
  });

  await page.goto("/?parameters_b=8&context_tokens=8000&weight_bits=16&kv_cache_bits=16");

  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.getByLabel("Quantization comparison")).toHaveCount(0);
});

test("rejects quantization comparisons with blank values before rendering", async ({ page }) => {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...report,
        comparison: report.comparison.map((row) => ({ ...row, total: "", savings: " " })),
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await expect(page.getByLabel("Quantization comparison")).toHaveCount(0);
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
  await expect(page.locator(".optimization")).toHaveCount(0);
  await expect(page.getByText("<strong>Lower precision</strong>")).toHaveCount(0);
  await expect
    .poll(async () => page.evaluate(() => Boolean((window as Window & { injected?: boolean }).injected)))
    .toBe(false);
});
