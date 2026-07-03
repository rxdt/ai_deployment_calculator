import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

const pages = ["/"];

for (const path of pages) {
  test(`no horizontal overflow: ${path}`, async ({ page }) => {
    await page.goto(path);

    const result = await page.evaluate(() => {
      const offenders = [...document.body.querySelectorAll("*")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            cssClass: element.getAttribute("class") ?? "",
            left: rect.left,
            right: rect.right,
            width: rect.width,
          };
        })
        .filter(
          (entry) =>
            entry.width > 0 &&
            (entry.left < -1 || entry.right > window.innerWidth + 1),
        )
        .slice(0, 20);

      return {
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        offenders,
      };
    });

    expect(
      result.scrollWidth,
      JSON.stringify(result.offenders, null, 2),
    ).toBeLessThanOrEqual(result.viewport + 1);
  });

  test(`minimum touch targets: ${path}`, async ({ page }) => {
    await page.goto(path);

    const badTargets = await page.evaluate(() => {
      const selector =
        "button,a,input,select,textarea,summary,[role='button'],[tabindex]";
      return [...document.querySelectorAll(selector)]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            rect.width > 0 &&
            rect.height > 0
          );
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            text: element.textContent.trim().slice(0, 80),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .filter((entry) => entry.width < 40 || entry.height < 40);
    });

    expect(badTargets).toEqual([]);
  });

  test(`minimum readable text: ${path}`, async ({ page }) => {
    await page.goto(path);

    const tinyText = await page.evaluate(() => {
      return [...document.body.querySelectorAll("*")]
        .filter((element) => {
          const text = element.textContent.trim();
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return (
            text !== "" &&
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
          );
        })
        .map((element) => ({
          tag: element.tagName,
          cssClass: element.getAttribute("class") ?? "",
          text: element.textContent.trim().slice(0, 80),
          fontSize: Number(
            getComputedStyle(element).fontSize.replaceAll("px", ""),
          ),
        }))
        .filter((entry) => entry.fontSize < 13)
        .slice(0, 30);
    });

    expect(tinyText).toEqual([]);
  });
}

test("axe accessibility scan", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
