import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SafeMarkdown } from "./SafeMarkdown";
it("repository markup cannot load remote images, scripts or unsafe links", () => {
  const html = renderToStaticMarkup(
    <SafeMarkdown>{`<script>alert(1)</script>\n\n<svg onload="alert(1)"></svg>\n\n![tracking](https://example.invalid/beacon)\n\n[attack](javascript:alert%281%29)\n\n[safe](https://example.com/docs)`}</SafeMarkdown>,
  );
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<svg");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("javascript:");
  expect(html).toContain('href="https://example.com/docs"');
  expect(html).toContain('rel="noopener noreferrer"');
});
