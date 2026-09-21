import { z } from "zod";
export const providerSchema = z.enum([
  "demo",
  "codex",
  "claude",
  "gemini",
  "antigravity",
]);
export type Provider = z.infer<typeof providerSchema>;
export const verificationSchema = z.enum([
  "not_run",
  "running",
  "passed",
  "failed",
  "incomplete",
]);
export type Verification = z.infer<typeof verificationSchema>;
export const terminalSchema = z.enum(["completed", "failed", "cancelled"]);
export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "cancelling"
  | z.infer<typeof terminalSchema>;
export const decisionSchema = z.enum(["allow_once", "deny", "cancel_run"]);
export type Decision = z.infer<typeof decisionSchema>;
export const approvalRefSchema = z
  .object({
    approvalId: z.string(),
    providerRequestId: z.string(),
    threadId: z.string(),
    turnId: z.string(),
    itemId: z.string().optional(),
  })
  .strict();
export type ApprovalRef = z.infer<typeof approvalRefSchema>;
const envelope = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  sessionId: z.string(),
  runId: z.string(),
  seq: z.number().int().positive(),
  timestamp: z.string(),
  provider: providerSchema,
  origin: z.enum(["live", "demo"]),
  sourceEventId: z.string().optional(),
});
const payloads = {
  run_started: z
    .object({
      mode: z.enum(["plan", "review_copy"]),
      taskCopyId: z.string(),
      baselineId: z.string(),
    })
    .strict(),
  assistant_delta: z
    .object({ messageId: z.string(), text: z.string() })
    .strict(),
  activity: z
    .object({
      activityId: z.string(),
      phase: z.enum(["started", "finished"]),
      type: z.enum(["reading", "analyzing", "editing", "command"]),
      target: z.string(),
      result: z.string().optional(),
    })
    .strict(),
  approval_requested: z
    .object({
      ref: approvalRefSchema,
      scope: z.string(),
      risk: z.enum(["L1", "L2"]),
      decisions: z.array(decisionSchema),
      description: z.string(),
    })
    .strict(),
  approval_resolved: z
    .object({
      approvalId: z.string(),
      state: z.enum(["accepted", "denied", "cancelled", "expired"]),
      actor: z.enum(["user", "provider", "system"]),
    })
    .strict(),
  verification_changed: z
    .object({
      status: verificationSchema,
      checkId: z.string(),
      artifactHash: z.string(),
      evidenceRef: z.string(),
      command: z.string().optional(),
      exitCode: z.number().int().optional(),
      summary: z.string(),
    })
    .strict(),
  artifact_created: z
    .object({
      artifactId: z.string(),
      kind: z.enum(["diff", "code", "markdown", "image", "log"]),
      relativePath: z.string(),
      contentHash: z.string(),
    })
    .strict(),
  run_warning: z
    .object({
      code: z.string(),
      redactedMessage: z.string(),
      retryable: z.boolean(),
    })
    .strict(),
  run_finished: z
    .object({
      status: terminalSchema,
      reasonCode: z.string(),
      verification: verificationSchema,
      pendingArtifacts: z.array(z.string()),
    })
    .strict(),
};
export const eventSchema = z
  .discriminatedUnion("kind", [
    envelope
      .extend({ kind: z.literal("run_started"), payload: payloads.run_started })
      .strict(),
    envelope
      .extend({
        kind: z.literal("assistant_delta"),
        payload: payloads.assistant_delta,
      })
      .strict(),
    envelope
      .extend({ kind: z.literal("activity"), payload: payloads.activity })
      .strict(),
    envelope
      .extend({
        kind: z.literal("approval_requested"),
        payload: payloads.approval_requested,
      })
      .strict(),
    envelope
      .extend({
        kind: z.literal("approval_resolved"),
        payload: payloads.approval_resolved,
      })
      .strict(),
    envelope
      .extend({
        kind: z.literal("verification_changed"),
        payload: payloads.verification_changed,
      })
      .strict(),
    envelope
      .extend({
        kind: z.literal("artifact_created"),
        payload: payloads.artifact_created,
      })
      .strict(),
    envelope
      .extend({ kind: z.literal("run_warning"), payload: payloads.run_warning })
      .strict(),
    envelope
      .extend({
        kind: z.literal("run_finished"),
        payload: payloads.run_finished,
      })
      .strict(),
  ])
  .superRefine((event, ctx) => {
    if (
      event.kind === "verification_changed" &&
      event.payload.status === "passed" &&
      (!event.payload.command ||
        event.payload.exitCode !== 0 ||
        !event.payload.artifactHash ||
        !event.payload.evidenceRef)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Passed verification requires command, exit code 0, artifact hash and evidence",
      });
    if ((event.provider === "demo") !== (event.origin === "demo"))
      ctx.addIssue({
        code: "custom",
        message: "Demo origin must match provider",
      });
  });
