import { t } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { bridge, type GitStatus } from "../lib/bridge";

export function GitPanel({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [staged, setStaged] = useState(false);
  const [patch, setPatch] = useState("");
  const [revision, refresh] = useState(0);
  const request = useRef(0);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    setSelected("");
    setPatch("");
    request.current += 1;
    void bridge
      .gitStatus(projectId)
      .then((data) => {
        if (live) setStatus(data);
      })
      .catch((e) => {
        if (live) setError(String(e));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
      request.current += 1;
    };
  }, [projectId, revision]);
  const open = async (path: string, index: boolean) => {
    const id = ++request.current;
    setSelected(path);
    setStaged(index);
    setBusy(true);
    setPatch("");
    setError("");
    try {
      const diff = await bridge.gitDiff(projectId, path, index);
      if (id === request.current) setPatch(diff);
    } catch (e) {
      if (id === request.current) setError(String(e));
    } finally {
      if (id === request.current) setBusy(false);
    }
  };
  return (
    <section className="git-panel" aria-label={t("Git 변경 조회")}>
      <header>
        <b>{status?.branch ?? t("Git 변경")}</b>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => refresh((v) => v + 1)}
        >
          <RefreshCw size={13} />
          {t("새로고침")}
        </button>
      </header>
      <p className="footnote">
        {t(
          "원본 저장소를 조회해요. 다음 커밋을 위해 준비한 변경(스테이징)과 작업 파일의 추가 변경을 구분해요. COI 사본의 변경 비교와는 기준이 달라요. 인증·설정·제외 경로와 하위 모듈은 표시하지 않아요.",
        )}
      </p>
      {busy && <p role="status">{t("Git 변경을 읽고 있어요…")}</p>}
      {error && (
        <p className="native-error" role="alert">
          {error}
        </p>
      )}
      {status && !status.repository && (
        <p className="empty-inline">{t("이 폴더에는 Git 저장소가 없어요.")}</p>
      )}
      {status?.repository && !status.files.length && !busy && !error && (
        <p className="empty-inline">{t("조회 범위에 변경된 파일이 없어요.")}</p>
      )}
      {status?.files.map((file) => (
        <div className="git-file" key={file.path}>
          <b>{file.path}</b>
          {file.conflicted && <span className="tag">{t("충돌")}</span>}
          {file.index.trim() && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void open(file.path, true)}
            >
              {t("스테이징")}
              {file.index}
            </button>
          )}
          {file.worktree.trim() && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void open(file.path, false)}
            >
              {file.worktree === "?"
                ? t("새 파일")
                : t("작업 파일 {0}", [file.worktree])}
            </button>
          )}
        </div>
      ))}
      {selected && (
        <>
          <h4>
            {selected} · {staged ? t("HEAD → 인덱스") : t("인덱스 → 작업 파일")}
          </h4>
          {!busy && !error && (
            <pre className="git-patch" aria-label="Git diff">
              {patch || t("표시할 텍스트 변경이 없어요.")}
            </pre>
          )}
        </>
      )}
    </section>
  );
}
