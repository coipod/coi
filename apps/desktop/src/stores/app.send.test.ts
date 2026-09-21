import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultExecution } from "../lib/execution";
const mocks = vi.hoisted(() => ({
  startRun: vi.fn(),
  runEvents: vi.fn(() => new Promise(() => {})),
}));
vi.mock("../lib/bridge", () => ({ native: true, bridge: mocks }));
import { useApp, type Session } from "./app";
function session(): Session {
  return {
    id: "test-session",
    projectId: "test-project",
    title: "test",
    createdAt: "2026-09-20",
    messages: [],
    runs: [],
    demoApplied: false,
    demoDeclined: false,
    execution: { ...defaultExecution, model: "test-model", effort: "low" },
  };
}
beforeEach(() => {
  mocks.startRun.mockReset();
  useApp.setState({
    ready: false,
    sessions: [session()],
    activeId: "test-session",
    activeRunId: null,
    persistError: null,
    toast: null,
  });
});
describe("native sticker submission", () => {
  it("sends only final text to the CLI and keeps sticker metadata in the message", async () => {
    mocks.startRun.mockResolvedValue({ id: "run-1", taskCopyId: "copy-1" });
    expect(await useApp.getState().send("edited request", "check")).toBe(true);
    expect(mocks.startRun).toHaveBeenCalledWith(
      expect.not.objectContaining({ stickerId: expect.anything() }),
      "edited request",
    );
    expect(useApp.getState().sessions[0].messages[0]).toMatchObject({
      text: "edited request",
      stickerId: "check",
      runId: "run-1",
    });
  });
  it.each(["user_cancelled", "provider_unavailable"])(
    "returns unaccepted on %s and removes the temporary message",
    async (reason) => {
      mocks.startRun.mockRejectedValue(new Error(reason));
      expect(await useApp.getState().send("keep this draft", "fix")).toBe(
        false,
      );
      expect(useApp.getState().sessions[0].messages).toEqual([]);
      expect(useApp.getState().activeRunId).toBeNull();
    },
  );
  it("freezes submitted settings and sticker while retaining next-request changes", async () => {
    let accept!: (value: unknown) => void;
    mocks.startRun.mockImplementation(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    const sending = useApp.getState().send("first request", "create");
    await vi.waitFor(() => expect(mocks.startRun).toHaveBeenCalled());
    useApp.getState().updateExecution({ model: "next-model", effort: "high" });
    expect(await useApp.getState().send("second request", "find")).toBe(false);
    accept({ id: "run-2", taskCopyId: "copy-2" });
    expect(await sending).toBe(true);
    expect(mocks.startRun.mock.calls[0][0]).toMatchObject({
      model: "test-model",
      effort: "low",
    });
    expect(useApp.getState().sessions[0].execution?.model).toBe("next-model");
    expect(useApp.getState().sessions[0].messages[0].stickerId).toBe("create");
  });
});
