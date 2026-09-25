import { test, expect } from "@playwright/test";
for (const locale of ["en", "ja"] as const) {
  test(`launch screenshots ${locale} contain only current UI`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page
      .getByRole("combobox", { name: "Language", exact: true })
      .selectOption(locale);
    await page
      .getByRole("button", {
        name: locale === "en" ? "Explore later" : "あとで見る",
        exact: true,
      })
      .click();
    await expect(page.locator(".character-rig canvas")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /demo|simulated|[가-힣]/i,
    );
    await page.screenshot({
      path: info.outputPath(`${locale}-workspace.png`),
      animations: "disabled",
    });
    await page
      .getByRole("button", {
        name: locale === "en" ? "Stickers" : "ステッカー",
        exact: true,
      })
      .click();
    await expect(page.locator(".sticker-grid button")).toHaveCount(6);
    await page.screenshot({
      path: info.outputPath(`${locale}-stickers.png`),
      animations: "disabled",
    });
    await page.locator(".sticker-grid button").first().click();
    await expect(page.locator(".sticker-draft img")).toBeVisible();
    await expect(page.locator(".user-turn")).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`${locale}-draft.png`),
      animations: "disabled",
    });
  });
}
