import { afterEach, beforeEach, expect, it, vi } from "vitest";
const bridge = vi.hoisted(() => ({
  save: vi.fn(async (_data: string) => {}),
  startRun: vi.fn(),
  runEvents: vi.fn(),
}));
vi.mock("../lib/bridge", () => ({ native: true, bridge }));
import { useApp } from "./app";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useApp.setState({ ready: false, activeRunId: null, persistError: null });
  useApp.getState().newSession();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
it("rejects requests without a project without fabricating messages or events", async () => {
  const before = useApp.getState().sessions;
  expect(await useApp.getState().send("Explain this", "explain")).toBe(false);
  expect(useApp.getState().sessions).toBe(before);
  expect(useApp.getState().activeRunId).toBeNull();
  expect(bridge.startRun).not.toHaveBeenCalled();
});
it("a failed real start does not fall back to simulated execution", async () => {
  useApp.getState().newSession("project");
  bridge.startRun.mockRejectedValue(new Error("CLI unavailable"));
  expect(await useApp.getState().send("Fix it", "fix")).toBe(false);
  const session = useApp.getState().sessions[0];
  expect(session.messages).toEqual([]);
  expect(session.runs).toEqual([]);
  expect(useApp.getState().activeRunId).toBeNull();
  expect(useApp.getState().toast).toContain("CLI unavailable");
});
it("real execution receives only request text and keeps sticker metadata in the conversation", async () => {
  useApp.getState().newSession("project");
  bridge.startRun.mockResolvedValue({ id: "real-run", taskCopyId: "copy" });
  bridge.runEvents.mockReturnValue(new Promise(() => {}));
  expect(await useApp.getState().send("My edited request", "check")).toBe(true);
  expect(bridge.startRun).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: "project" }),
    "My edited request",
  );
  expect(useApp.getState().sessions[0].messages[0]).toMatchObject({
    text: "My edited request",
    stickerId: "check",
    runId: "real-run",
  });
  expect(useApp.getState().sessions[0].runs[0].events).toEqual([]);
});
