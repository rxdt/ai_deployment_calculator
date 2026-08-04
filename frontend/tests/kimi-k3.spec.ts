import { expect, test } from "@playwright/test";

// Runs under every Playwright project in the harness config (desktop Chrome and
// Safari, iPhone, Pixel, the 320px minimum, and the 768px tablet), so the Kimi
// K3 hybrid-attention flow is exercised across all viewports.

test("Kimi K3 preset drives the hybrid-attention estimate and a shareable URL", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Kimi K3" }).click();

  // The MLA compressed cache + KDA fixed recurrent state (instead of a phantom
  // conventional cache), on top of the checkpoint's published 1561 GB of
  // shards rather than the generic MXFP4 line, land the 2.78T / 1M-context
  // estimate here.
  await expect(page.locator('[data-out="total"]')).toHaveText("1928.8 GB");

  // Every exact-architecture input is serialized to the address bar for sharing.
  const url = new URL(page.url());
  expect(url.searchParams.get("attention-type")).toBe("hybrid-kda-mla");
  expect(url.searchParams.get("layers")).toBe("93");
  expect(url.searchParams.get("kda-layers")).toBe("69");
  expect(url.searchParams.get("mla-layers")).toBe("24");
  expect(url.searchParams.get("kv-lora-rank")).toBe("512");
  expect(url.searchParams.get("precision")).toBe("MXFP4");

  // The overrides populate the advanced panel and stay put once revealed.
  await page.getByText("Advanced assumptions", { exact: true }).click();
  await expect(page.locator("#attention-type")).toHaveValue("hybrid-kda-mla");
  await expect(page.locator("#layers")).toHaveValue("93");
  await expect(page.locator("#kv-lora-rank")).toHaveValue("512");
});

test("a deep link built from the Kimi K3 URL schema restores the estimate", async ({
  page,
}) => {
  await page.goto(
    "/?total-params=2780&active-params=104&moe-enabled=true&layers=93" +
      "&hidden-size=7168&attention-heads=96&kv-heads=96&attention-type=hybrid-kda-mla" +
      "&kda-layers=69&mla-layers=24&kv-lora-rank=512&rope-head-dim=64" +
      "&head-dim=128&context-tokens=1048576&precision=MXFP4" +
      // The published checkpoint size and FP8 KV cache are part of the preset,
      // so a link that drops them restores a *different* (higher) estimate
      // built from the generic MXFP4 line. Carry the whole schema.
      "&known-model-file-size-gb=1561.0&kv-cache-precision=8-bit+%2F+FP8" +
      "&memory-sharding-enabled=true",
  );

  await expect(page.locator('[data-out="total"]')).toHaveText("1928.8 GB");
  await expect(page.locator("#precision")).toHaveValue("MXFP4");
});
