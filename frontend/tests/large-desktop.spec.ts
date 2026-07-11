import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Large-desktop launch check: at >=1440px the layout must cap at
// --layout-max (64rem = 1024px at the 16px root size) and sit centered in
// the viewport instead of looking lost in whitespace.
const largeDesktopViewports = [
  { height: 1050, name: "1680x1050", width: 1680 },
  { height: 1440, name: "2560x1440", width: 2560 },
] as const;
// 64rem cap plus a small tolerance for borders and subpixel rounding.
const layoutWidthCapPx = 1024 + 6;
// Centered means the left and right gutters match within this budget.
const gutterBalanceTolerancePx = 2;

// Mobile projects never reach these widths; this check is desktop-only.
test.skip(
  ({ isMobile }) => isMobile,
  "Large-desktop layout applies to desktop projects only",
);

/**
 Assert the document never overflows horizontally: content grows downward in
 normal flow, but nothing may extend past the viewport's right edge and force
 a horizontal scrollbar.
@param page - Playwright page under test
*/
async function expectNoHorizontalDocumentOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
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

for (const viewport of largeDesktopViewports) {
  test(`layout caps at 64rem centered at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    // (a) The capped element never exceeds --layout-max.
    const layout = requireBox(
      await page.locator(".layout").boundingBox(),
      "layout",
    );
    expect(layout.width).toBeLessThanOrEqual(layoutWidthCapPx);

    // (b) Equal gutters: the layout sits centered, not hugging one edge.
    const rightGutter = viewport.width - (layout.x + layout.width);
    expect(Math.abs(layout.x - rightGutter)).toBeLessThanOrEqual(
      gutterBalanceTolerancePx,
    );

    // (c) The wide viewport never introduces a horizontal scrollbar.
    await expectNoHorizontalDocumentOverflow(page);

    // (d) The topbar status spans and the hero total read in the initial
    // viewport without scrolling.
    const statusSpans = page.locator(".topbar .status-item > span");
    await expect(statusSpans).toHaveCount(4);
    const spans = await statusSpans.all();
    for (const span of spans) {
      await expect(span).toBeInViewport();
    }
    await expect(page.locator('[data-out="total"]')).toBeInViewport();
  });
}
