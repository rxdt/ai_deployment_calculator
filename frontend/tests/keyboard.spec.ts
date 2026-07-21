import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Hard cap on Tab presses: enough to cycle every tabbable at least once
// without letting a broken page spin forever.
const TAB_CAP = 80;
const PRESET_IDS = [
  "llama-8b",
  "llama-70b",
  "mixtral-8x7b",
  "gemma-9b",
  "sdxl",
  "onnx-distilbert",
] as const;

// WebKit mirrors Safari's macOS default where plain Tab skips buttons and
// links ("Press Tab to highlight each item" is off), so a Tab-driven
// walkthrough cannot run there without Option+Tab, which no real Safari
// keyboard user gets by default either. Chromium projects (desktop, tablet,
// pixel, small-320) carry this coverage.
test.skip(
  ({ browserName }) => browserName === "webkit",
  "plain Tab skips buttons/links on WebKit-mac, matching the Safari default",
);

interface FocusStop {
  readonly action: string;
  readonly id: string;
  readonly preset: string;
  readonly slot: string;
  readonly tag: string;
}

/**
 Read a compact descriptor of the element that currently holds focus.
@param page Browser page.
*/
async function readFocusStop(page: Page): Promise<FocusStop> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
      return { action: "", id: "", preset: "", slot: "", tag: "" };
    }
    return {
      action: active.dataset.action ?? "",
      id: active.id,
      preset: active.dataset.preset ?? "",
      slot: active.dataset.slot ?? "",
      tag: active.tagName.toLowerCase(),
    };
  });
}

/**
 Press Tab up to `cap` times, recording the focused element after each press.
@param page Browser page.
@param cap Hard cap on Tab presses.
*/
async function collectTabStops(page: Page, cap: number): Promise<FocusStop[]> {
  const stops: FocusStop[] = [];
  for (let index = 0; index < cap; index += 1) {
    await page.keyboard.press("Tab");
    stops.push(await readFocusStop(page));
  }
  return stops;
}

/**
 Press Tab until the focused element matches, failing after the hard cap.
@param page Browser page.
@param isTarget Predicate over the focused element descriptor.
@param target Human-readable target name for failures.
*/
async function tabUntil(
  page: Page,
  isTarget: (stop: FocusStop) => boolean,
  target: string,
): Promise<void> {
  for (let index = 0; index < TAB_CAP; index += 1) {
    await page.keyboard.press("Tab");
    if (isTarget(await readFocusStop(page))) {
      return;
    }
  }
  throw new Error(
    `Tab never reached ${target} within ${String(TAB_CAP)} presses`,
  );
}

/**
 Assert the focused element paints a visible focus indicator: a rendered
 outline or box-shadow (the app promises cyan :focus-visible outlines).
@param page Browser page.
*/
async function expectVisibleFocusIndicator(page: Page): Promise<void> {
  const indicator = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
      return { boxShadow: "none", outlineStyle: "none" };
    }
    const style = getComputedStyle(active);
    return { boxShadow: style.boxShadow, outlineStyle: style.outlineStyle };
  });
  const isVisible =
    indicator.outlineStyle !== "none" || indicator.boxShadow !== "none";
  expect(
    isVisible,
    `focused element paints an outline or shadow, got ${JSON.stringify(indicator)}`,
  ).toBe(true);
}

