import { describe, it, expect } from "vitest";
import {
  emptyRun,
  eventSchema,
  reduceEvent,
  expressionFor,
  redact,
  type CoiEvent,
} from "./index";
const e = (kind: CoiEvent["kind"], payload: unknown, seq = 1) => ({
  schemaVersion: 1,
  id: `e${seq}`,
  sessionId: "s",
  runId: "r",
  seq,
  timestamp: "2026-09-16T00:00:00Z",
  provider: "demo",
  origin: "demo",
  kind,
  payload,
});
describe("closed event contract and lifecycle", () => {
  it("refuses unverifiable success", () => {
    expect(() =>
      eventSchema.parse(
        e("verification_changed", {
          status: "passed",
          checkId: "a",
          artifactHash: "x",
          evidenceRef: "ref",
          summary: "ok",
        }),
      ),
    ).toThrow();
  });
  it("ignores duplicate, out-of-order and foreign events", () => {
    const first = reduceEvent(
      emptyRun("r", "s"),
      e("assistant_delta", { messageId: "m", text: "a" }, 2),
    );
    expect(
      reduceEvent(
        first,
        e("assistant_delta", { messageId: "m", text: "a" }, 2),
      ),
    ).toBe(first);
    expect(
      reduceEvent(
        first,
        e("assistant_delta", { messageId: "m", text: "late" }, 1),
      ),
    ).toBe(first);
    expect(
      reduceEvent(first, {
        ...e("assistant_delta", { messageId: "m", text: "b" }, 3),
        runId: "other",
      }),
    ).toBe(first);
  });
  it("a completed run is not a successful test", () => {
    const r = reduceEvent(
      emptyRun("r", "s"),
      e("run_finished", {
        status: "completed",
        reasonCode: "done",
        verification: "passed",
        pendingArtifacts: [],
      }),
    );
    expect(r.verification).toBe("not_run");
    expect(expressionFor(r)).toBe("neutral");
    expect(
      reduceEvent(r, e("assistant_delta", { messageId: "m", text: "late" }, 2)),
    ).toBe(r);
  });
  it("failure survives completion and pending approvals expire", () => {
    let r = reduceEvent(
      emptyRun("r", "s"),
      e("verification_changed", {
        status: "failed",
        checkId: "a",
        artifactHash: "x",
        evidenceRef: "ref",
        summary: "failure",
      }),
    );
    r = reduceEvent(
      r,
      e(
        "approval_requested",
        {
          ref: {
            approvalId: "a",
            providerRequestId: "p",
            threadId: "t",
            turnId: "u",
          },
          scope: "copy",
          risk: "L1",
          decisions: ["deny"],
          description: "test",
        },
        2,
      ),
    );
    expect(expressionFor(r)).toBe("question");
    r = reduceEvent(
      r,
      e(
        "run_finished",
        {
          status: "completed",
          reasonCode: "done",
          verification: "passed",
          pendingArtifacts: [],
        },
        3,
      ),
    );
    expect(r.pending).toHaveLength(0);
    expect(expressionFor(r)).toBe("concerned");
  });
  it("editing invalidates previous verification", () => {
    let r = reduceEvent(
      emptyRun("r", "s"),
      e("verification_changed", {
        status: "passed",
        checkId: "a",
        artifactHash: "x",
        evidenceRef: "ref",
        command: "test",
        exitCode: 0,
        summary: "success",
      }),
    );
    r = reduceEvent(
      r,
      e(
        "activity",
        {
          activityId: "edit",
          phase: "started",
          type: "editing",
          target: "a.ts",
        },
        2,
      ),
    );
    expect(r.verification).toBe("not_run");
  });
  it("rejects wrong origin and open payloads", () => {
    expect(() =>
      eventSchema.parse({
        ...e("assistant_delta", { messageId: "m", text: "t" }),
        origin: "live",
      }),
    ).toThrow();
    expect(() =>
      eventSchema.parse(
        e("assistant_delta", { messageId: "m", text: "t", apiKey: "secret" }),
      ),
    ).toThrow();
  });
  it("redacts common credentials and control sequences", () => {
    const out = redact(
      "\x1b[31mapi_key=secret-value sk-1234567890123 https://x.test/?token=abc",
    );
    expect(out).not.toContain("secret-value");
    expect(out).not.toContain("sk-");
    expect(out).not.toContain("token=abc");
    expect(out).not.toContain("\x1b");
  });
});
import fixtures from "../../../tests/fixtures/events.json";
it("matches the same golden envelopes used by the Rust decoder", () => {
  for (const e of fixtures) expect(eventSchema.parse(e)).toEqual(e);
});
