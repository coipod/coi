pub mod adapters;
mod i18n;
pub mod protocol;
pub mod runs;
pub mod storage;
pub mod workspace;
pub type Result<T> = std::result::Result<T, String>;
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{Manager, State, WebviewWindow};
struct Core {
    store: Arc<Mutex<storage::Store>>,
    runs: runs::RunManager,
    workspace: Mutex<workspace::Workspace>,
    _ownership: storage::ownership::AppLock,
    mutations: Mutex<()>,
}
fn workspace_guard(state: &Core) -> Result<std::sync::MutexGuard<'_, ()>> {
    let guard = state
        .mutations
        .lock()
        .map_err(|_| "workspace mutation lock")?;
    state
        .store
        .lock()
        .map_err(|_| "store lock")?
        .ensure_workspace_idle()?;
    Ok(guard)
}
fn main_only(window: &WebviewWindow) -> Result<()> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err(crate::i18n::text("이 창은 COI 권한이 없어요.").into())
    }
}
#[tauri::command]
fn set_locale(locale: String, window: tauri::WebviewWindow) -> Result<()> {
    if window.label() != "main" {
        return Err("Unauthorized window".into());
    }
    i18n::set(&locale);
    window
        .set_title(if i18n::is_japanese() {
            "COI — 一緒に作る作業室"
        } else {
            "COI — Your coding workspace"
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_run(
    window: WebviewWindow,
    mut input: storage::runs::RunInput,
    prompt: String,
) -> Result<storage::runs::NativeRun> {
    main_only(&window)?;
    let handle = window.app_handle().clone();
    if prompt.trim().is_empty() || prompt.len() > 128 * 1024 {
        return Err("invalid prompt".into());
    }
    let prepare_handle = handle.clone();
    let (input, cwd, description) = tauri::async_runtime::spawn_blocking(move || -> Result<_> {
        if !["plan", "review_copy"].contains(&input.mode.as_str()) { return Err("invalid run request".into()); }
        let state = prepare_handle.state::<Core>();
        let _mutation = workspace_guard(&state)?;
        let detection = adapters::detect(&input.provider);
        adapters::gate::require_provider(&input.provider, detection.version.as_deref().unwrap_or(""))?;
        let project = state.store.lock().map_err(|_| "store lock")?.project(&input.project_id)?;
        let cwd = {
            let workspace = state.workspace.lock().map_err(|_| "workspace lock")?;
            if input.task_copy_id.is_empty() { input.task_copy_id = workspace.prepare(&project)?.id; }
            workspace.work_path(&input.task_copy_id, &input.project_id)?
        };
        let scope = match input.provider.as_str() {
            "codex" => crate::i18n::text("사본 범위 안의 셸 명령을 실행할 수 있어요. 외부 파일·네트워크·MCP는 차단돼요."),
            "antigravity" => crate::i18n::text("기존 Antigravity MCP 서버가 로드될 수 있어요. 추가 승인이 필요한 명령·외부 도구 호출은 자동 거절돼요."),
            _ => crate::i18n::text("셸 명령과 외부 도구는 사용할 수 없어요."),
        };
        let description = crate::localized_format!("CLI: {}\n모델: {} · Effort: {}\n\n{}\n\n사본 안의 파일을 {}할 수 있어요. {scope} 원본 적용은 변경 내용을 확인한 뒤 별도로 진행해요.","CLI: {}\nModel: {} · Effort: {}\n\n{}\n\nYou may {} files inside the copy. {scope} Applying to originals is a separate step after reviewing changes.","CLI: {}\nモデル：{} · Effort: {}\n\n{}\n\nコピー内のファイルを{}できます。{scope} 元のファイルへの適用は、変更を確認してから別途行います。", input.provider, input.model.as_deref().unwrap_or(""), input.effort.as_deref().unwrap_or(crate::i18n::text("기본")), cwd.display(), if input.mode == "plan" { crate::i18n::text("읽기") } else { crate::i18n::text("읽고 수정") });
        Ok((input, cwd, description))
    }).await.map_err(|e| e.to_string())??;
    let decision = rfd::AsyncMessageDialog::new()
        .set_parent(&window)
        .set_title(crate::i18n::text("COI · 실행 범위 확인"))
        .set_description(description)
        .set_buttons(rfd::MessageButtons::OkCancel)
        .show()
        .await;
    if decision != rfd::MessageDialogResult::Ok {
        return Err(crate::i18n::text("실행을 시작하지 않았어요.").into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<Core>();
        let _mutation = workspace_guard(&state)?;
        let workspace = state
            .workspace
            .lock()
            .map_err(|_| "workspace lock")?
            .clone();
        if workspace.work_path(&input.task_copy_id, &input.project_id)? != cwd {
            return Err(crate::i18n::text("작업 사본이 변경됐어요. 다시 요청해 주세요.").into());
        }
        state.runs.start(input, prompt, cwd, Some(workspace))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn resolve_run_approval(
    window: WebviewWindow,
    decision: runs::ApprovalDecision,
) -> Result<()> {
    main_only(&window)?;
    // Acknowledgement is bounded by the worker; do not block the UI thread.
    let handle = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || handle.state::<Core>().runs.decide(decision))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn cancel_run(window: WebviewWindow, state: State<Core>, run_id: String) -> Result<()> {
    main_only(&window)?;
    state.runs.cancel(&run_id)
}
#[tauri::command]
fn list_native_runs(
    window: WebviewWindow,
    state: State<Core>,
    session_id: String,
) -> Result<Vec<storage::runs::NativeRun>> {
    main_only(&window)?;
    state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .native_runs(&session_id)
}
#[tauri::command]
fn read_run_events(
    window: WebviewWindow,
    state: State<Core>,
    run_id: String,
    after_seq: u64,
) -> Result<Vec<protocol::Event>> {
    main_only(&window)?;
    state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .run_events(&run_id, after_seq)
}
#[tauri::command]
fn load_snapshot(window: WebviewWindow, state: State<Core>) -> Result<Option<String>> {
    main_only(&window)?;
    state.store.lock().map_err(|e| e.to_string())?.snapshot()
}
#[tauri::command]
async fn save_snapshot(window: WebviewWindow, state: State<'_, Core>, data: String) -> Result<()> {
    main_only(&window)?;
    let store = state.store.clone();
    tauri::async_runtime::spawn_blocking(move || {
        store.lock().map_err(|e| e.to_string())?.save(&data)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn provider_capabilities(
    window: WebviewWindow,
    provider: String,
) -> Result<adapters::capabilities::Capabilities> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || adapters::capabilities::discover(&provider))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn setup_provider(window: WebviewWindow, provider: String) -> Result<adapters::Detection> {
    main_only(&window)?;
    let cache = window
        .app_handle()
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("setup");
    tauri::async_runtime::spawn_blocking(move || {
        adapters::setup::setup(&provider, &cache, |progress| {
            use tauri::Emitter;
            let _ = window.emit("provider-setup-progress", progress);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn detect_providers(window: WebviewWindow) -> Result<Vec<adapters::Detection>> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(adapters::detect_all)
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn pick_project(
    window: WebviewWindow,
    state: State<'_, Core>,
) -> Result<Option<storage::Project>> {
    main_only(&window)?;
    let folder = rfd::AsyncFileDialog::new()
        .set_title(crate::i18n::text("COI와 함께 작업할 폴더"))
        .pick_folder()
        .await;
    if let Some(folder) = folder {
        state
            .store
            .lock()
            .map_err(|e| e.to_string())?
            .register(folder.path())
            .map(Some)
    } else {
        Ok(None)
    }
}
#[tauri::command]
async fn git_status(
    window: WebviewWindow,
    state: State<'_, Core>,
    project_id: String,
) -> Result<workspace::GitStatus> {
    main_only(&window)?;
    let project = state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .project(&project_id)?;
    let data = state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .data
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        workspace::Workspace { data }.git_status(Path::new(&project.root))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn git_diff(
    window: WebviewWindow,
    state: State<'_, Core>,
    project_id: String,
    path: String,
    staged: bool,
) -> Result<String> {
    main_only(&window)?;
    let project = state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .project(&project_id)?;
    let data = state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .data
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        workspace::Workspace { data }.git_diff(Path::new(&project.root), &path, staged)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn list_files(
    window: WebviewWindow,
    state: State<Core>,
    project_id: String,
) -> Result<Vec<workspace::FileEntry>> {
    main_only(&window)?;
    let p = state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .project(&project_id)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .scan(Path::new(&p.root))
        .map(|p| p.0)
}
#[tauri::command]
fn read_file(
    window: WebviewWindow,
    state: State<Core>,
    project_id: String,
    path: String,
) -> Result<String> {
    main_only(&window)?;
    let p = state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .project(&project_id)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .read(Path::new(&p.root), &path)
}
#[tauri::command]
fn read_image(
    window: WebviewWindow,
    state: State<Core>,
    project_id: String,
    path: String,
) -> Result<String> {
    main_only(&window)?;
    let p = state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .project(&project_id)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .read_image(Path::new(&p.root), &path)
}
#[tauri::command]
fn prepare_task(
    window: WebviewWindow,
    state: State<Core>,
    project_id: String,
) -> Result<workspace::TaskCopy> {
    main_only(&window)?;
    let _mutation = workspace_guard(&state)?;
    let p = state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .project(&project_id)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .prepare(&p)
}
#[tauri::command]
fn reveal_task(window: WebviewWindow, state: State<Core>, task_copy_id: String) -> Result<()> {
    main_only(&window)?;
    let ws = state.workspace.lock().map_err(|e| e.to_string())?;
    ws.reopen_task(&task_copy_id)?;
    open::that(ws.data.join("tasks").join(task_copy_id).join("work")).map_err(|e| e.to_string())
}
#[tauri::command]
fn collect_changes(
    window: WebviewWindow,
    state: State<Core>,
    task_copy_id: String,
) -> Result<workspace::ChangeSet> {
    main_only(&window)?;
    let _mutation = workspace_guard(&state)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .collect(&task_copy_id)
}
#[tauri::command]
fn apply_changes(
    window: WebviewWindow,
    state: State<Core>,
    change_set_id: String,
) -> Result<String> {
    main_only(&window)?;
    let _mutation = workspace_guard(&state)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .apply(&change_set_id)
}
#[tauri::command]
fn undo_application(
    window: WebviewWindow,
    state: State<Core>,
    application_id: String,
) -> Result<()> {
    main_only(&window)?;
    let _mutation = workspace_guard(&state)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .undo(&application_id, false)
}
#[tauri::command]
fn recover_application(
    window: WebviewWindow,
    state: State<Core>,
    application_id: String,
) -> Result<()> {
    main_only(&window)?;
    let _mutation = workspace_guard(&state)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .undo(&application_id, true)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Recovery {
    id: String,
    state: String,
    project_name: String,
}
#[tauri::command]
fn list_recoveries(window: WebviewWindow, state: State<Core>) -> Result<Vec<Recovery>> {
    main_only(&window)?;
    Ok(state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .journals()?
        .into_iter()
        .filter(|j| {
            matches!(
                j.state.as_str(),
                "applying" | "recovery_required" | "reverting" | "applied"
            )
        })
        .map(|j| Recovery {
            id: j.id,
            state: j.state,
            project_name: j.project_name,
        })
        .collect())
}
#[derive(Serialize)]
struct StorageInfo {
    sessions: usize,
    tasks: usize,
    applications: usize,
    bytes: u64,
}
#[tauri::command]
fn storage_info(window: WebviewWindow, state: State<Core>) -> Result<StorageInfo> {
    main_only(&window)?;
    let ws = state.workspace.lock().map_err(|e| e.to_string())?;
    let tasks = std::fs::read_dir(ws.data.join("tasks"))
        .map_err(|e| e.to_string())?
        .count();
    let applications = ws.journals()?.len();
    let bytes = ignore::Walk::new(&ws.data)
        .filter_map(|e| e.ok())
        .filter_map(|e| e.metadata().ok())
        .filter(|m| m.is_file())
        .map(|m| m.len())
        .sum();
    Ok(StorageInfo {
        sessions: state
            .store
            .lock()
            .map_err(|e| e.to_string())?
            .session_count(),
        tasks,
        applications,
        bytes,
    })
}
#[tauri::command]
fn list_tasks(window: WebviewWindow, state: State<Core>) -> Result<Vec<workspace::TaskSummary>> {
    main_only(&window)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .task_summaries()
}
#[tauri::command]
fn discard_task(window: WebviewWindow, state: State<Core>, task_copy_id: String) -> Result<()> {
    main_only(&window)?;
    let _mutation = workspace_guard(&state)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .discard_task(&task_copy_id)
}
#[tauri::command]
fn close_task(window: WebviewWindow, state: State<Core>, task_copy_id: String) -> Result<()> {
    main_only(&window)?;
    let _mutation = workspace_guard(&state)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .close_task(&task_copy_id)
}
#[tauri::command]
fn reopen_task(window: WebviewWindow, state: State<Core>, task_copy_id: String) -> Result<()> {
    main_only(&window)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .reopen_task(&task_copy_id)
}
#[tauri::command]
fn cleanup_expired(window: WebviewWindow, state: State<Core>) -> Result<workspace::CleanupReport> {
    main_only(&window)?;
    let _mutation = workspace_guard(&state)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .cleanup_expired()
}
#[tauri::command]
fn export_diagnostics(window: WebviewWindow) -> Result<String> {
    main_only(&window)?;
    Ok(serde_json::json!({"app":"COI","version":env!("CARGO_PKG_VERSION"),"os":std::env::consts::OS,"arch":std::env::consts::ARCH,"liveExecution":"version-gated; see docs/STATUS.md","rawLogsStored":false}).to_string())
}
#[tauri::command]
fn dependency_notices(window: WebviewWindow) -> Result<String> {
    main_only(&window)?;
    Ok([
        "Third-party dependencies — unchanged upstream notices",
        include_str!("../../public/licenses/pixi-LICENSE-MIT.txt"),
        include_str!("../../public/licenses/git2-LICENSE-MIT.txt"),
        include_str!("../../public/licenses/libgit2-AUTHORS.txt"),
        include_str!("../../public/licenses/libgit2-COPYING.txt"),
        include_str!("../../public/licenses/zlib-LICENSE.txt"),
    ]
    .join("\n\n"))
}
#[tauri::command]
async fn save_diagnostics(window: WebviewWindow) -> Result<bool> {
    let data = export_diagnostics(window)?;
    let file = rfd::AsyncFileDialog::new()
        .set_title(crate::i18n::text("COI 진단 파일 저장"))
        .set_file_name("coi-diagnostics.json")
        .add_filter("JSON", &["json"])
        .save_file()
        .await;
    if let Some(file) = file {
        std::fs::write(file.path(), data).map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Ok(false)
    }
}
#[tauri::command]
fn open_documentation(window: WebviewWindow, provider: String) -> Result<()> {
    main_only(&window)?;
    let url = match provider.as_str() {
        "codex" => "https://learn.chatgpt.com/docs/codex/cli",
        "claude" => "https://code.claude.com/docs/en/quickstart",
        "gemini" => "https://geminicli.com/docs/get-started/installation/",
        "antigravity" => "https://antigravity.google/docs/cli/reference",
        _ => return Err(crate::i18n::text("허용되지 않은 문서").into()),
    };
    open::that(url).map_err(|e| e.to_string())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data: PathBuf = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;
            let ownership =
                storage::ownership::AppLock::acquire(&data).map_err(std::io::Error::other)?;
            let ws = workspace::Workspace::new(data.clone()).map_err(std::io::Error::other)?;
            let store =
                storage::Store::open(&data.join("coi.sqlite3")).map_err(std::io::Error::other)?;
            let store = Arc::new(Mutex::new(store));
            let runs = runs::RunManager::new(store.clone()).map_err(std::io::Error::other)?;
            app.manage(Core {
                store,
                runs,
                workspace: Mutex::new(ws),
                _ownership: ownership,
                mutations: Mutex::new(()),
            });
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(|url| {
                    (url.scheme() == "tauri"
                        && url.host_str() == Some("localhost")
                        && url.port().is_none())
                        || (url.port().is_none()
                            && url.host_str() == Some("tauri.localhost")
                            && matches!(url.scheme(), "http" | "https"))
                        || (cfg!(debug_assertions)
                            && url.scheme() == "http"
                            && matches!(url.host_str(), Some("localhost") | Some("127.0.0.1"))
                            && url.port() == Some(1420))
                })
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_locale,
            start_run,
            resolve_run_approval,
            cancel_run,
            list_native_runs,
            read_run_events,
            load_snapshot,
            save_snapshot,
            detect_providers,
            provider_capabilities,
            setup_provider,
            pick_project,
            git_status,
            git_diff,
            list_files,
            read_file,
            read_image,
            prepare_task,
            collect_changes,
            reveal_task,
            apply_changes,
            undo_application,
            recover_application,
            list_recoveries,
            storage_info,
            list_tasks,
            discard_task,
            close_task,
            reopen_task,
            cleanup_expired,
            export_diagnostics,
            dependency_notices,
            save_diagnostics,
            open_documentation
        ])
        .build(tauri::generate_context!())
        .expect("COI could not start")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<Core>().runs.shutdown();
            }
        });
}
