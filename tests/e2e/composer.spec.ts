import { test, expect } from "@playwright/test";
for (const locale of ["en", "ja"] as const) {
  test(`${locale}: four composer controls, popup editing and keyboard dismissal`, async ({
    page,
  }) => {
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
    const trigger = page.getByRole("button", {
      name: locale === "en" ? "AI settings" : "AI設定",
      exact: true,
    });
    const input = page.locator(".composer textarea");
    await input.fill("Keep this draft");
    await expect(
      page.locator(".composer-toolbar button, .composer-toolbar select"),
    ).toHaveCount(4);
    await expect(page.locator(".composer > .execution-controls")).toHaveCount(
      0,
    );
    await trigger.focus();
    await trigger.press("Enter");
    const popup = page.getByRole("dialog", {
      name: locale === "en" ? "AI settings" : "AI設定",
    });
    await expect(popup).toBeVisible();
    await popup
      .getByRole("combobox", {
        name: locale === "en" ? "CLI type" : "CLIの種類",
      })
      .selectOption("claude");
    await popup.getByRole("switch").check();
    await expect(
      popup.getByRole("combobox", {
        name: locale === "en" ? "Model" : "モデル",
        exact: true,
      }),
    ).toBeVisible();
    await popup.press("Escape");
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(input).toHaveValue("Keep this draft");
    await expect(page.locator(".user-turn")).toHaveCount(0);
    await trigger.click();
    await expect(
      popup.getByRole("combobox", {
        name: locale === "en" ? "CLI type" : "CLIの種類",
      }),
    ).toHaveValue("claude");
    await expect(popup.getByRole("switch")).toBeChecked();
    await page
      .getByRole("button", {
        name: locale === "en" ? "Stickers" : "ステッカー",
        exact: true,
      })
      .click();
    await expect(popup).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.getByRole("dialog").press("Escape");
    await trigger.click();
    await page
      .locator(".workspace-header")
      .click({ position: { x: 10, y: 10 } });
    await expect(popup).toHaveCount(0);
    await expect(input).toHaveValue("Keep this draft");
    await page.reload();
    await trigger.click();
    await expect(popup.getByRole("switch")).toBeChecked();
    await expect(
      popup.getByRole("combobox", {
        name: locale === "en" ? "CLI type" : "CLIの種類",
      }),
    ).toHaveValue("claude");
  });
  test(`${locale}: compact toolbar and popup fit all supported widths`, async ({
    page,
  }, info) => {
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
    for (const width of [960, 1440, 1728]) {
      await page.setViewportSize({ width, height: 900 });
      await page
        .getByRole("button", {
          name: locale === "en" ? "AI settings" : "AI設定",
          exact: true,
        })
        .click();
      const popup = page.getByRole("dialog");
      await expect(popup).toBeVisible();
      const box = await popup.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(900);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .locator(".composer-toolbar")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`composer-${locale}-${width}.png`),
        animations: "disabled",
      });
      await popup.press("Escape");
      for (const control of await page
        .locator(".composer-toolbar button, .composer-toolbar select")
        .all()) {
        expect(
          await control.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(
              r.x + r.width / 2,
              r.y + r.height / 2,
            );
            return hit === el || el.contains(hit);
          }),
        ).toBe(true);
      }
    }
  });
}
