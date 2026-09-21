import { t, useLocale } from "./i18n";
import type { ProviderCapabilities, ProviderId } from "./execution";
import { invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";
import {
  type ApprovalRef,
  type CoiEvent,
  type Decision,
  type DetectionResult,
  redact,
} from "@coi/protocol";
let localeInFlight: Promise<void> | undefined;
let nativeLocale: string | undefined;
async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const locale = useLocale.getState().locale;
  if (nativeLocale !== locale || !localeInFlight) {
    nativeLocale = locale;
    localeInFlight = tauriInvoke<void>("set_locale", { locale }).catch(
      (error) => {
        nativeLocale = undefined;
        throw error;
      },
    );
  }
  await localeInFlight;
  return tauriInvoke<T>(command, args);
}
export const native = isTauri();
export interface Project {
  id: string;
  name: string;
  root: string;
}
export interface FileEntry {
  path: string;
  size: number;
}
export interface ChangeFile {
  path: string;
  before: string | null;
  after: string | null;
  beforeHash: string | null;
  afterHash: string | null;
  supported: boolean;
  reason: string | null;
}
export interface ChangeSet {
  id: string;
  taskCopyId: string;
  files: ChangeFile[];
  status: string;
}
export interface TaskCopy {
  id: string;
  projectId: string;
  fileCount: number;
  totalBytes: number;
  omitted: string[];
}
export interface Recovery {
  id: string;
  state: string;
  projectName: string;
}
export interface GitStatus {
  repository: boolean;
  branch: string | null;
  files: {
    path: string;
    index: string;
    worktree: string;
    conflicted: boolean;
  }[];
}
export interface TaskSummary {
  id: string;
  projectName: string;
  fileCount: number;
  totalBytes: number;
  canDiscard: boolean;
  retention: {
    state: "open" | "scheduled" | "expired" | "protected";
    expiresAt: number | null;
    reason: string | null;
  };
}
export interface NativeRun {
  id: string;
  sessionId: string;
  projectId: string;
  taskCopyId: string;
  mode: "plan" | "review_copy";
  status: string;
  seq: number;
  threadId: string | null;
  turnId: string | null;
  provider: ProviderId;
  model: string | null;
  effort: string | null;
  requestMessageId: string | null;
  conversationKey: string | null;
}
export const bridge = {
  async setupProvider(provider: ProviderId): Promise<DetectionResult> {
    if (!native)
      throw new Error(t("자동 연결은 COI 데스크톱 앱에서 사용할 수 있어요."));
    return invoke("setup_provider", { provider });
  },
  async capabilities(provider: ProviderId): Promise<ProviderCapabilities> {
    if (!native)
      throw new Error(t("CLI 설정은 COI 데스크톱 앱에서 연결할 수 있어요."));
    return invoke("provider_capabilities", { provider });
  },
  async startRun(
    input: {
      sessionId: string;
      projectId: string;
      taskCopyId: string;
      mode: "plan" | "review_copy";
      provider: ProviderId;
      model: string;
      effort: string;
      requestMessageId: string;
      conversationKey: string;
    },
    prompt: string,
  ): Promise<NativeRun> {
    if (!native)
      throw new Error(
        t(
          "브라우저에서는 실제 CLI를 실행할 수 없어요. 데스크톱의 호환성 검증이 필요해요.",
        ),
      );
    return invoke("start_run", { input, prompt });
  },
  async nativeRuns(sessionId: string): Promise<NativeRun[]> {
    return native ? invoke("list_native_runs", { sessionId }) : [];
  },
  async runEvents(runId: string, afterSeq = 0): Promise<CoiEvent[]> {
    return invoke("read_run_events", { runId, afterSeq });
  },
  async resolveRunApproval(
    runId: string,
    reference: ApprovalRef,
    decision: Decision,
  ): Promise<void> {
    return invoke("resolve_run_approval", {
      decision: { runId, reference, decision },
    });
  },
  async cancelRun(runId: string): Promise<void> {
    return invoke("cancel_run", { runId });
  },
  async load(): Promise<string | null> {
    return native
      ? invoke("load_snapshot")
      : localStorage.getItem("coi.snapshot.v1");
  },
  async save(data: string) {
    if (native) await invoke("save_snapshot", { data });
    else
      localStorage.setItem(
        "coi.snapshot.v1",
        JSON.stringify(JSON.parse(data), (_key, value) =>
          typeof value === "string" ? redact(value) : value,
        ),
      );
  },
  async detect(): Promise<DetectionResult[]> {
    return native
      ? invoke("detect_providers")
      : ["codex", "claude", "antigravity"].map(
          (provider) =>
            ({
              provider,
              executable: null,
              version: null,
              authStatus: "unknown",
              compatibility: "unverified",
              reason: t("브라우저 체험에서는 로컬 CLI를 검사하지 않아요."),
            }) as DetectionResult,
        );
  },
  async pickProject(): Promise<Project | null> {
    if (!native)
      throw new Error(
        t(
          "프로젝트 폴더는 데스크톱 앱에서 열 수 있어요. 여기서는 Demo를 체험해 주세요.",
        ),
      );
    return invoke("pick_project");
  },
  async files(projectId: string): Promise<FileEntry[]> {
    return invoke("list_files", { projectId });
  },
  async gitStatus(projectId: string): Promise<GitStatus> {
    return invoke("git_status", { projectId });
  },
  async gitDiff(
    projectId: string,
    path: string,
    staged: boolean,
  ): Promise<string> {
    return invoke("git_diff", { projectId, path, staged });
  },
  async readFile(projectId: string, path: string): Promise<string> {
    return invoke("read_file", { projectId, path });
  },
  async readImage(projectId: string, path: string): Promise<string> {
    return invoke("read_image", { projectId, path });
  },
  async prepare(projectId: string): Promise<TaskCopy> {
    return invoke("prepare_task", { projectId });
  },
  async revealTask(taskCopyId: string): Promise<void> {
    return invoke("reveal_task", { taskCopyId });
  },
  async changes(taskCopyId: string): Promise<ChangeSet> {
    return invoke("collect_changes", { taskCopyId });
  },
  async apply(changeSetId: string): Promise<string> {
    return invoke("apply_changes", { changeSetId });
  },
  async undo(applicationId: string): Promise<void> {
    return invoke("undo_application", { applicationId });
  },
  async recoveries(): Promise<Recovery[]> {
    return native ? invoke("list_recoveries") : [];
  },
  async recover(applicationId: string): Promise<void> {
    return invoke("recover_application", { applicationId });
  },
  async storageInfo(): Promise<{
    sessions: number;
    tasks: number;
    applications: number;
    bytes: number;
  }> {
    return native
      ? invoke("storage_info")
      : {
          sessions: 0,
          tasks: 0,
          applications: 0,
          bytes: new Blob([localStorage.getItem("coi.snapshot.v1") ?? ""]).size,
        };
  },
  async tasks(): Promise<TaskSummary[]> {
    return native ? invoke("list_tasks") : [];
  },
  async discardTask(taskCopyId: string): Promise<void> {
    await invoke("discard_task", { taskCopyId });
  },
  async closeTask(taskCopyId: string): Promise<void> {
    await invoke("close_task", { taskCopyId });
  },
  async reopenTask(taskCopyId: string): Promise<void> {
    await invoke("reopen_task", { taskCopyId });
  },
  async cleanupExpired(): Promise<{
    removedTaskIds: string[];
    protectedCount: number;
  }> {
    return native
      ? invoke("cleanup_expired")
      : { removedTaskIds: [], protectedCount: 0 };
  },
  async exportDiagnostics(): Promise<string> {
    return native
      ? invoke("export_diagnostics")
      : JSON.stringify(
          {
            app: "COI",
            version: "0.1.0",
            mode: "browser-demo",
            platform: navigator.platform,
          },
          null,
          2,
        );
  },
  async saveDiagnostics(): Promise<boolean> {
    return invoke("save_diagnostics");
  },
  async dependencyNotices(): Promise<string> {
    if (native) return invoke("dependency_notices");
    const files = [
      "git2-LICENSE-MIT.txt",
      "libgit2-AUTHORS.txt",
      "libgit2-COPYING.txt",
      "zlib-LICENSE.txt",
    ];
    return (
      await Promise.all(
        files.map(async (file) => {
          const response = await fetch(`/licenses/${file}`);
          if (!response.ok)
            throw new Error(t("라이선스 문서를 읽을 수 없어요."));
          return response.text();
        }),
      )
    ).join("\n\n");
  },
};