export type CoiEvent = z.infer<typeof eventSchema>;
export type EventPayloadMap = {
  [K in CoiEvent["kind"]]: Extract<CoiEvent, { kind: K }>["payload"];
};
export type Expression =
  | "neutral"
  | "greeting"
  | "thinking"
  | "working"
  | "question"
  | "success"
  | "concerned";
export type RunState = {
  runId: string;
  sessionId: string;
  status: RunStatus;
  verification: Verification;
  seq: number;
  seen: string[];
  events: CoiEvent[];
  pending: Extract<CoiEvent, { kind: "approval_requested" }>[];
  text: string;
  activity?: string;
  error?: string;
};
export function emptyRun(runId: string, sessionId: string): RunState {
  return {
    runId,
    sessionId,
    status: "queued",
    verification: "not_run",
    seq: 0,
    seen: [],
    events: [],
    pending: [],
    text: "",
  };
}
export const isTerminal = (s: RunStatus) =>
  ["completed", "failed", "cancelled"].includes(s);
export function reduceEvent(state: RunState, raw: unknown): RunState {
  const e = eventSchema.parse(raw);
  if (
    e.runId !== state.runId ||
    e.sessionId !== state.sessionId ||
    state.seen.includes(e.id) ||
    e.seq <= state.seq ||
    isTerminal(state.status)
  )
    return state;
  const next = {
    ...state,
    seq: e.seq,
    seen: [...state.seen, e.id],
    events: [...state.events, e],
  };
  switch (e.kind) {
    case "run_started":
      next.status = "running";
      next.verification = "not_run";
      break;
    case "assistant_delta":
      next.text += e.payload.text;
      break;
    case "activity":
      next.activity = e.payload.type;
      if (e.payload.type === "editing") next.verification = "not_run";
      break;
    case "approval_requested":
      next.pending = [...state.pending, e];
      next.status = "awaiting_approval";
      break;
    case "approval_resolved":
      next.pending = state.pending.filter(
        (a) => a.payload.ref.approvalId !== e.payload.approvalId,
      );
      next.status = next.pending.length ? "awaiting_approval" : "running";
      break;
    case "verification_changed":
      next.verification = e.payload.status;
      break;
    case "run_warning":
      next.error = e.payload.redactedMessage;
      break;
    case "run_finished":
      next.status = e.payload.status;
      if (e.payload.status === "failed" && !next.error)
        next.error = e.payload.reasonCode;
      next.pending = [];
      if (next.verification === "running") next.verification = "incomplete";
      break;
  }
  return next;
}
export function expressionFor(run?: RunState): Expression {
  if (!run) return "neutral";
  if (run.pending.length) return "question";
  if (run.verification === "failed" || run.status === "failed")
    return "concerned";
  if (run.status === "cancelled") return "neutral";
  if (run.verification === "passed") return "success";
  if (isTerminal(run.status)) return "neutral";
  return run.activity === "editing" || run.activity === "command"
    ? "working"
    : "thinking";
}
export function redact(text: string): string {
  // ANSI escape sequences must be removed before persistence.
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g, "")
      .replace(
        /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g,
        "[REDACTED]",
      )
      .replace(
        /((?:api[_-]?key|access[_-]?token|authorization|password|secret)\s*[=:]\s*)(?:Bearer\s+)?[^\s,;]+/gi,
        "$1[REDACTED]",
      )
      .replace(/([?&](?:token|key|code|secret)=)[^&#\s]+/gi, "$1[REDACTED]")
  );
}
export interface DetectionResult {
  provider: Exclude<Provider, "demo">;
  executable: string | null;
  version: string | null;
  authStatus: "available" | "required" | "unknown" | "unavailable";
  compatibility: "verified" | "unverified" | "missing";
  reason: string;
}
export interface AdapterCapabilities {
  protocolVersion: string;
  testedCliVersion: string | null;
  structuredEvents: boolean;
  nativeApprovals: boolean;
  interrupt: boolean;
  resume: boolean;
  filesystemSandbox: boolean;
  networkPolicy: boolean;
  externalToolsDisabled: boolean;
}
export interface CliAdapter {
  id: Provider;
  detect(): Promise<DetectionResult | null>;
  capabilities(): AdapterCapabilities;
  start(
    input: {
      runId: string;
      sessionId: string;
      prompt: string;
      mode: "plan" | "review_copy";
    },
    emit: (e: CoiEvent) => void,
  ): Promise<void>;
  resolveApproval(
    runId: string,
    ref: ApprovalRef,
    decision: Decision,
  ): Promise<void>;
  cancel(runId: string): Promise<void>;
  dispose(): Promise<void>;
}
