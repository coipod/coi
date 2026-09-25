import { test, expect } from "@playwright/test";
for (const locale of ["en", "ja"] as const) {
  test(`${locale}: COI dialogue reveals progressively and show-all finishes immediately`, async ({
    page,
  }) => {
    await page.clock.install();
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
    const dialogue = page.locator(".dialogue p");
    await expect(dialogue).toBeVisible();
    const full = await dialogue.getAttribute("aria-label");
    await page.clock.runFor(120);
    const partial = await dialogue.locator("span").innerText();
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(full!.length);
    await page
      .locator(".dialogue")
      .getByRole("button", {
        name: locale === "en" ? "Show immediately" : "すぐに表示",
      })
      .click();
    await expect(dialogue.locator("span")).toHaveText(full!);
    await page.clock.runFor(2000);
    await expect(dialogue.locator("span")).toHaveText(full!);
  });
}
test("OS reduced motion exposes the entire dialogue without a reveal loop", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore later" }).click();
  const dialogue = page.locator(".dialogue p");
  await expect(dialogue).toBeVisible();
  await expect(dialogue.locator("span")).toHaveText(
    (await dialogue.getAttribute("aria-label"))!,
  );
  await expect(page.locator(".dialogue button")).toHaveCount(0);
});
