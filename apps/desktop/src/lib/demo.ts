import { t } from "./i18n";
import {
  type CliAdapter,
  type CoiEvent,
  type EventPayloadMap,
  type ApprovalRef,
  type Decision,
  type Verification,
  eventSchema,
} from "@coi/protocol";
export const sampleBefore = "# Hello, world\n\nWelcome to my project.\n";
export const sampleAfter = () =>
  t("# 반가워요! 👋\n\n함께 아이디어를 코드로 만들어 봐요.\n");
export const demoHash = "demo-readme-v2";
export class DemoAdapter implements CliAdapter {
  id = "demo" as const;
  private active?: {
    runId: string;
    sessionId: string;
    seq: number;
    emit: (e: CoiEvent) => void;
    pending?: ApprovalRef;
    cancelled: boolean;
    verification: Verification;
    artifacts: string[];
    timer?: ReturnType<typeof setTimeout>;
    wake?: () => void;
  };
  async detect() {
    return null;
  }
  capabilities() {
    return {
      protocolVersion: "coi/1",
      testedCliVersion: null,
      structuredEvents: true,
      nativeApprovals: true,
      interrupt: true,
      resume: false,
      filesystemSandbox: false,
      networkPolicy: false,
      externalToolsDisabled: true,
    };
  }
  private event<K extends keyof EventPayloadMap>(
    kind: K,
    payload: EventPayloadMap[K],
  ) {
    const a = this.active;
    if (!a || a.cancelled) return;
    const event = {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      sessionId: a.sessionId,
      runId: a.runId,
      seq: ++a.seq,
      timestamp: new Date().toISOString(),
      provider: "demo",
      origin: "demo",
      kind,
      payload,
    };
    a.emit(eventSchema.parse(event));
  }
  private async pause(ms = 550) {
    const a = this.active;
    if (!a || a.cancelled) return;
    await new Promise<void>((resolve) => {
      a.wake = resolve;
      a.timer = setTimeout(resolve, ms);
    });
  }
  async start(
    input: {
      runId: string;
      sessionId: string;
      prompt: string;
      mode: "plan" | "review_copy";
    },
    emit: (e: CoiEvent) => void,
  ) {
    if (this.active && !this.active.cancelled)
      throw new Error(t("이미 실행 중인 작업이 있어요."));
    this.active = {
      runId: input.runId,
      sessionId: input.sessionId,
      seq: 0,
      emit,
      cancelled: false,
      verification: "not_run",
      artifacts: [],
    };
    this.event("run_started", {
      mode: input.mode,
      taskCopyId: "demo-memory",
      baselineId: "demo-readme-v1",
    });
    this.event("activity", {
      activityId: "read",
      phase: "started",
      type: "reading",
      target: "README.md",
    });
    await this.pause();
    this.event("assistant_delta", {
      messageId: "answer",
      text: t(
        "먼저 README의 인사말을 살펴봤어요.\n\n짧은 인사와 함께, 이곳에서 무엇을 만들 수 있는지 자연스럽게 안내하면 좋겠어요.",
      ),
    });
    this.event("activity", {
      activityId: "read",
      phase: "finished",
      type: "reading",
      target: "README.md",
      result: t("모의 파일 읽기 완료"),
    });
    await this.pause();
    if (this.active.cancelled) return;
    if (input.mode === "plan") {
      this.event("assistant_delta", {
        messageId: "answer",
        text: t(
          "\n\n읽기 전용 모드라 변경하지 않았어요. 제목을 “반가워요!”로 바꾸고 함께 작업한다는 안내를 넣는 것을 제안해요.",
        ),
      });
      this.finish("completed");
      return;
    }
    const ref = {
      approvalId: crypto.randomUUID(),
      providerRequestId: "demo-request",
      threadId: input.sessionId,
      turnId: input.runId,
    };
    this.active.pending = ref;
    this.event("approval_requested", {
      ref,
      scope: t("메모리의 README.md 예제 1개"),
      risk: "L1",
      decisions: ["allow_once", "deny", "cancel_run"],
      description: t(
        "Demo 예제의 인사말을 수정해 볼게요. 실제 프로젝트 파일과 CLI는 사용하지 않아요.",
      ),
    });
  }
  async resolveApproval(runId: string, ref: ApprovalRef, decision: Decision) {
    const a = this.active;
    if (
      !a ||
      a.runId !== runId ||
      a.cancelled ||
      a.pending?.approvalId !== ref.approvalId ||
      a.pending.turnId !== ref.turnId
    )
      throw new Error(t("만료되었거나 이미 처리한 승인이에요."));
    a.pending = undefined;
    this.event("approval_resolved", {
      approvalId: ref.approvalId,
      state:
        decision === "allow_once"
          ? "accepted"
          : decision === "deny"
            ? "denied"
            : "cancelled",
      actor: "user",
    });
    if (decision !== "allow_once") {
      this.finish("cancelled");
      return;
    }
    this.event("activity", {
      activityId: "edit",
      phase: "started",
      type: "editing",
      target: "README.md",
    });
    await this.pause();
    if (a.cancelled) return;
    this.event("activity", {
      activityId: "edit",
      phase: "finished",
      type: "editing",
      target: "README.md",
      result: t("인사말 2줄 변경 (모의)"),
    });
    this.event("verification_changed", {
      status: "running",
      checkId: "demo-check",
      artifactHash: demoHash,
      evidenceRef: "demo-fixture",
      summary: t("모의 검증 중"),
    });
    a.verification = "running";
    await this.pause();
    if (a.cancelled) return;
    this.event("verification_changed", {
      status: "passed",
      checkId: "demo-check",
      artifactHash: demoHash,
      evidenceRef: "demo-fixture",
      command: "demo: check greeting fixture",
      exitCode: 0,
      summary: t("예제 인사말 검사 통과 · 모의 결과"),
    });
    this.event("artifact_created", {
      artifactId: "demo-readme",
      kind: "diff",
      relativePath: "README.md",
      contentHash: demoHash,
    });
    a.verification = "passed";
    a.artifacts = ["demo-readme"];
    this.event("assistant_delta", {
      messageId: "answer",
      text: t(
        "\n\n변경안을 준비했어요. 오른쪽에서 이전 내용과 비교해 보세요. 검증은 체험을 위한 모의 결과이며, 실제 명령은 실행하지 않았어요.",
      ),
    });
    this.finish("completed");
  }
  private finish(status: "completed" | "cancelled") {
    this.event("run_finished", {
      status,
      reasonCode: status === "completed" ? "done" : "user_cancelled",
      verification:
        this.active?.verification === "running"
          ? "incomplete"
          : (this.active?.verification ?? "not_run"),
      pendingArtifacts: this.active?.artifacts ?? [],
    });
    if (this.active) this.active.cancelled = true;
  }
  async cancel(runId: string) {
    if (this.active?.runId !== runId || this.active.cancelled) return;
    clearTimeout(this.active.timer);
    this.active.wake?.();
    this.finish("cancelled");
  }
  async dispose() {
    if (this.active) await this.cancel(this.active.runId);
  }
}
