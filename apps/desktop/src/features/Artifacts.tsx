import { t } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { diffLines } from "diff";
import { SafeMarkdown as Markdown } from "../components/SafeMarkdown";
import {
  FileText,
  ChevronRight,
  FolderOpen,
  GitCompareArrows,
  Code,
  Eye,
  LoaderCircle,
} from "lucide-react";
import { useApp } from "../stores/app";
import { bridge, type FileEntry } from "../lib/bridge";
import { NativeReview } from "./NativeReview";
import { GitPanel } from "./GitPanel";
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
      setFiles([]);
      setSelected("");
      setContent("");
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
  return (
    <div className="artifacts" hidden={hidden}>
      <div className="artifact-breadcrumb">
        <FolderOpen size={14} />
        <span>
          {projectId
            ? s.projects.find((p) => p.id === projectId)?.name
            : t("프로젝트 연결 필요")}
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
      ) : !projectId ? (
        <div className="viewer-empty">
          <FileText size={30} />
          <h3>{t("변경안을 기다리고 있어요")}</h3>
          <p>{t("실행하려면 프로젝트 폴더를 먼저 열어 주세요.")}</p>
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
    </div>
  );
}
