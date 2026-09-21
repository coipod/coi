import { LanguageSelect } from "../components/LanguageSelect";
import { useLocale } from "../lib/i18n";
import { t, systemText } from "../lib/i18n";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  ArrowUpRight,
  RotateCcw,
  Download,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "../components/Modal";
import { useApp } from "../stores/app";
import { installManifest } from "../lib/providers";
import { bridge, native, type Recovery, type TaskSummary } from "../lib/bridge";
export function OfficialLink({
  id,
  url,
  children,
}: {
  id: string;
  url: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        if (native) {
          e.preventDefault();
          void invoke("open_documentation", { provider: id }).catch((x) =>
            useApp.getState().notify(String(x)),
          );
        }
      }}
    >
      {children}
    </a>
  );
}
export function InstallGuide() {
  const s = useApp(),
    p = installManifest.providers.find((p) => p.id === s.guide);
  const [os, setOs] = useState(
    /Win/i.test(navigator.platform) ? "windows" : "mac",
  );
  const [copied, setCopied] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const [progress, setProgress] = useState("");
  useEffect(() => {
    if (!native) return;
    const listener = listen<{ provider: string; message: string }>(
      "provider-setup-progress",
      (event) => {
        if (event.payload.provider === s.guide)
          setProgress(event.payload.message);
      },
    );
    return () => {
      void listener.then((unlisten) => unlisten());
    };
  }, [s.guide]);
  if (!p) return null;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      s.notify(t("복사 권한이 없어요. 명령을 직접 선택해 복사해 주세요."));
    }
  };
  return (
    <Modal
      title={t("{0} 설치 안내", [p.name])}
      onClose={() => s.setGuide(null)}
    >
      <div className="modal-content">
        <div className="guide-hero">
          <span className={`provider-icon ${p.id}`}>{p.monogram}</span>
          <div>
            <h3>{p.name}</h3>
            <p>{p.phase}</p>
          </div>
          <span className="tag">{t("공식 CLI")}</span>
        </div>
        <button
          className="primary"
          disabled={settingUp || !native}
          onClick={() => {
            setSettingUp(true);
            setProgress(t("설치 환경을 확인하고 있어요."));
            void bridge
              .setupProvider(p.id)
              .then((result) => {
                useApp.setState((state) => ({
                  detections: [
                    ...state.detections.filter(
                      (item) => item.provider !== p.id,
                    ),
                    result,
                  ],
                }));
                setProgress(result.reason);
              })
              .catch((error) => setProgress(String(error)))
              .finally(() => setSettingUp(false));
          }}
        >
          {settingUp ? t("설정 중…") : t("설치하고 연결")}
        </button>
        <p className="footnote">
          {t(
            "기존 설치가 있으면 그대로 사용해요. 계정 로그인은 공식 브라우저에서 직접 완료해 주세요.",
          )}
        </p>
        {progress && (
          <p role="status" className="setup-progress">
            {systemText(progress)}
          </p>
        )}
        <details>
          <summary>{t("직접 설치 안내")}</summary>
          <div className="segmented">
            <button
              className={os === "mac" ? "active" : ""}
              onClick={() => setOs("mac")}
            >
              macOS
            </button>
            <button
              className={os === "windows" ? "active" : ""}
              onClick={() => setOs("windows")}
            >
              Windows
            </button>
          </div>
          <ol className="guide-steps">
            <li>
              <h4>{t("도구 준비")}</h4>
              <p>{p.prerequisite}</p>
              <OfficialLink id={p.id} url={p.docs}>
                {t("공식 설치 문서")}
                <ExternalLink size={13} />
              </OfficialLink>
            </li>
            <li>
              <h4>{t("터미널에서 직접 설치")}</h4>
              <p>
                {t("직접 설치하는 경우 아래 공식 명령을 사용할 수 있어요.")}
              </p>
              <div className="command">
                <code>{os === "mac" ? p.mac : p.windows}</code>
                <button
                  aria-label={t("설치 명령 복사")}
                  onClick={() => void copy(os === "mac" ? p.mac : p.windows)}
                >
                  {copied === (os === "mac" ? p.mac : p.windows) ? (
                    <Check size={16} />
                  ) : (
                    <Copy size={16} />
                  )}
                </button>
              </div>
            </li>
            <li>
              <h4>{t("버전 확인과 공급자 인증")}</h4>
              <div className="command">
                <code>{p.verify}</code>
                <button
                  aria-label={t("확인 명령 복사")}
                  onClick={() => void copy(p.verify)}
                >
                  <Copy size={16} />
                </button>
              </div>
              <p>
                <code>{p.auth}</code>
                {t(
                  "를 공식 CLI에서 실행해 인증해 주세요. 비밀번호·토큰·API 키를 COI에 입력하지 마세요.",
                )}
              </p>
            </li>
          </ol>
        </details>
        <div className="notice">
          <ShieldCheck size={18} />
          <p>
            {t(
              "설치·인증·실행 호환성은 각각 확인해요. 지원되는 CLI는 작업 사본에서 실행하며, 실행 전에 사용할 범위를 확인할 수 있어요.",
            )}
          </p>
        </div>
        <details>
          <summary>{t("설치했는데 감지되지 않나요?")}</summary>
          <p>
            {t(
              "새 터미널에서 버전 명령을 실행하고 앱을 다시 열어 주세요. PATH, Node.js 버전, 프록시 및 조직 설치 정책을 확인해 주세요. 권한 제한을 우회하지 마세요.",
            )}
          </p>
        </details>
        <button
          className="primary full"
          disabled={s.detecting}
          onClick={() => void s.detect()}
        >
          <RefreshCw size={16} />
          {s.detecting ? t("확인 중…") : t("설치 후 다시 확인")}
        </button>
        <p className="footnote">
          {t("문서 확인")}
          {installManifest.docsCheckedAt}{" "}
          {t("· 자동 설치 검증: macOS Apple Silicon")}
        </p>
      </div>
    </Modal>
  );
}
export function Settings() {
  const s = useApp();
  const { notify } = s;
  const [tab, setTab] = useState("engines");
  const [records, setRecords] = useState<Recovery[]>([]);
  const [diagnostics, setDiagnostics] = useState("");
  const [notices, setNotices] = useState("");
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [closing, setClosing] = useState<TaskSummary | null>(null);
  const [maintaining, setMaintaining] = useState(false);
  const [discard, setDiscard] = useState<{
    kind: "session" | "task";
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [storage, setStorage] = useState<{
    sessions: number;
    tasks: number;
    applications: number;
    bytes: number;
  } | null>(null);
  useEffect(() => {
    void Promise.all([
      bridge.recoveries(),
      bridge.storageInfo(),
      bridge.tasks(),
    ])
      .then(([r, i, t]) => {
        setRecords(r);
        setStorage(i);
        setTasks(t);
      })
      .catch((e) => notify(String(e)));
  }, [notify]);
  return (
    <Modal
      title={t("내 작업실 설정")}
      onClose={() => s.openSettings(false)}
      wide
    >
      <div className="settings-layout">
        <nav>
          {[
            ["engines", t("AI 엔진")],
            ["appearance", t("화면과 접근성")],
            ["storage", t("로컬 저장과 복구")],
            ["about", t("COI에 대하여")],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
              <ArrowUpRight size={13} />
            </button>
          ))}
        </nav>
        <section className="settings-body">
          {tab === "engines" ? (
            <>
              <h3>{t("나의 AI 도구")}</h3>
              <p className="subtle">
                {t(
                  "사용 중인 공식 CLI를 연결해요. COI 자체 계정은 없으며 인증 정보는 수집하지 않아요.",
                )}
              </p>
              {installManifest.providers.map((p) => {
                const d = s.detections.find((d) => d.provider === p.id);
                return (
                  <div className="engine-row" key={p.id}>
                    <span className={`provider-icon ${p.id}`}>
                      {p.monogram}
                    </span>
                    <div>
                      <b>{p.name}</b>
                      <small>{d?.version ?? t("감지되지 않음")}</small>
                      <small>{p.phase}</small>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => s.setGuide(p.id)}
                    >
                      {t("설치 안내")}
                    </button>
                  </div>
                );
              })}
              <button
                className="text-button"
                onClick={() => void s.detect()}
                disabled={s.detecting}
              >
                <RefreshCw size={14} />
                {s.detecting ? t("확인 중…") : t("다시 확인")}
              </button>
              <div className="notice">
                <ShieldCheck size={18} />
                <p>
                  {t(
                    "인증 상태가 ‘알 수 없음’이어도 미인증을 뜻하지 않아요. 실제 CLI 실행은 OS·버전별 권한 검증을 통과한 뒤에 활성화해요.",
                  )}
                </p>
              </div>
            </>
          ) : tab === "appearance" ? (
            <>
              <h3>{t("편안한 작업 환경")}</h3>
              <LanguageSelect />
              <label className="setting-row">
                <span>
                  <b>{t("움직임 줄이기")}</b>
                  <small>{t("캐릭터 호흡과 화면 전환을 즉시 표시해요.")}</small>
                </span>
                <input
                  type="checkbox"
                  checked={s.settings.reducedMotion}
                  onChange={(e) =>
                    s.updateSettings({ reducedMotion: e.target.checked })
                  }
                />
              </label>
              <label className="setting-row">
                <span>
                  <b>{t("높은 대비")}</b>
                  <small>{t("텍스트와 경계선을 더 선명하게 표시해요.")}</small>
                </span>
                <input
                  type="checkbox"
                  checked={s.settings.highContrast}
                  onChange={(e) =>
                    s.updateSettings({ highContrast: e.target.checked })
                  }
                />
              </label>
              <label className="setting-row">
                <span>
                  <b>{t("대사 표시")}</b>
                  <small>{t("읽는 속도에 맞춰 선택해요.")}</small>
                </span>
                <select
                  value={s.settings.textSpeed}
                  onChange={(e) =>
                    s.updateSettings({
                      textSpeed: e.target.value as
                        "instant" | "normal" | "slow",
                    })
                  }
                >
                  <option value="instant">{t("즉시")}</option>
                  <option value="normal">{t("보통")}</option>
                  <option value="slow">{t("천천히")}</option>
                </select>
              </label>
              <label className="field-label">
                {t("COI가 부를 이름")}
                <input
                  className="text-input"
                  value={s.settings.displayName}
                  onChange={(e) =>
                    s.updateSettings({
                      displayName: e.target.value.slice(0, 30),
                    })
                  }
                />
              </label>
              <button
                className="secondary"
                onClick={() => {
                  s.openSettings(false);
                  s.setPanel(
                    s.panel === "collapsed" ? "companion" : "collapsed",
                  );
                }}
              >
                {t("Focus 모드 전환")}
                <kbd>⌘ ⇧ F</kbd>
              </button>
            </>
          ) : tab === "storage" ? (
            <>
              <h3>{t("이 컴퓨터에만 보관해요")}</h3>
              <p className="subtle">
                {native
                  ? t("SQLite에 대화와 설정을 저장해요.")
                  : t(
                      "브라우저 Demo는 이 브라우저의 로컬 저장소를 사용해요.",
                    )}{" "}
                {t("원격 동기화나 자동 업로드는 없어요.")}
              </p>
              {storage && (
                <div className="storage-stats">
                  <span>
                    <b>{s.sessions.length}</b>
                    {t("세션")}
                  </span>
                  <span>
                    <b>{storage.tasks}</b>
                    {t("작업 사본")}
                  </span>
                  <span>
                    <b>{storage.applications}</b>
                    {t("적용 기록")}
                  </span>
                </div>
              )}
              <h4>{t("변경 적용과 복구")}</h4>
              {records.length ? (
                records.map((r) => (
                  <div className="recovery-row" key={r.id}>
                    <div>
                      <b>{r.projectName}</b>
                      <small>
                        {r.state === "applied"
                          ? t("원본 적용 완료")
                          : t("미완료 거래 · 복구 필요")}
                      </small>
                    </div>
                    <button
                      className="secondary"
                      onClick={() =>
                        void (
                          r.state === "applied"
                            ? bridge.undo(r.id)
                            : bridge.recover(r.id)
                        )
                          .then(async () => {
                            setRecords(records.filter((x) => x.id !== r.id));
                            for (const session of s.sessions)
                              if (session.applicationId === r.id)
                                s.setApplication(session.id, undefined);
                            setTasks(await bridge.tasks());
                            s.notify(t("원본을 복구했어요."));
                          })
                          .catch((e) => s.notify(String(e)))
                      }
                    >
                      <RotateCcw size={13} />
                      {t("복구")}
                    </button>
                  </div>
                ))
              ) : (
                <p className="empty-inline">
                  {t("아직 원본에 적용한 변경이 없어요.")}
                </p>
              )}
              <p className="footnote">
                {t(
                  "후속 편집이 있으면 복구를 중단해요. 미적용 변경은 자동 삭제하지 않아요. 정리를 예약한 사본과 백업은 30일 뒤 앱 시작 시 정리해요.",
                )}
              </p>
              <h4>{t("저장된 이야기")}</h4>
              <p className="footnote">
                {t(
                  "이야기를 삭제해도 프로젝트 원본과 작업 사본·복구 기록은 유지돼요.",
                )}
              </p>
              {s.sessions.map((session) => (
                <div className="recovery-row" key={session.id}>
                  <div>
                    <b>{session.title}</b>
                    <small>
                      {session.messages.length}
                      {t("개 요청")}
                    </small>
                  </div>
                  <button
                    className="secondary"
                    disabled={!!s.activeRunId}
                    onClick={() =>
                      setDiscard({
                        kind: "session",
                        id: session.id,
                        name: session.title,
                      })
                    }
                  >
                    {t("이야기 삭제")}
                  </button>
                </div>
              ))}
              {native && (
                <>
                  <h4>{t("작업 사본 관리")}</h4>
                  <p className="footnote">
                    {t(
                      "끝난 작업은 30일 뒤 정리를 예약할 수 있어요. 미적용 변경과 미완료 복구 거래는 자동 정리에서 보호해요. 사본 열기·변경 검토·복구는 예약을 해제해요.",
                    )}
                  </p>
                  {tasks.length ? (
                    tasks.map((task) => (
                      <div className="recovery-row" key={task.id}>
                        <div>
                          <b>{task.projectName}</b>
                          <small>
                            {task.fileCount}
                            {t("개 파일 ·")}
                            {task.id.slice(0, 8)}
                            {!task.canDiscard ? t(" · 복구 후 삭제 가능") : ""}
                          </small>
                          <small>
                            {task.retention.state === "open"
                              ? t("기한 없이 보관 중")
                              : task.retention.state === "protected"
                                ? systemText(task.retention.reason ?? "")
                                : task.retention.state === "expired"
                                  ? t("보존 기한 만료 · 다음 정리 시 삭제")
                                  : t("{0} 이후 사본·백업 정리", [
                                      new Date(
                                        (task.retention.expiresAt ?? 0) * 1000,
                                      ).toLocaleDateString(
                                        useLocale.getState().locale,
                                      ),
                                    ])}
                          </small>
                        </div>
                        <button
                          className="secondary"
                          disabled={maintaining || !!s.activeRunId}
                          onClick={() => {
                            if (task.retention.state === "open")
                              setClosing(task);
                            else {
                              setMaintaining(true);
                              void bridge
                                .reopenTask(task.id)
                                .then(async () => {
                                  setTasks(await bridge.tasks());
                                  s.notify(
                                    t("정리 예약을 해제하고 계속 보관해요."),
                                  );
                                })
                                .catch((e) => s.notify(String(e)))
                                .finally(() => setMaintaining(false));
                            }
                          }}
                        >
                          {task.retention.state === "open"
                            ? t("30일 뒤 정리")
                            : t("계속 보관")}
                        </button>
                        <button
                          className="secondary"
                          disabled={!task.canDiscard || !!s.activeRunId}
                          onClick={() =>
                            setDiscard({
                              kind: "task",
                              id: task.id,
                              name: task.projectName,
                            })
                          }
                        >
                          {t("사본 삭제")}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="empty-inline">
                      {t("보관 중인 작업 사본이 없어요.")}
                    </p>
                  )}
                  {closing && (
                    <div className="delete-confirm" role="alert">
                      <b>
                        “{closing.projectName}
                        {t("” 작업을 닫고 30일 뒤 정리할까요?")}
                      </b>
                      <p>
                        {t(
                          "정리 후에는 이 사본과 적용 백업으로 되돌릴 수 없어요. 대화와 프로젝트 원본은 유지해요. 미적용 변경이 있으면 예약하지 않아요.",
                        )}
                      </p>
                      <div className="apply-actions">
                        <button
                          className="secondary"
                          disabled={maintaining}
                          onClick={() => setClosing(null)}
                        >
                          {t("취소")}
                        </button>
                        <button
                          className="secondary"
                          disabled={maintaining}
                          onClick={() => {
                            setMaintaining(true);
                            void bridge
                              .closeTask(closing.id)
                              .then(async () => {
                                setTasks(await bridge.tasks());
                                setClosing(null);
                                s.notify(
                                  t(
                                    "30일 뒤 정리를 예약했어요. 그전에 계속 보관으로 바꿀 수 있어요.",
                                  ),
                                );
                              })
                              .catch((e) => s.notify(String(e)))
                              .finally(() => setMaintaining(false));
                          }}
                        >
                          {maintaining
                            ? t("확인 중…")
                            : t("확인하고 정리 예약")}
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    className="secondary"
                    disabled={maintaining || !!s.activeRunId}
                    onClick={() => {
                      setMaintaining(true);
                      void bridge
                        .cleanupExpired()
                        .then(async (report) => {
                          for (const id of report.removedTaskIds)
                            s.forgetTask(id);
                          setTasks(await bridge.tasks());
                          setRecords(await bridge.recoveries());
                          setStorage(await bridge.storageInfo());
                          s.notify(
                            t("{0}개 정리 · {1}개 보호 중", [
                              report.removedTaskIds.length,
                              report.protectedCount,
                            ]),
                          );
                        })
                        .catch((e) => s.notify(String(e)))
                        .finally(() => setMaintaining(false));
                    }}
                  >
                    {t("기한 지난 예약 정리")}
                  </button>
                </>
              )}
              {discard && (
                <div className="delete-confirm" role="alert">
                  <b>
                    “{discard.name}”{" "}
                    {discard.kind === "session"
                      ? t("이야기를")
                      : t("사본과 미적용 변경을")}{" "}
                    {t("영구 삭제할까요?")}
                  </b>
                  <p>
                    {t(
                      "이 동작은 되돌릴 수 없어요. 프로젝트 원본과 CLI 인증은 변경되지 않아요.",
                    )}
                  </p>
                  <div className="apply-actions">
                    <button
                      className="secondary"
                      disabled={deleting}
                      onClick={() => setDiscard(null)}
                    >
                      {t("취소")}
                    </button>
                    <button
                      className="secondary"
                      disabled={deleting}
                      onClick={() => {
                        setDeleting(true);
                        void (async () => {
                          try {
                            if (discard.kind === "session")
                              s.deleteSession(discard.id);
                            else {
                              await bridge.discardTask(discard.id);
                              s.forgetTask(discard.id);
                            }
                            setDiscard(null);
                            setTasks(await bridge.tasks());
                            setStorage(await bridge.storageInfo());
                            s.notify(t("선택한 로컬 데이터를 삭제했어요."));
                          } catch (e) {
                            s.notify(String(e));
                          } finally {
                            setDeleting(false);
                          }
                        })();
                      }}
                    >
                      {deleting ? t("삭제 중…") : t("확인하고 영구 삭제")}
                    </button>
                  </div>
                </div>
              )}
              <button
                className="secondary"
                onClick={() =>
                  void bridge.exportDiagnostics().then(setDiagnostics)
                }
              >
                {t("진단 내용 미리보기")}
              </button>
              {diagnostics && (
                <>
                  <pre className="diagnostics">{diagnostics}</pre>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (native) {
                        void bridge
                          .saveDiagnostics()
                          .then((saved) => {
                            if (saved) s.notify(t("진단 파일을 저장했어요."));
                          })
                          .catch((e) => s.notify(String(e)));
                        return;
                      }
                      const url = URL.createObjectURL(
                        new Blob([diagnostics], { type: "application/json" }),
                      );
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "coi-diagnostics.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download size={14} />
                    {t("진단 파일 저장")}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <img
                className="about-logo"
                src="/coi/sd/app-icon.png"
                alt="COI"
                width="73"
                height="73"
              />
              <h3>
                COI <span className="tag">0.1.0 DEV</span>
              </h3>
              <p>
                {t("코딩의 모든 순간, 곁에서.")}
                <br />
                Coding Organizing Intelligence
              </p>
              <p className="subtle">
                {t(
                  "자체 로그인·결제·계정 서버·원격 추적이 없는 오픈소스 개발 파트너입니다. 소스 코드는 Apache-2.0입니다.",
                )}
              </p>
              <p className="footnote">
                {t(
                  "캐릭터는 제공된 참고 시트를 바탕으로 만든 생성 이미지 초안입니다. 배포 전 자산 권리와 일관성 검수가 필요합니다.",
                )}
              </p>
              <button
                className="secondary"
                onClick={() =>
                  void bridge
                    .dependencyNotices()
                    .then(setNotices)
                    .catch((e) => s.notify(String(e)))
                }
              >
                {t("Git 구성요소 라이선스 보기")}
              </button>
              {notices && (
                <pre
                  className="diagnostics"
                  aria-label={t("Git 구성요소 라이선스")}
                >
                  {notices}
                </pre>
              )}
              <button
                className="secondary"
                onClick={() => {
                  s.openSettings(false);
                  s.setStage("introduction");
                }}
              >
                {t("COI 소개 다시 보기")}
              </button>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
