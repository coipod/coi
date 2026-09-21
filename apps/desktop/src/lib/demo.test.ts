import { describe, it, expect, vi, afterEach } from "vitest";
import { DemoAdapter } from "./demo";
import { type CoiEvent } from "@coi/protocol";
afterEach(() => vi.useRealTimers());
describe("Demo adapter contract", () => {
  it("runs explicit approval, evidence and one terminal event", async () => {
    vi.useFakeTimers();
    const adapter = new DemoAdapter(),
      events: CoiEvent[] = [];
    const started = adapter.start(
      { runId: "r", sessionId: "s", prompt: "hello", mode: "review_copy" },
      (e) => events.push(e),
    );
    await vi.runAllTimersAsync();
    await started;
    const approval = events.find((e) => e.kind === "approval_requested");
    if (approval?.kind !== "approval_requested") throw new Error("no approval");
    const pending = adapter.resolveApproval(
      "r",
      approval.payload.ref,
      "allow_once",
    );
    await expect(
      adapter.resolveApproval("r", approval.payload.ref, "allow_once"),
    ).rejects.toThrow();
    await vi.runAllTimersAsync();
    await pending;
    expect(events.filter((e) => e.kind === "run_finished")).toHaveLength(1);
    expect(
      events.some(
        (e) =>
          e.kind === "verification_changed" && e.payload.status === "passed",
      ),
    ).toBe(true);
    expect(events.every((e) => e.origin === "demo")).toBe(true);
  });
  it("cancel prevents late artifacts and a second terminal", async () => {
    vi.useFakeTimers();
    const a = new DemoAdapter(),
      events: CoiEvent[] = [];
    const started = a.start(
      { runId: "r", sessionId: "s", prompt: "x", mode: "review_copy" },
      (e) => events.push(e),
    );
    await a.cancel("r");
    await vi.runAllTimersAsync();
    await started;
    await a.cancel("r");
    expect(events.filter((e) => e.kind === "run_finished")).toHaveLength(1);
    expect(events.some((e) => e.kind === "artifact_created")).toBe(false);
  });
  it("plan mode never edits or invents verification", async () => {
    vi.useFakeTimers();
    const a = new DemoAdapter(),
      events: CoiEvent[] = [];
    const started = a.start(
      { runId: "r", sessionId: "s", prompt: "x", mode: "plan" },
      (e) => events.push(e),
    );
    await vi.runAllTimersAsync();
    await started;
    expect(
      events.some(
        (e) =>
          e.kind === "approval_requested" ||
          e.kind === "artifact_created" ||
          e.kind === "verification_changed",
      ),
    ).toBe(false);
  });
});
