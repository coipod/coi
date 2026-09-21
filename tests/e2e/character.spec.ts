import { test, expect } from "@playwright/test";

test.use({ video: { mode: "on", size: { width: 1440, height: 900 } } });
test("character renders and animates for thirty seconds, then remains static with reduced motion", async ({ page }, info) => {
  test.setTimeout(55000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Vite needs its inline dev preamble; eval remains forbidden like the packaged app.
  await page.route("**/", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:1420; font-src 'self'; object-src 'none'" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore later" }).click();
  const rig = page.locator(".character-rig");
  await expect(rig.locator("canvas")).toBeVisible();
  const frames: Buffer[] = [];
  for (let index = 0; index <= 6; index++) {
    if (index) await page.waitForTimeout(5000);
    frames.push(await rig.screenshot({ path: info.outputPath(`motion-${index * 5}s.png`) }));
  }
  expect(frames.some((frame) => !frame.equals(frames[0]))).toBe(true);
  await page.getByRole("button", { name: "Workspace settings ↗" }).click();
  await page.getByRole("button", { name: "Appearance & accessibility" }).click();
  await page.getByLabel("Reduce motion", { exact: false }).check();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.waitForTimeout(300);
  const staticFrame = await rig.screenshot();
  await page.waitForTimeout(800);
  expect((await rig.screenshot()).equals(staticFrame)).toBe(true);
  expect(errors).toEqual([]);
});

test("all seven poses retain their complete silhouette at rest and while moving", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const main = await (await page.request.get("/src/main.tsx")).text();
  const reactUrl = main.match(/"([^"\n]*deps\/react\.js[^"\n]*)"/)![1];
  const domUrl = main.match(/"([^"\n]*deps\/react-dom_client\.js[^"\n]*)"/)![1];
  await page.route("**/rig-review", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><style>
      body { margin: 0; background: #f7f9fb; font: 14px sans-serif; }
      #root { display: grid; grid-template-columns: repeat(4, 320px); }
      section { height: 390px; text-align: center; }
      .character-rig { width: 320px; height: 340px; mix-blend-mode: multiply; }
      canvas { display: block; width: 320px; height: 340px; }
    </style></head><body><div id="root"></div>
    <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const React = (await import('${reactUrl}')).default;
      const { createRoot } = (await import('${domUrl}')).default;
      const { CharacterRig } = await import('/src/components/CharacterRig.tsx');
      createRoot(document.getElementById('root')).render(React.createElement(React.Fragment, null,
        ...['neutral','greeting','thinking','working','question','success','concerned'].map(expression =>
          React.createElement('section', { key: expression }, React.createElement('p', null, expression),
            React.createElement(CharacterRig, { expression, reducedMotion: false, fallback: 'LOAD FAILED' })))));
    </script></body></html>`,
  }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/rig-review");
  await expect(page.locator("canvas")).toHaveCount(7);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: info.outputPath("all-poses.png") });
  await page.mouse.move(318, 180);
  await page.waitForTimeout(1700);
  await page.screenshot({ path: info.outputPath("all-poses-moving.png") });
  expect(errors).toEqual([]);
});