test("tab order reaches every interactive control without a trap", async ({
  page,
}) => {
  await page.goto("/");
  const stops = await collectTabStops(page, TAB_CAP);

  // Everything interactive must be reachable: the header MODEL link, the
  // GitHub link, every preset chip, the first form controls, and Reset. The
  // walkthrough asserts reachability plus one ordering contract (form
  // controls come after the preset chips), not an exact global order.
  const presetIndexes: number[] = [];
  for (const preset of PRESET_IDS) {
    const stopIndex = stops.findIndex((stop) => stop.preset === preset);
    expect(
      stopIndex,
      `preset chip ${preset} is reachable`,
    ).toBeGreaterThanOrEqual(0);
    presetIndexes.push(stopIndex);
  }
  const modelLinkIndex = stops.findIndex(
    (stop) => stop.slot === "status-model-link",
  );
  const githubIndex = stops.findIndex((stop) => stop.slot === "github-link");
  const familyIndex = stops.findIndex((stop) => stop.id === "workload-family");
  const totalIndex = stops.findIndex((stop) => stop.id === "total-params");
  const resetIndex = stops.findIndex((stop) => stop.action === "reset");
  expect(
    modelLinkIndex,
    "header MODEL link is reachable",
  ).toBeGreaterThanOrEqual(0);
  expect(githubIndex, "GitHub link is reachable").toBeGreaterThanOrEqual(0);
  expect(familyIndex, "Model Task Family is reachable").toBeGreaterThanOrEqual(
    0,
  );
  expect(
    totalIndex,
    "Total Model Parameters is reachable",
  ).toBeGreaterThanOrEqual(0);
  expect(resetIndex, "Reset button is reachable").toBeGreaterThanOrEqual(0);
  expect(familyIndex).toBeGreaterThan(Math.max(...presetIndexes));
  expect(totalIndex).toBeGreaterThan(familyIndex);

  // No keyboard trap: even after the whole cycle, one more Tab still moves
  // focus off the current element (marked in-page so identical-looking
  // neighbors cannot fake a move).
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.dataset.focusProbe = "true";
    }
  });
  await page.keyboard.press("Tab");
  const didMove = await page.evaluate(() => {
    const active = document.activeElement;
    return (
      !(active instanceof HTMLElement) ||
      active.dataset.focusProbe === undefined
    );
  });
  expect(didMove, "Tab still moves focus after the full cycle").toBe(true);
});

test("keyboard focus is visibly indicated on chips and text inputs", async ({
  page,
}) => {
  await page.goto("/");

  await tabUntil(
    page,
    (stop) => stop.preset === "llama-8b",
    "the Llama 8B preset chip",
  );
  await expectVisibleFocusIndicator(page);

  await tabUntil(
    page,
    (stop) => stop.id === "total-params",
    "the Total Model Parameters input",
  );
  await expectVisibleFocusIndicator(page);
});

test("advanced assumptions opens, toggles MoE, and closes by keyboard", async ({
  page,
}) => {
  await page.goto("/");
  const moe = page.getByLabel("MoE Model", { exact: true });
  await expect(moe).toBeHidden();

  await tabUntil(
    page,
    (stop) => stop.slot === "advanced-assumptions-label",
    "the Advanced assumptions summary",
  );
  await page.keyboard.press("Enter");
  await expect(moe).toBeVisible();

  // The MoE checkbox is the panel's first control, one Tab past the summary,
  // and Space toggles it both ways.
  await tabUntil(page, (stop) => stop.id === "moe-enabled", "the MoE checkbox");
  await page.keyboard.press("Space");
  await expect(moe).toBeChecked();
  await page.keyboard.press("Space");
  await expect(moe).not.toBeChecked();

  // Shift+Tab returns to the summary; Enter collapses the panel again.
  await page.keyboard.press("Shift+Tab");
  const backOnSummary = await readFocusStop(page);
  expect(backOnSummary.slot).toBe("advanced-assumptions-label");
  await page.keyboard.press("Enter");
  await expect(moe).toBeHidden();
});

test("relocated VRAM guide opens and closes from its summary key", async ({
  page,
}) => {
  await page.goto("/");
  const summary = page.getByText("How VRAM is calculated", { exact: true });
  const panel = page.locator("details.panel", { has: summary });

  await expect(panel).not.toHaveAttribute("open", "");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(panel).not.toHaveAttribute("open", "");
});

test("a preset chip loads its model when activated with Enter", async ({
  page,
}) => {
  await page.goto("/");
  const totalParameters = page.getByLabel("Total Model Parameters", {
    exact: true,
  });
  await expect(totalParameters).toHaveValue("7");

  await tabUntil(
    page,
    (stop) => stop.preset === "llama-70b",
    "the Llama 70B preset chip",
  );
  await page.keyboard.press("Enter");
  await expect(totalParameters).toHaveValue("70");
});
