import { t } from "../lib/i18n";
import { getSticker, type StickerId } from "../lib/stickers";
import {
  markMessageEntrance,
  clearMessageEntrances,
} from "../lib/messageMotion";
import { defaultExecution, type ExecutionSettings } from "../lib/execution";
import { create } from "zustand";
import {
  emptyRun,
  isTerminal,
  reduceEvent,
  redact,
  eventSchema,
  type RunState,
  type Decision,
  type ApprovalRef,
  type DetectionResult,
} from "@coi/protocol";
import { DemoAdapter } from "../lib/demo";
import { bridge, native, type Project } from "../lib/bridge";
export type Stage =
  | "introduction"
  | "provider_check"
  | "trust_pact"
  | "first_mission"
  | "guided_run"
  | "completed";
export interface Session {
  id: string;
  title: string;
  projectId?: string;
  createdAt: string;
  execution?: ExecutionSettings;
  messages: {
    id: string;
    role: "user" | "assistant";
    text: string;
    runId?: string;
    stickerId?: StickerId;
  }[];
  runs: RunState[];
  demoApplied: boolean;
  demoDeclined: boolean;
  taskCopyId?: string;
  applicationId?: string;
}
export interface Settings {
  reducedMotion: boolean;
  highContrast: boolean;
  textSpeed: "instant" | "normal" | "slow";
  displayName: string;
  mode: "plan" | "review_copy";
}
interface State {
  ready: boolean;
  sessions: Session[];
  activeId: string;
  projects: Project[];
  settings: Settings;
  stage: Stage;
  onboardingOpen: boolean;
  skipped: boolean;
  panel: "companion" | "artifact" | "files" | "collapsed";
  sidebar: boolean;
  panelWidth: number;
  settingsOpen: boolean;
  guide: string | null;
  detections: DetectionResult[];
  detecting: boolean;
  toast: string | null;
  persistError: string | null;
  activeRunId: string | null;
  diffSeen: boolean;
  init(): Promise<void>;
  newSession(projectId?: string): void;
  selectSession(id: string): void;
  renameSession(id: string, title: string): void;
  deleteSession(id: string): void;
  forgetTask(id: string): void;
  setStage(stage: Stage): void;
  skip(): void;
  resume(): void;
  updateSettings(s: Partial<Settings>): void;
  updateExecution(settings: Partial<ExecutionSettings>): void;
  setPanel(p: State["panel"]): void;
  setSidebar(v: boolean): void;
  setPanelWidth(v: number): void;
  openSettings(v: boolean): void;
  setGuide(id: string | null): void;
  notify(t: string | null): void;
  detect(): Promise<void>;
  openProject(): Promise<void>;
  send(prompt: string, stickerId?: StickerId): Promise<boolean>;
  decide(ref: ApprovalRef, decision: Decision): Promise<void>;
  stop(): Promise<void>;
  demoApply(apply: boolean): void;
  demoUndo(): void;
  setTaskCopy(sessionId: string, id: string): void;
  setApplication(sessionId: string, id: string | undefined): void;
}
let adapter: DemoAdapter | undefined;
let persistChain = Promise.resolve();
let initializing = false;
const defaultSettings: Settings = {
  reducedMotion:
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  highContrast: false,
  textSpeed: "instant",
  displayName: "",
  mode: "review_copy",
};
function freshSession(projectId?: string): Session {
  return {
    id: crypto.randomUUID(),
    title: projectId ? t("새 프로젝트 작업") : t("새로운 이야기"),
    projectId,
    createdAt: new Date().toISOString(),
    messages: [],
    runs: [],
    demoApplied: false,
    demoDeclined: false,
  };
}
export const useApp = create<State>((set, get) => ({
  setTaskCopy(sessionId, taskCopyId) {
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId ? { ...x, taskCopyId } : x,
      ),
    }));
  },
  setApplication(sessionId, applicationId) {
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId ? { ...x, applicationId } : x,
      ),
    }));
  },
  ready: false,
  sessions: [],
  activeId: "",
  projects: [],
  settings: defaultSettings,
  stage: "introduction",
  onboardingOpen: true,
  skipped: false,
  panel: "companion",
  sidebar: true,
  panelWidth: 390,
  settingsOpen: false,
  guide: null,
  detections: [],
  detecting: false,
  toast: null,
  persistError: null,
  activeRunId: null,
  diffSeen: false,
  async init() {
    if (get().ready || initializing) return;
    initializing = true;
    try {
      const raw = await bridge.load();
      if (raw) {
        const data = JSON.parse(raw);
        if (
          [1, 2].includes(data.version) &&
          Array.isArray(data.sessions) &&
          Array.isArray(data.projects)
        ) {
          if (
            !data.sessions.every(
              (s: Session) =>
                typeof s.id === "string" &&
                typeof s.title === "string" &&
                Array.isArray(s.messages) &&
                Array.isArray(s.runs) &&
                s.runs.every(
                  (r) =>
                    Array.isArray(r.events) &&
                    Array.isArray(r.pending) &&
                    Array.isArray(r.seen) &&
                    typeof r.text === "string",
                ),
            )
          )
            throw new Error("Invalid saved session");
          if (
            !data.projects.every(
              (p: Project) =>
                typeof p.id === "string" &&
                typeof p.name === "string" &&
                typeof p.root === "string",
            )
          )
            throw new Error("Invalid projects");
          if (
            data.stage &&
            ![
              "introduction",
              "provider_check",
              "trust_pact",
              "first_mission",
              "guided_run",
              "completed",
            ].includes(data.stage)
          )
            throw new Error("Invalid stage");
          if (
            data.settings?.displayName != null &&
            typeof data.settings.displayName !== "string"
          )
            throw new Error("Invalid display name");
          for (const session of data.sessions as Session[]) {
            if (
              !session.messages.every(
                (m) =>
                  typeof m.id === "string" &&
                  ["user", "assistant"].includes(m.role) &&
                  typeof m.text === "string",
              )
            )
              throw new Error("Invalid message");
            for (const run of session.runs) {
              for (const e of [...run.events, ...run.pending])
                eventSchema.parse(e);
            }
          }
          const sessions = (data.sessions as Session[]).map((s) => ({
            ...s,
            messages: s.messages.map((message, index) => ({
              ...message,
              stickerId: getSticker(message.stickerId)?.id,
              // Version 1 wrote one user message per run in the same order.
              runId:
                message.runId ??
                (data.version === 1 && message.role === "user"
                  ? s.runs[index]?.runId
                  : undefined),
            })),
            runs: s.runs.map((r) =>
              isTerminal(r.status)
                ? r
                : {
                    ...r,
                    status: "failed" as const,
                    verification:
                      r.verification === "running"
                        ? ("incomplete" as const)
                        : r.verification,
                    pending: [],
                    error: t(
                      "앱이 닫혀 이전 실행이 중단됐어요. 새 작업으로 다시 시작해 주세요.",
                    ),
                  },
            ),
          }));
          set({
            sessions,
            projects: data.projects,
            activeId: sessions.some((s) => s.id === data.activeId)
              ? data.activeId
              : (sessions[0]?.id ?? ""),
            settings: { ...defaultSettings, ...data.settings },
            stage: data.stage ?? "introduction",
            skipped: !!data.skipped,
            onboardingOpen: data.stage !== "completed" && !data.skipped,
            panel: data.panel ?? "companion",
            panelWidth: data.panelWidth ?? 390,
          });
        } else throw new Error("Unsupported snapshot version");
      }
      if (native) {
        for (const session of get().sessions) {
          const journal = await bridge.nativeRuns(session.id);
          for (const nativeRun of journal.reverse()) {
            let run = emptyRun(nativeRun.id, session.id);
            for (;;) {
              const events = await bridge.runEvents(run.runId, run.seq);
              for (const event of events)
                run = reduceEvent(run, eventSchema.parse(event));
              if (events.length < 128) break;
            }
            set((state) => ({
              sessions: state.sessions.map((item) =>
                item.id === session.id
                  ? {
                      ...item,
                      messages: item.messages.map((message) =>
                        message.id === nativeRun.requestMessageId
                          ? { ...message, runId: nativeRun.id }
                          : message,
                      ),
                      runs: [
                        ...item.runs.filter((item) => item.runId !== run.runId),
                        run,
                      ],
                    }
                  : item,
              ),
            }));
          }
        }
        try {
          const report = await bridge.cleanupExpired();
          const remaining = new Set((await bridge.tasks()).map((t) => t.id));
          for (const session of get().sessions)
            if (session.taskCopyId && !remaining.has(session.taskCopyId))
              get().forgetTask(session.taskCopyId);
          if (report.removedTaskIds.length)
            get().notify(
              t("보존 기한이 지난 작업 사본 {0}개를 정리했어요.", [
                report.removedTaskIds.length,
              ]),
            );
        } catch {
          get().notify(
            t(
              "예약된 자동 정리를 완료하지 못했어요. 로컬 저장과 복구에서 확인해 주세요.",
            ),
          );
        }
      }
    } catch {
      set({
        persistError: t(
          "저장된 작업을 읽지 못했어요. 기존 저장 파일을 보존하고 새 화면을 열었어요.",
        ),
      });
    } finally {
      if (!get().sessions.length) {
        const s = freshSession();
        set({ sessions: [s], activeId: s.id });
      }
      set({ ready: true });
      initializing = false;
      void get().detect();
    }
  },
  newSession(projectId) {
    const s = freshSession(projectId);
    set((state) => ({
      sessions: [s, ...state.sessions],
      activeId: s.id,
      panel: "companion",
      diffSeen: false,
    }));
  },
  selectSession(activeId) {
    clearMessageEntrances();
    set({ activeId, panel: "companion" });
  },
  renameSession(id, title) {
    if (title.trim())
      set((s) => ({
        sessions: s.sessions.map((x) =>
          x.id === id ? { ...x, title: title.trim().slice(0, 80) } : x,
        ),
      }));
  },
  deleteSession(id) {
    if (
      get()
        .sessions.find((s) => s.id === id)
        ?.runs.some((r) => !isTerminal(r.status))
    ) {
      get().notify(t("실행 중인 작업을 먼저 중지해 주세요."));
      return;
    }
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id);
      if (!sessions.length) sessions.push(freshSession());
      return {
        sessions,
        activeId: state.activeId === id ? sessions[0].id : state.activeId,
      };
    });
  },
  forgetTask(id) {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.taskCopyId === id
          ? { ...s, taskCopyId: undefined, applicationId: undefined }
          : s,
      ),
    }));
  },
  setStage(stage) {
    set({ stage, skipped: false, onboardingOpen: stage !== "completed" });
  },
  skip() {
    set({ skipped: true, onboardingOpen: false });
  },
  resume() {
    set({ skipped: false, onboardingOpen: true });
  },
  updateSettings(settings) {
    set((s) => ({ settings: { ...s.settings, ...settings } }));
  },
  setPanel(panel) {
    set({ panel, ...(panel === "artifact" ? { diffSeen: true } : {}) });
  },
  setSidebar(sidebar) {
    set({ sidebar });
  },
  setPanelWidth(panelWidth) {
    set({ panelWidth: Math.max(310, Math.min(620, panelWidth)) });
  },
  openSettings(settingsOpen) {
    set({ settingsOpen });
  },
  setGuide(guide) {
    set({ guide });
  },
  notify(toast) {
    set({ toast });
  },
  async detect() {
    set({ detecting: true });
    try {
      set({ detections: await bridge.detect() });
    } catch (e) {
      get().notify(String(e));
    } finally {
      set({ detecting: false });
    }
  },
  async openProject() {
    try {
      const project = await bridge.pickProject();
      if (!project) return;
      set((s) => ({
        projects: [project, ...s.projects.filter((p) => p.id !== project.id)],
      }));
      get().newSession(project.id);
    } catch (e) {
      get().notify(String(e));
    }
  },
  updateExecution(settings) {
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === state.activeId
          ? {
              ...session,
              execution: {
                ...defaultExecution,
                ...session.execution,
                ...settings,
                ...(settings.provider &&
                settings.provider !==
                  (session.execution?.provider ?? defaultExecution.provider)
                  ? {
                      conversationKey: crypto.randomUUID(),
                      transferHistory: false,
                    }
                  : {}),
              },
            }
          : session,
      ),
    }));
  },
  async send(prompt, stickerId) {
    if (!prompt.trim() || get().activeRunId) return false;
    stickerId = getSticker(stickerId)?.id;
    const state = get(),
      session = state.sessions.find((s) => s.id === state.activeId);
    if (!session) return false;
    if (session.projectId) {
      const execution = { ...defaultExecution, ...session.execution };
      const requestMessageId = crypto.randomUUID();
      markMessageEntrance(requestMessageId);
      try {
        set((state) => ({
          activeRunId: `starting:${requestMessageId}`,
          sessions: state.sessions.map((item) =>
            item.id === session.id
              ? {
                  ...item,
                  messages: [
                    ...item.messages,
                    {
                      id: requestMessageId,
                      role: "user" as const,
                      text: redact(prompt),
                      stickerId,
                    },
                  ],
                }
              : item,
          ),
        }));
        await persistChain;
        if (get().persistError) throw new Error(get().persistError!);
        const started = await bridge.startRun(
          {
            sessionId: session.id,
            projectId: session.projectId,
            taskCopyId: session.taskCopyId ?? "",
            mode: state.settings.mode,
            provider: execution.provider,
            model: execution.model,
            effort: execution.effort,
            requestMessageId,
            conversationKey: execution.conversationKey,
          },
          execution.transferHistory
            ? t("{0}\n\n새 요청: {1}", [
                session.messages
                  .flatMap((message) => {
                    const run = session.runs.find(
                      (run) => run.runId === message.runId,
                    );
                    return [
                      `${message.role}: ${message.text}`,
                      ...(message.role === "user" && run?.text
                        ? [`assistant: ${run.text}`]
                        : []),
                    ];
                  })
                  .join("\n")
                  .slice(-24000),
                prompt,
              ])
            : prompt,
        );
        if (get().activeId === session.id) markMessageEntrance(started.id);
        set((state) => ({
          activeRunId: started.id,
          sessions: state.sessions.map((item) =>
            item.id === session.id
              ? {
                  ...item,
                  taskCopyId: started.taskCopyId,
                  execution: {
                    ...execution,
                    ...item.execution,
                    transferHistory: false,
                  },
                  title: session.messages.length
                    ? item.title
                    : prompt.slice(0, 30),
                  messages: item.messages.map((message) =>
                    message.id === requestMessageId
                      ? { ...message, runId: started.id }
                      : message,
                  ),
                  runs: [...item.runs, emptyRun(started.id, session.id)],
                }
              : item,
          ),
        }));
        void followNativeRun(started.id, session.id);
        return true;
      } catch (error) {
        set((state) => ({
          activeRunId: null,
          sessions: state.sessions.map((item) =>
            item.id === session.id
              ? {
                  ...item,
                  messages: item.messages.filter(
                    (message) => message.id !== requestMessageId,
                  ),
                }
              : item,
          ),
        }));
        get().notify(String(error));
        return false;
      }
    }
    adapter = new DemoAdapter();
    const run = emptyRun(crypto.randomUUID(), session.id);
    const messageId = crypto.randomUUID();
    markMessageEntrance(messageId);
    markMessageEntrance(run.runId);
    set((s) => ({
      activeRunId: run.runId,
      sessions: s.sessions.map((x) =>
        x.id === session.id
          ? {
              ...x,
              title: x.messages.length ? x.title : prompt.slice(0, 30),
              messages: [
                ...x.messages,
                {
                  id: messageId,
                  role: "user" as const,
                  text: redact(prompt),
                  stickerId,
                  runId: run.runId,
                },
              ],
              runs: [...x.runs, run],
              demoApplied: false,
              demoDeclined: false,
            }
          : x,
      ),
    }));
    void adapter
      .start(
        {
          runId: run.runId,
          sessionId: session.id,
          prompt,
          mode: state.settings.mode,
        },
        (e) => {
          set((s) => ({
            sessions: s.sessions.map((x) =>
              x.id === session.id
                ? {
                    ...x,
                    runs: x.runs.map((r) =>
                      r.runId === e.runId ? reduceEvent(r, e) : r,
                    ),
                  }
                : x,
            ),
            ...(e.kind === "run_finished" ? { activeRunId: null } : {}),
          }));
        },
      )
      .catch((e) => {
        set({ activeRunId: null });
        get().notify(String(e));
      });
    return true;
  },
  async decide(ref, decision) {
    const runId = get().activeRunId;
    if (!runId) return;
    const live = get().sessions.some(
      (session) =>
        session.projectId && session.runs.some((run) => run.runId === runId),
    );
    if (live) {
      try {
        await bridge.resolveRunApproval(runId, ref, decision);
      } catch (error) {
        get().notify(String(error));
      }
      return;
    }
    if (!adapter) return;
    try {
      await adapter.resolveApproval(runId, ref, decision);
    } catch (e) {
      get().notify(String(e));
    }
  },
  async stop() {
    const id = get().activeRunId;
    if (id?.startsWith("starting:")) {
      get().notify(t("실행 범위 확인 창에서 취소를 선택해 주세요."));
      return;
    }
    if (
      id &&
      get().sessions.some(
        (session) =>
          session.projectId && session.runs.some((run) => run.runId === id),
      )
    ) {
      try {
        await bridge.cancelRun(id);
      } catch (error) {
        get().notify(String(error));
      }
      return;
    }
    if (id && adapter) {
      set((s) => ({
        sessions: s.sessions.map((x) => ({
          ...x,
          runs: x.runs.map((r) =>
            r.runId === id ? { ...r, status: "cancelling" } : r,
          ),
        })),
      }));
      await adapter.cancel(id);
    }
  },
  demoApply(apply) {
    if (!get().diffSeen) {
      get().setPanel("artifact");
      return;
    }
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === s.activeId
          ? { ...x, demoApplied: apply, demoDeclined: !apply }
          : x,
      ),
    }));
    get().notify(
      apply
        ? t("Demo에 적용했어요. 실제 파일은 변경되지 않았어요.")
        : t("변경안을 적용하지 않았어요. 언제든 다시 확인할 수 있어요."),
    );
  },
  demoUndo() {
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === s.activeId
          ? { ...x, demoApplied: false, demoDeclined: false }
          : x,
      ),
    }));
    get().notify(t("Demo의 인사말을 이전 상태로 되돌렸어요."));
  },
}));
useApp.subscribe((state) => {
  if (!state.ready || state.persistError) return;
  const data = JSON.stringify({
    version: 2,
    sessions: state.sessions,
    projects: state.projects,
    activeId: state.activeId,
    settings: state.settings,
    stage: state.stage,
    skipped: state.skipped,
    panel: state.panel,
    panelWidth: state.panelWidth,
  });
  persistChain = persistChain
    .then(() => bridge.save(data))
    .catch(() => {
      useApp.setState({
        persistError: t(
          "로컬 저장에 실패했어요. 디스크 공간과 폴더 권한을 확인해 주세요.",
        ),
      });
    });
});

async function followNativeRun(runId: string, sessionId: string) {
  let failures = 0;
  for (;;) {
    const current = useApp
      .getState()
      .sessions.find((session) => session.id === sessionId)
      ?.runs.find((run) => run.runId === runId);
    if (!current || isTerminal(current.status)) return;
    try {
      const events = await bridge.runEvents(runId, current.seq);
      let next = current;
      for (const event of events)
        next = reduceEvent(next, eventSchema.parse(event));
      if (events.length)
        useApp.setState((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  runs: session.runs.map((run) =>
                    run.runId === runId ? next : run,
                  ),
                }
              : session,
          ),
          ...(isTerminal(next.status) && state.activeRunId === runId
            ? { activeRunId: null }
            : {}),
        }));
      failures = 0;
      if (isTerminal(next.status)) return;
    } catch {
      failures += 1;
      if (failures === 3)
        useApp
          .getState()
          .notify(
            t(
              "CLI 기록 연결을 재시도하고 있어요. 실행은 계속 관리되고 있으며 중지할 수 있어요.",
            ),
          );
    }
    await new Promise((resolve) => setTimeout(resolve, failures ? 1500 : 180));
  }
}
