import { t, systemText } from "../lib/i18n";
import { useState } from "react";
import {
  Copy,
  RefreshCw,
  FolderOpen,
  Check,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { bridge, type ChangeSet, type TaskCopy } from "../lib/bridge";
import { useApp, type Session } from "../stores/app";
import { DiffView } from "./Artifacts";
export function NativeReview({ session }: { session: Session }) {
  const s = useApp();
  const [task, setTask] = useState<TaskCopy | null>(null);
  const [changes, setChanges] = useState<ChangeSet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const prepare = () =>
    act(async () => {
      const t = await bridge.prepare(session.projectId!);
      setTask(t);
      s.setTaskCopy(session.id, t.id);
      setChanges(null);
    });
  const collect = () =>
    act(async () => {
      const c = await bridge.changes(session.taskCopyId!);
      setChanges(c);
      setIndex(0);
      setSeen(c.files.length ? [c.files[0].path] : []);
      setConfirm(false);
    });
  const current = changes?.files[index];
  const canApply =
    !!changes?.files.length &&
    changes.files.every((f) => f.supported && seen.includes(f.path));
  return (
    <section className="native-review">
      <div className="native-review-intro">
        <ShieldCheck size={19} />
        <h3>{t("원본을 지키는 작업 사본")}</h3>
        <p>
          {t(
            "CLI는 작업 사본에서 변경안을 만들어요. 변경 내용을 확인하고 원본에 적용할 수 있어요. 사본을 만드는 동작은 AI를 호출하지 않아요.",
          )}
        </p>
      </div>
      {!session.taskCopyId ? (
        <button
          className="secondary full"
          disabled={busy}
          onClick={() => void prepare()}
        >
          <Copy size={14} />
          {t("작업 사본 만들기")}
        </button>
      ) : (
        <>
          <div className="native-task-actions">
            <button
              className="secondary"
              onClick={() =>
                void act(() => bridge.revealTask(session.taskCopyId!))
              }
            >
              <FolderOpen size={13} />
              {t("사본 폴더 열기")}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void collect()}
            >
              <RefreshCw size={13} />
              {t("변경 확인")}
            </button>
          </div>
          {task && (
            <details className="copy-report">
              <summary>
                {task.fileCount}
                {t("개 파일 ·")}
                {(task.totalBytes / 1024).toFixed(1)} {t("KiB 복사됨")}
              </summary>
              <ul>
                {task.omitted.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
              <p>
                {t(
                  "필요한 파일이 제외되었다면 작업을 시작하지 말고 더 좁은 폴더를 선택해 주세요.",
                )}
              </p>
            </details>
          )}
        </>
      )}
      {error && (
        <p className="native-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p className="footnote">{t("처리 중이에요…")}</p>}
      {changes && (
        <>
          <header className="native-change-summary">
            <b>
              {t("변경")}
              {changes.files.length}
              {t("개")}
            </b>
            <span className="tag">{t("미검증")}</span>
          </header>
          {!changes.files.length ? (
            <p className="footnote">
              {t(
                "아직 사본에 변경이 없어요. 사본 폴더에서 파일을 편집한 후 다시 확인해 주세요.",
              )}
            </p>
          ) : (
            <>
              <select
                aria-label={t("검토할 변경 파일")}
                value={index}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setIndex(i);
                  setSeen((a) => [...new Set([...a, changes.files[i].path])]);
                  setConfirm(false);
                }}
              >
                {changes.files.map((f, i) => (
                  <option key={f.path} value={i}>
                    {seen.includes(f.path) ? "✓ " : ""}
                    {f.path}
                    {!f.supported ? t(" · 적용 불가") : ""}
                  </option>
                ))}
              </select>
              {current && (
                <>
                  <p className="footnote">{current.path}</p>
                  {current.supported ? (
                    <DiffView
                      before={current.before ?? ""}
                      after={current.after ?? ""}
                    />
                  ) : (
                    <p className="native-error">
                      {systemText(current.reason ?? "")}
                    </p>
                  )}
                </>
              )}
              <p className="footnote">
                {t(
                  "모든 변경 파일을 확인한 뒤 적용할 수 있어요. 검토 이후 사본의 추가 수정은 이 변경안에 포함되지 않아요.",
                )}
              </p>
            </>
          )}
          {session.applicationId ? (
            <button
              className="secondary full"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await bridge.undo(session.applicationId!);
                  s.setApplication(session.id, undefined);
                  setChanges(null);
                  s.notify(t("COI가 적용한 변경을 복구했어요."));
                })
              }
            >
              <RotateCcw size={14} />
              {t("적용한 변경 되돌리기")}
            </button>
          ) : (
            canApply && (
              <>
                <label className="apply-confirm">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                  />
                  {t("표시된")}
                  {changes.files.length}
                  {t("개 변경을 원본에 적용할게요.")}
                </label>
                <button
                  className="primary full"
                  disabled={busy || !confirm}
                  onClick={() =>
                    void act(async () => {
                      const id = await bridge.apply(changes.id);
                      s.setApplication(session.id, id);
                      setConfirm(false);
                      s.notify(t("검토한 변경을 원본에 적용했어요."));
                    })
                  }
                >
                  <Check size={14} />
                  {t("원본에 적용")}
                </button>
              </>
            )
          )}
        </>
      )}
      {session.applicationId && !changes && (
        <button
          className="secondary full"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await bridge.undo(session.applicationId!);
              s.setApplication(session.id, undefined);
              s.notify(t("이전 적용 내용을 복구했어요."));
            })
          }
        >
          <RotateCcw size={14} />
          {t("이전 적용 되돌리기")}
        </button>
      )}
    </section>
  );
}
