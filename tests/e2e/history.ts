import type { Page } from "@playwright/test";
import { emptyRun } from "../../packages/protocol/src/index";
// Saved history fixture, never exposed as an executable app mode.
export async function saveHistory(
  page: Page,
  text: string,
  stickerId = "explain",
) {
  await page.evaluate(
    ({ text, stickerId, run }) => {
      const key = "coi.snapshot.v1";
      const data = JSON.parse(localStorage.getItem(key)!);
      const session = data.sessions.find(
        (s: { id: string }) => s.id === data.activeId,
      );
      session.title = text.slice(0, 30);
      session.messages = [
        {
          id: "fixture-message",
          role: "user",
          text,
          stickerId,
          runId: run.runId,
        },
      ];
      session.runs = [
        {
          ...run,
          sessionId: session.id,
          status: "cancelled",
          text: "Saved response for layout verification.",
        },
      ];
      localStorage.setItem(key, JSON.stringify(data));
    },
    { text, stickerId, run: emptyRun("history-fixture", "fixture") },
  );
  await page.reload();
}
