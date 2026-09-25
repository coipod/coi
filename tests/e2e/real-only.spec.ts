import { test, expect } from "@playwright/test";
import { saveHistory } from "./history";

test("onboarding ends at project setup, never starts a simulated task", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hi, COI" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "I understand" }).click();
  await expect(page.locator("body")).not.toContainText(/demo|simulated/i);
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("desktop app");
  await expect(page.locator(".user-turn")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stop task" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".welcome")).toContainText("Open a project folder");
  await expect(page.locator("body")).not.toContainText(/demo|simulated/i);
});

test("legacy history survives restart and retry cannot create a simulated run", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore later" }).click();
  await saveHistory(page, "Retained historical request", "check");
  await expect(page.locator(".sent-sticker")).toHaveAttribute(
    "src",
    "/coi/sd/check.png",
  );
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Open a project folder");
  await expect(page.locator(".user-turn")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".user-turn")).toHaveCount(1);
  await expect(page.locator(".user-turn p")).toHaveText(
    "Retained historical request",
  );
});
