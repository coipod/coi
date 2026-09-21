import { t } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { diffLines } from "diff";
import { SafeMarkdown as Markdown } from "../components/SafeMarkdown";
import {
  FileText,
  ChevronRight,
  FolderOpen,
  Check,
  RotateCcw,
  GitCompareArrows,
  Code,
  Eye,
  LoaderCircle,
} from "lucide-react";
import { useApp } from "../stores/app";
import { bridge, type FileEntry } from "../lib/bridge";
import { NativeReview } from "./NativeReview";
import { GitPanel } from "./GitPanel";
import { sampleBefore, sampleAfter } from "../lib/demo";
export function DiffView({ before, after }: { before: string; after: string }) {
  let oldLine = 0,
    newLine = 0;
  return (
    <div className="diff-view" aria-label={t("변경 비교")}>
      <div className="diff-header">
        <span>{t("이전")}</span>
        <span>{t("변경 후")}</span>
      </div>
      {diffLines(before, after).flatMap((part, pi) =>
        part.value
          .replace(/\n$/, "")
          .split("\n")
          .map((line, li) => {
            if (!part.added) oldLine++;
            if (!part.removed) newLine++;
            return (
              <div
                className={`diff-line ${part.added ? "added" : part.removed ? "removed" : ""}`}
                key={`${pi}-${li}`}
              >
                <span className="line-number">{part.added ? "" : oldLine}</span>
                <span className="line-number">
                  {part.removed ? "" : newLine}
                </span>
                <span className="diff-sign">
                  {part.added ? "+" : part.removed ? "−" : " "}
                </span>
                <code>{line || " "}</code>
              </div>
            );
          }),
      )}
    </div>
  );
}
export function Artifacts({ hidden = false }: { hidden?: boolean }) {
  const s = useApp();
  const session = s.sessions.find((x) => x.id === s.activeId);
  const [tab, setTab] = useState(session?.projectId ? "code" : "diff");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState("README.md");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const fileRequest = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const projectId = session?.projectId;
  useEffect(() => {
    let live = true;
    if (projectId) {
      setLoading(true);
      setFiles([]);
      setContent("");
      setSelected("");
      bridge
        .files(projectId)
        .then((f) => {
          if (live) {
            setFiles(f);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(String(e));
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    } else {
      setFiles([{ path: "README.md", size: sampleAfter().length }]);
      setSelected("README.md");
      setContent(sampleAfter());
      setError("");
    }
    return () => {
      live = false;
    };
  }, [projectId]);
  const open = async (path: string) => {
    const request = ++fileRequest.current;
    setSelected(path);
    setImageUrl("");
    setContent("");
    if (projectId) {
      setLoading(true);
      try {
        const image = /\.(png|jpe?g|webp)$/i.test(path);
        const data = image
          ? await bridge.readImage(projectId, path)
          : await bridge.readFile(projectId, path);
        if (request !== fileRequest.current) return;
        if (image) setImageUrl(data);
        else setContent(data);
        setError("");
        setTab(image ? "preview" : "code");
      } catch (e) {
        if (request === fileRequest.current) setError(String(e));
      } finally {
        if (request === fileRequest.current) setLoading(false);
      }
    }
  };
  const hasArtifact = session?.runs.some((r) =>
    r.events.some((e) => e.kind === "artifact_created"),
  );
  return (
    <div className="artifacts" hidden={hidden}>
      <div className="artifact-breadcrumb">
        <FolderOpen size={14} />
        <span>
          {projectId
            ? s.projects.find((p) => p.id === projectId)?.name
            : "hello-coi"}
        </span>
        <ChevronRight size={12} />
        <b>{selected || t("파일 선택")}</b>
      </div>
      <div className="artifact-tabs" role="tablist" aria-label={t("파일 표시")}>
        {(projectId
          ? ([
              ["code", t("코드"), Code],
              ["preview", t("미리보기"), Eye],
              ["native-review", t("사본 검토"), GitCompareArrows],
              ["git", "Git", GitCompareArrows],
            ] as const)
          : ([
              ["diff", t("변경 비교"), GitCompareArrows],
              ["code", t("코드"), Code],
              ["preview", t("미리보기"), Eye],
            ] as const)
        ).map(([id, label, Icon]) => (
          <button
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
            key={id}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
      {projectId && tab === "git" ? (
        <GitPanel projectId={projectId} />
      ) : projectId && tab === "native-review" ? (
        <NativeReview session={session!} />
      ) : loading ? (
        <div className="viewer-empty">
          <LoaderCircle className="spin" size={22} />
          {t("파일을 읽고 있어요.")}
        </div>
      ) : error ? (
        <div className="viewer-empty">{error}</div>
      ) : !projectId && !hasArtifact ? (
        <div className="viewer-empty">
          <FileText size={30} />
          <h3>{t("변경안을 기다리고 있어요")}</h3>
          <p>{t("Demo 작업을 완료하면 여기서 차이를 볼 수 있어요.")}</p>
        </div>
      ) : (
        <div className="artifact-content">
          {imageUrl ? (
            <figure className="image-preview">
              <img src={imageUrl} alt={selected} />
              <figcaption>
                {selected} {t("· 안전하게 변환한 미리보기")}
              </figcaption>
            </figure>
          ) : tab === "diff" ? (
            <>
              <div className="change-summary">
                <span>README.md</span>
                <span>
                  <i>+2</i>
                  <b>−2</b>
                </span>
              </div>
              <DiffView before={sampleBefore} after={sampleAfter()} />
              <div className="verification-note">
                <Check size={14} />
                {t("예제 인사말 검사 통과")}
                <span>{t("모의 결과")}</span>
              </div>
            </>
          ) : tab === "preview" ? (
            <article className="markdown">
              <Markdown>{content}</Markdown>
            </article>
          ) : (
            <pre className="code-view">
              {content.split("\n").map((line, i) => (
                <div key={i}>
                  <span>{i + 1}</span>
                  <code>{line || " "}</code>
                </div>
              ))}
            </pre>
          )}
        </div>
      )}
      <div className="file-explorer">
        <header>
          <span>{t("프로젝트 파일")}</span>
          <small>
            {files.length}
            {t("개")}
          </small>
        </header>
        <div className="file-list">
          {files.map((f) => (
            <button
              key={f.path}
              className={selected === f.path ? "selected" : ""}
              onClick={() => void open(f.path)}
            >
              <FileText size={14} />
              <span>{f.path}</span>
            </button>
          ))}
        </div>
      </div>
      {!projectId && hasArtifact && (
        <div className="apply-footer">
          <div>
            <span className="tag">DEMO</span>
            <p>
              {session?.demoApplied
                ? t("메모리 예제에 적용했어요.")
                : session?.demoDeclined
                  ? t("변경안을 보관했어요.")
                  : t("검토한 변경을 예제에 적용할까요?")}
            </p>
          </div>
          {session?.demoApplied ? (
            <button className="secondary full" onClick={s.demoUndo}>
              <RotateCcw size={15} />
              {t("되돌리기 체험")}
            </button>
          ) : (
            <div className="apply-actions">
              <button className="secondary" onClick={() => s.demoApply(false)}>
                {t("적용하지 않기")}
              </button>
              <button className="primary" onClick={() => s.demoApply(true)}>
                <Check size={15} />
                {t("예제에 적용")}
              </button>
            </div>
          )}
          <small>{t("실제 원본 파일은 변경되지 않아요.")}</small>
        </div>
      )}
    </div>
  );
}
