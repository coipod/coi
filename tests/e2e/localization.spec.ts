import { test, expect } from "@playwright/test";
for (const locale of ["en", "ja"] as const) {
  test(`${locale}: onboarding, settings and stickers have no Korean UI`, async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const language = page.getByRole("combobox", { name: "Language", exact: true });
    await expect(language.locator("option")).toHaveText(["English", "日本語"]);
    await language.selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    expect(await page.locator("body").innerText()).not.toMatch(/[가-힣]/);
    await page.getByRole("button", { name: locale === "en" ? "Explore later" : "あとで見る", exact: true }).click();
    await page.getByRole("button", { name: locale === "en" ? "Stickers" : "ステッカー", exact: true }).click();
    await expect(page.locator(".sticker-grid button")).toHaveCount(6);
    expect(await page.getByRole("dialog").innerText()).not.toMatch(/[가-힣]/);
    await page.locator(".sticker-grid button").first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const draft = await page.locator("textarea").inputValue();
    expect(draft).not.toMatch(/[가-힣]/);
    expect(draft).toContain(locale === "en" ? "Explain the current work" : "現在の作業");
    await page.getByRole("button", { name: locale === "en" ? "Workspace settings" : "作業室の設定", exact: false }).click();
    for (const name of locale === "en" ? ["Appearance & accessibility", "Local storage & recovery", "About COI", "AI engines"] : ["表示とアクセシビリティ", "ローカル保存と復元", "COIについて", "AIエンジン"]) {
      await page.getByRole("button", { name, exact: true }).click();
      expect(await page.getByRole("dialog").innerText()).not.toMatch(/[가-힣]/);
    }
    await page.getByRole("button", { name: locale === "en" ? "Appearance & accessibility" : "表示とアクセシビリティ", exact: true }).click();
    const other = locale === "en" ? "ja" : "en";
    await page.getByRole("combobox", { name: locale === "en" ? "Language" : "表示言語", exact: true }).selectOption(other);
    await expect(page.locator("html")).toHaveAttribute("lang", other);
    await page.getByRole("dialog").press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("textarea")).toHaveValue(draft);
    await expect(page.locator(".sticker-draft img")).toHaveCount(1);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", other);
    expect(await page.locator("body").innerText()).not.toMatch(/[가-힣]/);
  });
}
test("unsupported stored locale falls back to English and user Korean stays intact", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("coi.locale", "ko"));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Explore later" }).click();
  await page.locator("textarea").fill("사용자가 작성한 한국어는 보존");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".user-turn p")).toHaveText("사용자가 작성한 한국어는 보존");
  await page.getByRole("button", { name: "Stop task" }).click();
  await page.reload();
  await expect(page.locator(".user-turn p")).toHaveText("사용자가 작성한 한국어는 보존");
});
for (const locale of ["en", "ja"] as const) {
  test(`${locale}: responsive onboarding and workspace`, async ({ page }, info) => {
    await page.goto("/");
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption(locale);
    for (const width of [960, 1440, 1728]) {
      await page.setViewportSize({ width, height: width === 960 ? 640 : 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ animations: "disabled", path: info.outputPath(`${locale}-onboarding-${width}.png`) });
    }
    await page.getByRole("button", { name: locale === "en" ? "Explore later" : "あとで見る", exact: true }).click();
    for (const width of [960, 1440, 1728]) {
      await page.setViewportSize({ width, height: width === 960 ? 640 : 1000 });
      if (width >= 1280) await expect.poll(async () => (await page.locator(".context-panel").boundingBox())?.width ?? 0).toBeGreaterThan(380);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ animations: "disabled", path: info.outputPath(`${locale}-workspace-${width}.png`) });
    }
  });
}
