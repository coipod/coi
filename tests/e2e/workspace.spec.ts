import { saveHistory } from "./history";
import { test, expect, type Page } from "@playwright/test";
test("artifact tab survives Companion and Focus transitions", async ({page}) => {
  await skip(page);
  await page.getByRole("button", {name: "Artifacts", exact: true}).click();
  await page.getByRole("tab", {name: "Preview", exact: true}).click();
  await page.getByRole("button", {name: "COI", exact: true}).click();
  await expect(page.getByRole("tab", {name: "Preview", exact: true})).toHaveCount(0);
  await page.getByRole("button", {name: "Artifacts", exact: true}).click();
  await expect(page.getByRole("tab", {name: "Preview", exact: true})).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", {name: "Close context panel"}).click();
  await page.getByRole("button", {name: "COI · Here with you"}).click();
  await page.getByRole("button", {name: "Artifacts", exact: true}).click();
  await expect(page.getByRole("tab", {name: "Preview", exact: true})).toHaveAttribute("aria-selected", "true");
});
test("dialog errors remain visible inside the native modal layer", async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {value: {writeText: async () => {throw new Error("Denied");}}, configurable: true});
  });
  await skip(page);
  await page.getByRole("button", {name: "Workspace settings ↗"}).click();
  await page.getByRole("button", {name: "Setup guide", exact: true}).first().click();
  const dialog = page.locator("dialog").last();
  await dialog.locator("summary").filter({hasText: "Manual installation"}).click();
  await dialog.getByRole("button", {name: "Copy install command"}).click();
  await expect(dialog.getByRole("status")).toContainText("Clipboard access is unavailable");
  await dialog.getByRole("button", {name: "Dismiss notification"}).click();
  await expect(dialog.getByRole("status")).toHaveCount(0);
});
async function skip(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore later" }).click();
}
async function focus(page: Page) {
  await page.getByRole("button", { name: "Close context panel" }).click();
}
test("skip, resume and checkpoint survive restart", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hi, COI" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Let's check the tools/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore later" }).click();
  await page
    .getByRole("button", { name: "Our first meeting Continue where you left off" })
    .click();
  await expect(
    page.getByRole("heading", { name: /Let's check the tools/ }),
  ).toBeVisible();
});
test("keyboard palette and focus keep core workflow accessible", async ({
  page,
}) => {
  await skip(page);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await focus(page);
  await expect(
    page.getByRole("button", { name: "COI · Here with you" }),
  ).toBeVisible();
  await page.getByLabel("Request for COI").fill("키보드로 시작");
  await page.getByLabel("Request for COI").press("Enter");
  await expect(page.getByRole("status")).toContainText("Open a project folder");
  await expect(page.getByLabel("Request for COI")).toHaveValue("키보드로 시작");
});
for (const size of [
  { width: 960, height: 640 },
  { width: 1440, height: 900 },
  { width: 1728, height: 1117 },
])
  test(`layout ${size.width} × ${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await skip(page);
    if (size.width < 1280) await focus(page);
    await expect(page.getByLabel("Request for COI")).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Workspace settings ↗" }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (size.width >= 1280) {
      await expect(page.locator(".character-rig canvas")).toBeVisible();
    }
    await page.screenshot({ path: `test-results/workspace-${size.width}.png` });
  });

test("unknown snapshot version is preserved instead of overwritten", async ({ page }) => {
  await page.goto("/");
  const future = JSON.stringify({version:99, sessions:[], projects:[], marker:"preserve-me"});
  await page.evaluate(raw => localStorage.setItem("coi.snapshot.v1",raw),future);
  await page.reload();
  await expect(page.getByText("Saved work could not be read. Existing data was preserved and a fresh screen was opened.")).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem("coi.snapshot.v1"))).toBe(future);
});

test("session removal requires an explicit second action and persists", async ({page}) => {
  await skip(page);
  await saveHistory(page, "삭제할 테스트 이야기");
  await page.getByRole("button",{name:"Workspace settings ↗"}).click();
  await page.getByRole("button",{name:"Local storage & recovery"}).click();
  await page.getByRole("button",{name:"Delete conversation",exact:true}).click();
  await expect(page.getByRole("button",{name:"Confirm permanent deletion"})).toBeVisible();
  await expect(page.getByText("삭제할 테스트 이야기",{exact:true}).last()).toBeVisible();
  await page.getByRole("button",{name:"Confirm permanent deletion"}).click();
  await page.reload();
  await expect(page.getByRole("button",{name:"삭제할 테스트 이야기",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"New conversation",exact:true})).toBeVisible();
});

test("blocked project execution preserves prompt and never starts Demo", async ({page}) => {
  await skip(page);
  await page.evaluate(() => {
    const state=JSON.parse(localStorage.getItem("coi.snapshot.v1")!);
    state.projects=[{id:"project-fixture",name:"fixture",root:"/fixture"}];
    state.sessions[0].projectId="project-fixture";
    state.activeId=state.sessions[0].id;
    localStorage.setItem("coi.snapshot.v1",JSON.stringify(state));
  });
  await page.reload();
  const prompt=page.getByRole("textbox",{name:"Request for COI"});
  await prompt.fill("실제 프로젝트의 README를 확인해줘");
  await prompt.press("Enter");
  await expect(page.getByRole("status")).toContainText("Real CLI execution is unavailable in the browser");
  await expect(prompt).toHaveValue("실제 프로젝트의 README를 확인해줘");
  await expect(page.getByRole("button",{name:"Stop task"})).toHaveCount(0);
});
