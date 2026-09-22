import { saveHistory } from "./history";
import { test, expect, type Page } from "@playwright/test";
import { stickers } from "../../apps/desktop/src/lib/stickers";
async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore later" }).click();
}
async function choose(page: Page, label: string) {
  await page.getByRole("button", { name: "Stickers", exact: true }).click();
  await page.getByRole("button", { name: `${label} sticker`, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "COI stickers" })).toHaveCount(0);
}
test("six editable sticker requests preserve text and never auto-send", async ({ page }) => {
  await open(page);
  const input = page.getByRole("textbox", { name: "Request for COI" });
  await input.fill("내가 작성한 요청");
  await input.press("End");
  for (const sticker of stickers) {
    await choose(page, sticker.label);
    expect(await input.inputValue()).toContain(sticker.prompt);
    expect(await input.inputValue()).toContain("내가 작성한 요청");
    await expect(page.locator(".sticker-draft img")).toHaveAttribute("src", `/coi/sd/${sticker.id}.png`);
    await expect(page.locator(".user-turn")).toHaveCount(0);
    await expect(input).toBeFocused();
  }
  const text = await input.inputValue();
  await page.getByRole("button", { name: "Remove sticker" }).click();
  await expect(input).toHaveValue(text);
  await expect(page.locator(".sticker-draft")).toHaveCount(0);
});
test("missing project retains the edited request and sticker without executing", async ({ page }) => {
  await open(page);
  await choose(page, "Check");
  const input = page.getByRole("textbox", { name: "Request for COI" });
  await input.fill("Edited request");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(input).toHaveValue("Edited request");
  await expect(page.locator(".sticker-draft img")).toHaveAttribute("src", "/coi/sd/check.png");
  await expect(page.locator(".user-turn")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Open a project folder");
});
test("keyboard dismissal returns focus, selection inserts at cursor without replacing text", async ({ page }) => {
  await open(page);
  const trigger = page.getByRole("button", { name: "Stickers", exact: true });
  await trigger.focus(); await trigger.press("Enter");
  await page.getByRole("dialog").press("Escape");
  await expect(trigger).toBeFocused();
  const input = page.getByRole("textbox", { name: "Request for COI" });
  await input.fill("앞뒤"); await input.press("Home"); await input.press("ArrowRight");
  await trigger.click();
  await page.getByRole("button", { name: "Explain sticker", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue(`앞\n${stickers[0].prompt}\n뒤`);
});
test("unknown and failed sticker assets preserve the message", async ({ page }) => {
  await open(page);
  await saveHistory(page, stickers[0].prompt);
  await page.route("**/coi/sd/explain.png", (route) => route.abort());
  await page.reload();
  await expect(page.locator(".user-turn p")).toHaveText(stickers[0].prompt);
  await expect(page.locator(".user-turn img")).toHaveCount(0);
  await page.evaluate(() => {
    const key = "coi.snapshot.v1"; const data = JSON.parse(localStorage.getItem(key)!);
    data.sessions.find((s: {id: string}) => s.id === data.activeId).messages[0].stickerId = "future-sticker";
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  await expect(page.locator(".user-turn p")).toHaveText(stickers[0].prompt);
});
for (const width of [960, 1440, 1728]) {
  test(`chat alignment and sticker panel at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 960 ? 640 : 1000 });
    await open(page);
    if (width === 960) await page.getByRole("button", { name: "Close context panel" }).click();
    await page.getByRole("button", { name: "Stickers", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "COI stickers" });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: info.outputPath(`stickers-${width}.png`) });
    await page.getByRole("button", { name: "Find issues sticker", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const input = page.getByRole("textbox", { name: "Request for COI" });
    await input.fill("긴 요청 ".repeat(25) + "\n```ts\nconst answer = 42;\n```");
    await saveHistory(page, await input.inputValue(), "find");
    const avatarUser = await page.locator(".user-avatar").boundingBox();
    const avatarCoi = await page.locator(".assistant-turn .message-avatar").boundingBox();
    expect(avatarUser!.x).toBeGreaterThan(avatarCoi!.x + 100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`chat-${width}.png`) });
  });
}
test("OS reduced motion disables UI animation and panel focus remains usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await choose(page, "Create");
  await saveHistory(page, "Saved request", "create");
  expect(await page.locator(".user-turn").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
  await page.getByRole("button", { name: "Close context panel" }).click();
  await expect(page.locator(".context-panel")).toHaveAttribute("inert", "");
  await page.getByRole("button", { name: /^COI ·/ }).click();
  await expect(page.getByRole("button", { name: "Close context panel" })).toBeVisible();
});
test("failed project start retains the edited draft and selected sticker", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("coi.snapshot.v1")!);
    state.projects = [{ id: "fixture", name: "fixture", root: "/fixture" }];
    state.sessions[0].projectId = "fixture";
    state.activeId = state.sessions[0].id;
    localStorage.setItem("coi.snapshot.v1", JSON.stringify(state));
  });
  await page.reload();
  await choose(page, "Fix it");
  const input = page.getByRole("textbox", { name: "Request for COI" });
  await input.fill("수정한 초안 보존");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("status")).toContainText("Real CLI execution is unavailable");
  await expect(input).toHaveValue("수정한 초안 보존");
  await expect(page.locator(".sticker-draft img")).toHaveAttribute("src", "/coi/sd/fix.png");
  await expect(page.locator(".user-turn")).toHaveCount(0);
});
