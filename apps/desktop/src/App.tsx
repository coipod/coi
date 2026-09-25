import { StreamingResponse } from "./components/StreamingResponse";
import { useShallow } from "zustand/react/shallow";
import { t, useLocale, systemText } from "./lib/i18n";
import { CoiAvatar, StickerImage, StickerPicker } from "./components/Stickers";
import {
  getSticker,
  insertStickerPrompt,
  type StickerId,
} from "./lib/stickers";
import { consumeMessageEntrance } from "./lib/messageMotion";
import { useReducedMotion } from "./hooks/motion";
import { ExecutionControls } from "./components/ExecutionControls";
import { memo, useEffect, useRef, useState, type FormEvent } from "react";
import {
  PanelLeft,
  Plus,
  Search,
  FolderOpen,
  ChevronDown,
  ArrowUp,
  Settings as SettingsIcon,
  Sparkles,
  FileText,
  GitCompareArrows,
  ShieldCheck,
  Check,
  Square,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Terminal,
  ChevronRight,
  Command,
  X,
  ArrowRight,
  RotateCcw,
  AlertCircle,
  Focus,
} from "lucide-react";
import { isTerminal, type RunState, type CoiEvent } from "@coi/protocol";
import { useApp, type Session } from "./stores/app";
import { Onboarding } from "./features/Onboarding";
import { Settings, InstallGuide } from "./features/Settings";
import { Artifacts } from "./features/Artifacts";
import { Companion } from "./components/Companion";
import { Modal } from "./components/Modal";
import { native } from "./lib/bridge";
const statusLabel: Record<string, string> = {
  get queued() {
    return t("준비");
  },
  get running() {
    return t("작업 중");
  },
  get awaiting_approval() {
    return t("확인 필요");
  },
  get cancelling() {
    return t("멈추는 중");
  },
  get completed() {
    return t("완료");
  },
  get failed() {
    return t("중단");
  },
  get cancelled() {
    return t("취소됨");
  },
};
const verificationLabel: Record<string, string> = {
  get not_run() {
    return t("미검증");
  },
  get running() {
    return t("검증 중");
  },
  get passed() {
    return t("검증 통과");
  },
  get failed() {
    return t("검증 실패");
  },
  get incomplete() {
    return t("검증 미완료");
  },
};
function eventLabel(e: CoiEvent) {
  switch (e.kind) {
    case "run_started":
      return e.origin === "demo"
        ? t("메모리 작업 사본 준비")
        : t("작업 사본 준비");
    case "activity":
      return `${e.payload.type === "reading" ? t("읽기") : e.payload.type === "editing" ? t("수정") : e.payload.type === "command" ? t("명령") : t("분석")} · ${systemText(e.payload.target)}${e.payload.phase === "finished" ? t(" 완료") : ""}`;
    case "verification_changed":
      return systemText(e.payload.summary);
    case "approval_requested":
      return t("사본 편집 확인 요청");
    case "approval_resolved":
      return t("확인 응답 · {0}", [e.payload.state]);
    case "artifact_created":
      return t("{0} 변경안 준비", [e.payload.relativePath]);
    case "run_finished":
      return t("작업 {0}", [statusLabel[e.payload.status]]);
    case "run_warning":
      return systemText(e.payload.redactedMessage);
    default:
      return "";
  }
}
const RunTimeline = memo(function RunTimeline({ run }: { run: RunState }) {
  useLocale((state) => state.locale);
  const s = useApp(
    useShallow((state) => ({
      decide: state.decide,
      send: state.send,
      setPanel: state.setPanel,
      retryMessage: state.sessions
        .find((session) => session.id === run.sessionId)
        ?.messages.find(
          (message) => message.role === "user" && message.runId === run.runId,
        ),
    })),
  );
  const retryMessage = s.retryMessage;
  const retryPrompt = retryMessage?.text;
  const [enter] = useState(() => consumeMessageEntrance(run.runId));
  const [pending, setPending] = useState(false);
  return (
    <article className={`assistant-turn ${enter ? "message-enter" : ""}`}>
      <CoiAvatar />
      <div className="turn-content">
        <header>
          <b>COI</b>
          <span className="tag">
            {run.events[0]?.provider.toUpperCase() ?? "COI"}
          </span>
          <small>{statusLabel[run.status]}</small>
        </header>
        <StreamingResponse run={run} />
        <details className="activity-log">
          <summary>
            <span className={isTerminal(run.status) ? "" : "pulse-dot"}>
              {isTerminal(run.status) ? <Check size={13} /> : null}
            </span>
            {isTerminal(run.status) ? t("작업 기록") : t("진행 상황")}
            <small>
              {run.events.filter((e) => e.kind !== "assistant_delta").length}{" "}
              events
            </small>
            <ChevronDown size={13} />
          </summary>
          <ol>
            {run.events
              .filter((e) => e.kind !== "assistant_delta")
              .map((e) => (
                <li key={e.id}>
                  <span className="event-dot" />
                  <span>{eventLabel(e)}</span>
                  <time>
                    {new Date(e.timestamp).toLocaleTimeString(
                      useLocale.getState().locale,
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      },
                    )}
                  </time>
                </li>
              ))}
          </ol>
        </details>
        {run.pending.map((a) => (
          <div className="approval-card" key={a.id}>
            <div className="approval-heading">
              <ShieldCheck size={18} />
              <b>{t("사본에서 진행해도 될까요?")}</b>
              <span>{a.payload.risk}</span>
            </div>
            <p>{systemText(a.payload.description)}</p>
            <small>{systemText(a.payload.scope)}</small>
            <div className="approval-actions">
              <button
                className="primary"
                disabled={pending}
                onClick={() => {
                  setPending(true);
                  void s
                    .decide(a.payload.ref, "allow_once")
                    .finally(() => setPending(false));
                }}
              >
                {pending ? t("처리 중…") : t("사본에서 진행")}
                <ArrowRight size={14} />
              </button>
              <button
                className="text-button"
                disabled={pending}
                onClick={() => void s.decide(a.payload.ref, "deny")}
              >
                {t("진행하지 않기")}
              </button>
            </div>
          </div>
        ))}
        {run.events
          .filter((e) => e.kind === "artifact_created")
          .map((artifact) => (
            <button
              key={artifact.id}
              className="artifact-card"
              onClick={() => s.setPanel("artifact")}
            >
              <span className="file-badge">
                <FileText size={19} />
              </span>
              <span>
                <b>{artifact.payload.relativePath}</b>
                <small>
                  {artifact.origin === "demo"
                    ? t("인사말 개선 · 변경 내용 확인")
                    : t("변경 내용 확인")}
                </small>
              </span>
              {artifact.origin === "demo" && (
                <span className="diff-count">
                  +2 <i>−2</i>
                </span>
              )}
              <ChevronRight size={16} />
            </button>
          ))}
        {run.error && (
          <p className="error-text">
            <AlertCircle size={15} />
            {systemText(run.error)}
          </p>
        )}
        {isTerminal(run.status) && (
          <div className="run-result">
            <span className={`result-dot ${run.status}`} />
            {statusLabel[run.status]}
            <span>·</span>
            {run.verification === "passed" && run.events[0]?.origin === "demo"
              ? t("모의 검증 통과")
              : verificationLabel[run.verification]}
            {run.status !== "completed" && retryPrompt && (
              <button
                className="text-button"
                onClick={() =>
                  void s.send(retryPrompt, retryMessage?.stickerId)
                }
              >
                <RotateCcw size={12} />
                {t("다시 시도")}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
});
function Welcome({ session }: { session: Session }) {
  const s = useApp();
  return (
    <div className="welcome">
      <div className="welcome-symbol">✧</div>
      <span className="tiny-label">LET'S MAKE SOMETHING</span>
      <h1>
        {s.settings.displayName ? t("{0}님, ", [s.settings.displayName]) : ""}
        {t("오늘은 어떤 걸")}
        <br />
        {t("함께 만들어 볼까요?")}
      </h1>
      <p>
        {t("떠오른 아이디어도, 막힌 코드 한 줄도.")}
        <br />
        {t("COI와 차근차근 풀어 보세요.")}
      </p>
      {session.projectId && (
        <div className="suggestions">
          <button onClick={() => void s.send(t("인사말을 더 친근하게 바꿔줘"))}>
            <FileText size={18} />
            <b>{t("작은 변화부터")}</b>
            <span>{t("README 인사말 다듬기")}</span>
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => {
              s.updateSettings({ mode: "plan" });
              void s.send(t("이 프로젝트의 개선 방향을 설명해줘"));
            }}
          >
            <Search size={18} />
            <b>{t("먼저 살펴보기")}</b>
            <span>{t("읽기 모드로 코드 이해하기")}</span>
            <ArrowUp size={14} />
          </button>
        </div>
      )}
      {!session.projectId && (
        <div className="notice">
          <p>{t("실행하려면 프로젝트 폴더를 먼저 열어 주세요.")}</p>
          <button className="primary" onClick={() => void s.openProject()}>
            {t("프로젝트 열기")}
          </button>
        </div>
      )}
      {session.projectId && (
        <div className="notice">
          <ShieldCheck size={17} />
          <p>
            {t(
              "CLI와 모델을 선택하고 요청해 주세요. 변경은 작업 사본에서 진행하며, 원본에는 검토한 변경만 적용해요.",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
const ChatMessage = memo(function ChatMessage({
  message,
}: {
  message: Session["messages"][number];
}) {
  useLocale((state) => state.locale);
  const [enter] = useState(() => consumeMessageEntrance(message.id));
  const user = message.role === "user";
  return (
    <div
      className={`${user ? "user-turn" : "assistant-turn saved-assistant"} ${enter ? "message-enter" : ""}`}
    >
      {user ? <span className="user-avatar">{t("나")}</span> : <CoiAvatar />}
      <div className={user ? "message-body" : "turn-content"}>
        {user && (
          <StickerImage id={message.stickerId} className="sent-sticker" />
        )}
        <p>{message.text}</p>
      </div>
    </div>
  );
});
type Draft = { text: string; stickerId?: StickerId; revision: number };
export default function App() {
  const s = useApp();
  const { init, toast, notify } = s;
  const session = s.sessions.find((x) => x.id === s.activeId);
  const run = session?.runs.at(-1);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draft = drafts[s.activeId] ?? { text: "", revision: 0 };
  const input = draft.text;
  const setInput = (value: string | ((text: string) => string)) => {
    const id = s.activeId;
    setDrafts((all) => {
      const old = all[id] ?? { text: "", revision: 0 };
      return {
        ...all,
        [id]: {
          ...old,
          text: typeof value === "function" ? value(old.text) : value,
          revision: old.revision + 1,
        },
      };
    });
  };
  const [stickerOpen, setStickerOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  useEffect(() => {
    setAiSettingsOpen(false);
    setStickerOpen(false);
  }, [s.activeId]);
  const pickedSticker = useRef(false);
  const reducedMotion = useReducedMotion();
  const [resizing, setResizing] = useState(false);
  const [query, setQuery] = useState("");
  const [palette, setPalette] = useState(false);
  const [rename, setRename] = useState<Session | null>(null);
  const [title, setTitle] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const followConversation = useRef(true);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    void init();
  }, [init]);
  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion
      ? "reduced"
      : "full";
    document.documentElement.dataset.contrast = s.settings.highContrast
      ? "high"
      : "normal";
    document.documentElement.dataset.speed = s.settings.textSpeed;
  }, [s.settings, reducedMotion]);
  useEffect(() => {
    followConversation.current = true;
  }, [s.activeId]);
  useEffect(() => {
    if (!followConversation.current) return;
    end.current?.scrollIntoView({
      behavior: reducedMotion ? "instant" : "smooth",
      block: "end",
    });
  }, [run?.seq, s.activeId, reducedMotion]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => notify(null), 7000);
    return () => clearTimeout(timer);
  }, [toast, notify]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((x) => !x);
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        s.setPanel(s.panel === "collapsed" ? "companion" : "collapsed");
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        s.newSession();
      }
      if (e.key === "Escape" && !document.querySelector("dialog[open]"))
        s.setPanel("companion");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s]);
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    const submitted = draft;
    const sessionId = s.activeId;
    void s.send(submitted.text, submitted.stickerId).then((accepted) => {
      if (!accepted) return;
      setDrafts((all) =>
        all[sessionId]?.revision === submitted.revision
          ? {
              ...all,
              [sessionId]: { text: "", revision: submitted.revision + 1 },
            }
          : all,
      );
    });
  };

  const project = s.projects.find((p) => p.id === session?.projectId);
  if (!s.ready || !session)
    return (
      <div className="boot">
        <img
          className="brand-icon"
          src="/coi/sd/app-icon.png"
          alt="COI"
          width="31"
          height="31"
        />
        <p>{t("작업실을 준비하고 있어요.")}</p>
      </div>
    );
  return (
    <>
      {s.onboardingOpen ? (
        <Onboarding />
      ) : (
        <div
          className={`app-shell ${resizing ? "is-resizing" : ""} ${!s.sidebar ? "sidebar-closed" : ""} ${s.panel === "collapsed" ? "focus-mode" : ""}`}
          style={
            { "--panel-width": `${s.panelWidth}px` } as React.CSSProperties
          }
        >
          <aside
            className="sidebar"
            inert={!s.sidebar}
            aria-hidden={!s.sidebar}
          >
            <header className="sidebar-brand">
              <img
                className="brand-icon"
                src="/coi/sd/app-icon.png"
                alt="COI"
                width="31"
                height="31"
              />
              <b>coi</b>
              <span className="alpha-label">ALPHA</span>
              <button
                className="icon-button"
                onClick={() => s.setSidebar(false)}
                aria-label={t("사이드바 접기")}
              >
                <PanelLeft size={17} />
              </button>
            </header>
            <button className="new-chat" onClick={() => s.newSession()}>
              <Plus size={17} />
              {t("새로운 이야기")}
              <kbd>⌘ N</kbd>
            </button>
            <div className="search-box">
              <Search size={15} />
              <input
                aria-label={t("세션 검색")}
                placeholder={t("이야기 찾기")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>⌘ K</kbd>
            </div>
            <div className="nav-heading">
              <span>{t("작업 공간")}</span>
              <button
                className="icon-button"
                onClick={() => void s.openProject()}
                aria-label={t("프로젝트 폴더 열기")}
              >
                <Plus size={15} />
              </button>
            </div>
            <button
              className="project-row"
              onClick={() => void s.openProject()}
            >
              <FolderOpen size={17} />
              <span>{t("프로젝트 폴더 열기")}</span>
              <ArrowUp size={13} />
            </button>
            {s.projects.map((p) => (
              <button
                key={p.id}
                className="project-row"
                onClick={() => {
                  const x = s.sessions.find((x) => x.projectId === p.id);
                  if (x) s.selectSession(x.id);
                  else s.newSession(p.id);
                }}
              >
                <FolderOpen size={16} />
                <span>{p.name}</span>
              </button>
            ))}
            <div className="nav-heading">
              <span>{t("내 이야기")}</span>
              <small>{s.sessions.length}</small>
            </div>
            <div className="session-list">
              {s.sessions
                .filter((x) =>
                  x.title.toLowerCase().includes(query.toLowerCase()),
                )
                .map((x) => (
                  <button
                    key={x.id}
                    className={`session-row ${x.id === s.activeId ? "active" : ""}`}
                    onClick={() => s.selectSession(x.id)}
                    onDoubleClick={() => {
                      setRename(x);
                      setTitle(x.title);
                    }}
                  >
                    <MessageSquare size={15} />
                    <span>
                      {x.messages.length ? x.title : systemText(x.title)}
                    </span>
                    {x.runs.some((r) => !isTerminal(r.status)) && (
                      <span className="live-dot" />
                    )}
                  </button>
                ))}
            </div>
            {s.skipped && s.stage !== "completed" && (
              <button className="resume-card" onClick={s.resume}>
                <Sparkles size={16} />
                <span>
                  {t("우리의 첫 만남")}
                  <small>{t("멈춘 곳부터 이어가기")}</small>
                </span>
                <ChevronRight size={15} />
              </button>
            )}
            <footer className="sidebar-footer">
              <button
                className="connection"
                onClick={() => s.openSettings(true)}
              >
                <span className="connection-icon">
                  <Terminal size={15} />
                </span>
                <span>
                  <b>
                    {project ? t("CLI 연결 확인") : t("프로젝트 연결 필요")}
                  </b>
                  <small>
                    {native ? t("내 컴퓨터에 저장 중") : t("브라우저 미리보기")}
                  </small>
                </span>
                <span className="status-dot" />
              </button>
              <button
                className="settings-button"
                onClick={() => s.openSettings(true)}
              >
                <SettingsIcon size={16} />
                {t("작업실 설정")}
                <span>↗</span>
              </button>
              <small className="sidebar-credit">
                {t("당신의 속도로, 함께.")}
              </small>
            </footer>
          </aside>
          <main className="workspace">
            <header className="workspace-header">
              <div>
                {!s.sidebar && (
                  <button
                    className="icon-button"
                    onClick={() => s.setSidebar(true)}
                    aria-label={t("사이드바 열기")}
                  >
                    <PanelLeft size={18} />
                  </button>
                )}
                <span className="workspace-title">
                  {project?.name ?? t("나의 작업실")}
                </span>
                <ChevronRight size={13} />
                <span className="session-title">
                  {session.messages.length
                    ? session.title
                    : systemText(session.title)}
                </span>
              </div>
              <div>
                <span className="local-indicator">
                  <span />
                  LOCAL
                </span>
                <button
                  className="icon-button"
                  onClick={() =>
                    s.setPanel(
                      s.panel === "collapsed" ? "companion" : "collapsed",
                    )
                  }
                  aria-label={t("Focus 모드")}
                >
                  <Focus size={17} />
                </button>
              </div>
            </header>
            {s.persistError && (
              <div className="error-banner" role="alert">
                {s.persistError}
              </div>
            )}
            <div
              className="conversation"
              onScroll={(event) => {
                const node = event.currentTarget;
                followConversation.current =
                  node.scrollHeight - node.scrollTop - node.clientHeight < 100;
              }}
            >
              {session.messages.length === 0 && session.runs.length === 0 ? (
                <Welcome session={session} />
              ) : (
                <div className="conversation-inner">
                  {session.messages.map((m) => (
                    <div key={m.id}>
                      <ChatMessage message={m} />
                      {session.runs
                        .filter((r) => r.runId === m.runId)
                        .map((r) => (
                          <RunTimeline key={r.runId} run={r} />
                        ))}
                    </div>
                  ))}
                  {session.runs
                    .filter(
                      (r) => !session.messages.some((m) => m.runId === r.runId),
                    )
                    .map((r) => (
                      <RunTimeline key={r.runId} run={r} />
                    ))}
                </div>
              )}
              <div ref={end} />
            </div>
            <div className="composer-area">
              {s.activeRunId && s.activeRunId !== run?.runId && (
                <p className="footnote">
                  {s.activeRunId.startsWith("starting:")
                    ? t(
                        "실행을 준비하고 있어요. 실행 범위 확인 창을 확인해 주세요.",
                      )
                    : t(
                        "다른 이야기에서 작업 중이에요. 그 작업을 마친 뒤 새로 시작할 수 있어요.",
                      )}
                </p>
              )}
              <form className="composer" onSubmit={submit}>
                {getSticker(draft.stickerId) && (
                  <div className="sticker-draft">
                    <StickerImage id={draft.stickerId} />
                    <span>
                      {getSticker(draft.stickerId)?.label}
                      <small>{t("문구를 고쳐서 보내도 좋아요.")}</small>
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t("스티커 제거")}
                      onClick={() =>
                        setDrafts((all) => ({
                          ...all,
                          [s.activeId]: {
                            ...draft,
                            stickerId: undefined,
                            revision: draft.revision + 1,
                          },
                        }))
                      }
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
                <textarea
                  ref={textarea}
                  aria-label={t("COI에게 요청")}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    project
                      ? t("작업 사본에서 할 일을 적어 주세요…")
                      : t("COI에게 부탁할 일을 적어 주세요…")
                  }
                  rows={2}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
                <div className="composer-toolbar">
                  <div>
                    <button
                      type="button"
                      className="sticker-trigger"
                      aria-haspopup="dialog"
                      aria-expanded={stickerOpen}
                      onClick={(event) => {
                        event.currentTarget.focus({ preventScroll: true });
                        pickedSticker.current = false;
                        setAiSettingsOpen(false);
                        setStickerOpen(true);
                      }}
                    >
                      <img
                        src="/coi/sd/avatar.png"
                        alt=""
                        width="24"
                        height="24"
                      />{" "}
                      {t("스티커")}
                    </button>
                    <ExecutionControls
                      open={aiSettingsOpen}
                      onToggle={() => {
                        setStickerOpen(false);
                        setAiSettingsOpen((value) => !value);
                      }}
                      onClose={() => setAiSettingsOpen(false)}
                    />
                    <select
                      aria-label={t("실행 모드")}
                      value={s.settings.mode}
                      disabled={!!s.activeRunId}
                      onChange={(e) =>
                        s.updateSettings({
                          mode: e.target.value as "plan" | "review_copy",
                        })
                      }
                    >
                      <option value="review_copy">{t("사본에서 작업")}</option>
                      <option value="plan">{t("읽기만")}</option>
                    </select>
                  </div>
                  {s.activeRunId ? (
                    <button
                      type="button"
                      className="send-button stop"
                      onClick={() => void s.stop()}
                      aria-label={t("작업 중지")}
                    >
                      <Square size={15} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      className="send-button"
                      type="submit"
                      disabled={!input.trim()}
                      aria-label={t("요청 보내기")}
                    >
                      <ArrowUp size={19} />
                    </button>
                  )}
                </div>
              </form>
              <div className="composer-note">
                <ShieldCheck size={11} />
                <span>{t("변경은 사본에서. 원본 적용은 확인 후에.")}</span>
                <span className="enter-hint">
                  {t("Enter 전송 · ⇧ Enter 줄바꿈")}
                </span>
              </div>
            </div>
          </main>
          <div
            hidden={s.panel === "collapsed"}
            className="resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("컨텍스트 패널 크기")}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") s.setPanelWidth(s.panelWidth + 20);
              if (e.key === "ArrowRight") s.setPanelWidth(s.panelWidth - 20);
            }}
            onPointerDown={(e) => {
              setResizing(true);
              const x = e.clientX,
                w = s.panelWidth;
              const move = (e: PointerEvent) =>
                s.setPanelWidth(w + x - e.clientX);
              const up = () => {
                setResizing(false);
                window.removeEventListener("pointercancel", up);
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
              window.addEventListener("pointercancel", up);
            }}
          />
          <aside
            inert={s.panel === "collapsed"}
            aria-hidden={s.panel === "collapsed"}
            className={`context-panel mode-${s.panel}`}
          >
            <header className="context-header">
              <div className="context-tabs">
                <button
                  className={s.panel === "companion" ? "active" : ""}
                  onClick={() => s.setPanel("companion")}
                >
                  <Sparkles size={14} />
                  COI
                </button>
                <button
                  className={s.panel !== "companion" ? "active" : ""}
                  onClick={() => s.setPanel(project ? "files" : "artifact")}
                >
                  <GitCompareArrows size={14} />
                  {t("산출물")}
                  {run?.events.some((e) => e.kind === "artifact_created") && (
                    <span className="notification-dot" />
                  )}
                </button>
              </div>
              <div>
                <span className="coi-status">
                  <span
                    className={
                      run && !isTerminal(run.status) ? "busy-dot" : "live-dot"
                    }
                  />
                  {run ? statusLabel[run.status] : t("함께 있어요")}
                </span>
                <button
                  className="icon-button"
                  onClick={() => s.setPanel("collapsed")}
                  aria-label={t("컨텍스트 패널 닫기")}
                >
                  <PanelRightClose size={16} />
                </button>
              </div>
            </header>
            {s.panel === "companion" && (
              <Companion
                key={`companion:${s.activeId}`}
                run={run}
                onStart={() => void s.openProject()}
              />
            )}
            <Artifacts
              key={session.id}
              hidden={s.panel === "companion" || s.panel === "collapsed"}
            />
          </aside>
          {s.panel === "collapsed" && (
            <button
              className="collapsed-companion"
              onClick={() => s.setPanel("companion")}
            >
              <span className="live-dot" />
              COI · {run ? statusLabel[run.status] : t("함께 있어요")}
              <PanelRightOpen size={15} />
            </button>
          )}
        </div>
      )}
      {s.settingsOpen && <Settings />}
      {s.guide && <InstallGuide />}
      {palette && (
        <Modal title={t("어디로 갈까요?")} onClose={() => setPalette(false)}>
          <div className="palette">
            {[
              {
                get name() {
                  return t("새로운 이야기");
                },
                icon: Plus,
                action: () => s.newSession(),
              },
              {
                get name() {
                  return t("프로젝트 폴더 열기");
                },
                icon: FolderOpen,
                action: () => void s.openProject(),
              },
              {
                get name() {
                  return t("COI / 산출물 전환");
                },
                icon: GitCompareArrows,
                action: () =>
                  s.setPanel(
                    s.panel === "companion" ? "artifact" : "companion",
                  ),
              },
              {
                get name() {
                  return t("Focus 모드");
                },
                icon: Focus,
                action: () =>
                  s.setPanel(
                    s.panel === "collapsed" ? "companion" : "collapsed",
                  ),
              },
              {
                get name() {
                  return t("작업실 설정");
                },
                icon: SettingsIcon,
                action: () => s.openSettings(true),
              },
            ].map((a) => (
              <button
                key={a.name}
                onClick={() => {
                  a.action();
                  setPalette(false);
                }}
              >
                <a.icon size={18} />
                {a.name}
                <Command size={12} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {stickerOpen && (
        <StickerPicker
          onPick={(id) => {
            const sticker = getSticker(id)!;
            const inserted = insertStickerPrompt(
              input,
              textarea.current?.selectionStart ?? input.length,
              sticker.prompt,
            );
            setDrafts((all) => ({
              ...all,
              [s.activeId]: {
                text: inserted.text,
                stickerId: id,
                revision: draft.revision + 1,
              },
            }));
            pickedSticker.current = true;
            requestAnimationFrame(() =>
              textarea.current?.setSelectionRange(
                inserted.cursor,
                inserted.cursor,
              ),
            );
          }}
          focusAfterClose={() =>
            pickedSticker.current ? textarea.current : null
          }
          onClose={() => setStickerOpen(false)}
        />
      )}
      {rename && (
        <Modal title={t("이야기 이름 바꾸기")} onClose={() => setRename(null)}>
          <form
            className="modal-content"
            onSubmit={(e) => {
              e.preventDefault();
              s.renameSession(rename.id, title);
              setRename(null);
            }}
          >
            <input
              autoFocus
              className="text-input"
              aria-label={t("이야기 이름")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button className="primary full" type="submit">
              {t("저장")}
            </button>
          </form>
        </Modal>
      )}
      {s.toast && (
        <div role="status" className="toast">
          <span>{systemText(s.toast)}</span>
          <button
            className="icon-button"
            aria-label={t("알림 닫기")}
            onClick={() => s.notify(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
