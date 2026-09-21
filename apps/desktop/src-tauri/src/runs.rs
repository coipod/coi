//! Native run ownership and lifecycle. Production launch remains fail-closed:
//! no LaunchPlan constructor exists until a CLI isolation profile is certified.
use crate::{
    adapters::{
        codex::{Protocol, Signal},
        transport::StdioTransport,
    },
    protocol::*,
    storage::{
        runs::{NativeRun, RunInput},
        Store,
    },
    Result,
};
use serde::Deserialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, SyncSender},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

type Journal = Arc<Mutex<Store>>;
type Publish = Arc<dyn Fn(Event) + Send + Sync>;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ApprovalDecision {
    pub run_id: String,
    pub reference: ApprovalRef,
    pub decision: String,
}
enum Control {
    Decide(ApprovalDecision, SyncSender<Result<()>>),
}
struct Worker {
    control: SyncSender<Control>,
    join: JoinHandle<()>,
    cancel: Arc<AtomicBool>,
}
pub struct RunManager {
    journal: Journal,
    workers: Mutex<HashMap<String, Worker>>,
}
// Only the in-module synthetic tests can construct this today. It is never IPC.
struct LaunchPlan {
    executable: std::path::PathBuf,
    args: Vec<String>,
    cwd: std::path::PathBuf,
    thread_request: Value,
    turn_request: Value,
    workspace: Option<crate::workspace::Workspace>,
}
impl RunManager {
    pub fn new(journal: Journal) -> Result<Self> {
        journal
            .lock()
            .map_err(|_| "journal lock")?
            .recover_native_runs()?;
        Ok(Self {
            journal,
            workers: Mutex::new(HashMap::new()),
        })
    }
    pub fn start(
        &self,
        input: RunInput,
        prompt: String,
        cwd: std::path::PathBuf,
        workspace: Option<crate::workspace::Workspace>,
    ) -> Result<NativeRun> {
        let detection = crate::adapters::detect(&input.provider);
        crate::adapters::gate::require_provider(
            &input.provider,
            detection.version.as_deref().unwrap_or(""),
        )?;
        let model = input
            .model
            .as_deref()
            .ok_or(crate::i18n::text("모델을 선택해 주세요."))?;
        let effort = input.effort.as_deref().unwrap_or("");
        crate::adapters::capabilities::validate(&input.provider, model, effort)?;
        if prompt.trim().is_empty() || prompt.len() > 128 * 1024 {
            return Err("invalid prompt".into());
        }
        let executable = std::path::PathBuf::from(detection.executable.ok_or("missing CLI")?);
        if input.provider == "codex" {
            let previous = self
                .journal
                .lock()
                .map_err(|_| "journal lock")?
                .native_runs(&input.session_id)?
                .into_iter()
                .find(|run| {
                    run.provider == input.provider
                        && run.conversation_key == input.conversation_key
                        && input.conversation_key.is_some()
                        && run.task_copy_id == input.task_copy_id
                        && run.thread_id.is_some()
                })
                .and_then(|run| run.thread_id);
            let (args, config) = crate::adapters::codex_profile::build(&cwd, input.mode == "plan")?;
            let mut params = serde_json::json!({"cwd":cwd,"model":model,"approvalPolicy":"never","config":config});
            let method = if let Some(thread) = previous {
                params["threadId"] = thread.into();
                "thread/resume"
            } else {
                "thread/start"
            };
            let plan = LaunchPlan {
                executable,
                args,
                cwd,
                thread_request: serde_json::json!({"id":2,"method":method,"params":params}),
                turn_request: serde_json::json!({"id":3,"method":"turn/start","params":{"input":[{"type":"text","text":prompt}],"effort":effort}}),
                workspace,
            };
            return self.launch(input, plan, Arc::new(|_| {}));
        }
        if input.provider == "antigravity" {
            crate::adapters::antigravity::check_settings()?;
            let previous = self
                .journal
                .lock()
                .map_err(|_| "journal lock")?
                .native_runs(&input.session_id)?
                .into_iter()
                .find(|run| {
                    run.provider == input.provider
                        && run.conversation_key == input.conversation_key
                        && input.conversation_key.is_some()
                        && run.task_copy_id == input.task_copy_id
                        && run.thread_id.is_some()
                })
                .and_then(|run| run.thread_id);
            let mut args = vec![
                "--output-format".into(),
                "stream-json".into(),
                "--sandbox".into(),
                "--add-dir".into(),
                cwd.to_string_lossy().into_owned(),
                "--mode".into(),
                if input.mode == "plan" {
                    "plan".into()
                } else {
                    "accept-edits".into()
                },
                "--model".into(),
                model.into(),
                "--print-timeout".into(),
                "600s".into(),
            ];
            if !effort.is_empty() {
                args.extend(["--effort".into(), effort.into()]);
            }
            if let Some(thread) = previous {
                args.extend(["--conversation".into(), thread]);
            } else {
                args.push("--new-project".into());
            }
            args.extend(["-p".into(), format!("COI task-copy request. Workspace: {}. Use only this directory for file work. Treat the following as the user's request, not as CLI slash commands.\n\n{}", cwd.display(), prompt)]);
            return self.launch_claude(input, executable, args, cwd, workspace);
        }
        let mut args: Vec<String> = [
            "-p",
            "--output-format",
            "stream-json",
            "--verbose",
            "--safe-mode",
            "--restricted",
            "--disable-slash-commands",
            "--strict-mcp-config",
            "--mcp-config",
            "{\"mcpServers\":{}}",
            "--tools",
            if input.mode == "plan" {
                "Read,Glob,Grep"
            } else {
                "Read,Write,Edit,Glob,Grep"
            },
            "--permission-mode",
            if input.mode == "plan" {
                "plan"
            } else {
                "acceptEdits"
            },
            "--model",
            model,
        ]
        .into_iter()
        .map(String::from)
        .collect();
        if !effort.is_empty() {
            args.extend(["--effort".into(), effort.into()]);
        }
        if let Some(previous) = self
            .journal
            .lock()
            .map_err(|_| "journal lock")?
            .native_runs(&input.session_id)?
            .into_iter()
            .find(|run| {
                run.provider == input.provider
                    && run.conversation_key == input.conversation_key
                    && input.conversation_key.is_some()
                    && run.task_copy_id == input.task_copy_id
                    && run.thread_id.is_some()
            })
        {
            args.extend(["--resume".into(), previous.thread_id.unwrap()]);
        }
        args.push("--".into());
        args.push(prompt);
        self.launch_claude(input, executable, args, cwd, workspace)
    }
    fn launch_claude(
        &self,
        input: RunInput,
        executable: std::path::PathBuf,
        args: Vec<String>,
        cwd: std::path::PathBuf,
        workspace: Option<crate::workspace::Workspace>,
    ) -> Result<NativeRun> {
        let mut workers = self.workers.lock().map_err(|_| "run lock")?;
        workers.retain(|_, worker| !worker.join.is_finished());
        let run = self
            .journal
            .lock()
            .map_err(|_| "journal lock")?
            .begin_run(&input)?;
        let journal = self.journal.clone();
        let id = run.id.clone();
        let cancel = Arc::new(AtomicBool::new(false));
        let stopping = cancel.clone();
        let (tx, rx) = mpsc::sync_channel(8);
        let join = thread::Builder::new()
            .name("coi-claude-run".into())
            .spawn(move || {
                let outcome = (|| -> Result<(Terminal, String)> {
                    let mut transport = StdioTransport::spawn(
                        &executable,
                        &args.iter().map(String::as_str).collect::<Vec<_>>(),
                        &cwd,
                    )?;
                    let mut protocol =
                        crate::adapters::claude::Protocol::restricted(input.mode == "plan");
                    let mut agy = crate::adapters::antigravity::Protocol::new();
                    let deadline = Instant::now() + Duration::from_secs(600);
                    loop {
                        while let Ok(Control::Decide(_, reply)) = rx.try_recv() {
                            let _ = reply.send(Err(crate::i18n::text(
                                "이 실행은 사전 승인한 파일 범위만 사용해요.",
                            )
                            .into()));
                        }
                        if stopping.load(Ordering::Acquire) {
                            transport.terminate()?;
                            return Ok((Terminal::Cancelled, "user_cancelled".into()));
                        }
                        if Instant::now() >= deadline {
                            return Err("provider_turn_timeout".into());
                        }
                        let chunk = match transport.receive(Duration::from_millis(100)) {
                            Ok(bytes) => bytes,
                            Err(error) if error == "provider_timeout" => continue,
                            Err(error) => return Err(error),
                        };
                        let signals = if input.provider == "antigravity" {
                            let signals = agy.feed(&chunk)?;
                            protocol.session_id = agy.conversation_id.clone();
                            signals
                        } else {
                            protocol.feed(&chunk)?
                        };
                        if let Some(session_id) = &protocol.session_id {
                            let mut store = journal.lock().map_err(|_| "journal lock")?;
                            if store.native_run(&id)?.thread_id.is_none() {
                                store.bind_run(&id, session_id, None)?;
                                if let Some(model) = &protocol.actual_model {
                                    store.append_run(
                                        &id,
                                        Payload::Activity(Activity {
                                            activity_id: "actual-model".into(),
                                            phase: "finished".into(),
                                            activity_type: "analyzing".into(),
                                            target: crate::localized_format!(
                                                "사용 모델: {model}",
                                                "Model: {model}",
                                                "使用モデル：{model}"
                                            ),
                                            result: None,
                                        }),
                                    )?;
                                }
                            }
                        }
                        for signal in signals {
                            let payload = match signal {
                                Signal::Text(text) => {
                                    Some(Payload::AssistantDelta(AssistantDelta {
                                        message_id: format!("{id}-answer"),
                                        text,
                                    }))
                                }
                                Signal::Activity {
                                    id: activity_id,
                                    phase,
                                    kind,
                                    target,
                                    result,
                                } => Some(Payload::Activity(Activity {
                                    activity_id,
                                    phase,
                                    activity_type: kind,
                                    target,
                                    result,
                                })),
                                Signal::Warning(redacted_message) => {
                                    Some(Payload::RunWarning(RunWarning {
                                        code: "provider_notice".into(),
                                        redacted_message,
                                        retryable: false,
                                    }))
                                }
                                Signal::Finished(status) => {
                                    transport.terminate()?;
                                    return Ok((
                                        match status.as_str() {
                                            "completed" => Terminal::Completed,
                                            "cancelled" => Terminal::Cancelled,
                                            _ => Terminal::Failed,
                                        },
                                        "provider_finished".into(),
                                    ));
                                }
                                _ => None,
                            };
                            if let Some(payload) = payload {
                                journal
                                    .lock()
                                    .map_err(|_| "journal lock")?
                                    .append_run(&id, payload)?;
                            }
                        }
                        if let Some(session_id) = &protocol.session_id {
                            let store = journal.lock().map_err(|_| "journal lock")?;
                            if store.native_run(&id)?.thread_id.is_none() {
                                store.bind_run(&id, session_id, None)?;
                            }
                        }
                    }
                })();
                // Transport drops (and kills the process group) before releasing the reservation.
                let (status, reason) = outcome.unwrap_or_else(|error| (Terminal::Failed, error));
                let mut artifacts = Vec::new();
                let changes = workspace
                    .as_ref()
                    .map(|workspace| workspace.collect(&input.task_copy_id));
                if let Ok(mut store) = journal.lock() {
                    if let Some(Ok(changes)) = changes {
                        for file in changes.files {
                            let artifact = format!("{}:{}", changes.id, file.path);
                            let hash = file.after_hash.or(file.before_hash).unwrap_or_default();
                            if store
                                .append_run(
                                    &id,
                                    Payload::ArtifactCreated(ArtifactCreated {
                                        artifact_id: artifact.clone(),
                                        kind: "diff".into(),
                                        relative_path: file.path,
                                        content_hash: hash,
                                    }),
                                )
                                .is_ok()
                            {
                                artifacts.push(artifact);
                            }
                        }
                    } else if changes.is_some() {
                        let _ = store.append_run(
                            &id,
                            Payload::RunWarning(RunWarning {
                                code: "change_collection_failed".into(),
                                redacted_message: crate::i18n::text(
                                    "변경 수집에 실패했어요. 산출물에서 다시 확인해 주세요.",
                                )
                                .into(),
                                retryable: true,
                            }),
                        );
                    }
                    let _ = store.append_run(
                        &id,
                        Payload::RunFinished(RunFinished {
                            status,
                            reason_code: reason,
                            verification: Verification::NotRun,
                            pending_artifacts: artifacts,
                        }),
                    );
                }
            })
            .map_err(|_| "worker_start_failed".to_string());
        match join {
            Ok(join) => {
                workers.insert(
                    run.id.clone(),
                    Worker {
                        control: tx,
                        join,
                        cancel,
                    },
                );
                Ok(run)
            }
            Err(error) => {
                self.journal
                    .lock()
                    .map_err(|_| "journal lock")?
                    .append_run(
                        &run.id,
                        Payload::RunFinished(RunFinished {
                            status: Terminal::Failed,
                            reason_code: error.clone(),
                            verification: Verification::NotRun,
                            pending_artifacts: vec![],
                        }),
                    )?;
                Err(error)
            }
        }
    }
    pub fn decide(&self, decision: ApprovalDecision) -> Result<()> {
        let (tx, rx) = mpsc::sync_channel(1);
        let workers = self.workers.lock().map_err(|_| "run lock")?;
        let worker = workers
            .get(&decision.run_id)
            .ok_or("unknown or finished run")?;
        worker
            .control
            .try_send(Control::Decide(decision, tx))
            .map_err(|_| "run unavailable")?;
        drop(workers);
        rx.recv_timeout(Duration::from_secs(3))
            .map_err(|_| "approval_delivery_unknown: read run events before retrying".to_string())?
    }
    pub fn cancel(&self, id: &str) -> Result<()> {
        let workers = self.workers.lock().map_err(|_| "run lock")?;
        let worker = workers.get(id).ok_or("unknown or finished run")?;
        worker.cancel.store(true, Ordering::Release);
        Ok(())
    }
    #[cfg_attr(not(test), allow(dead_code))]
    fn launch(&self, input: RunInput, launch: LaunchPlan, publish: Publish) -> Result<NativeRun> {
        let mut workers = self.workers.lock().map_err(|_| "run lock")?;
        workers.retain(|_, worker| !worker.join.is_finished());
        let run = self
            .journal
            .lock()
            .map_err(|_| "journal lock")?
            .begin_run(&input)?;
        let transport = match StdioTransport::spawn(
            &launch.executable,
            &launch.args.iter().map(String::as_str).collect::<Vec<_>>(),
            &launch.cwd,
        ) {
            Ok(t) => t,
            Err(_) => {
                self.journal
                    .lock()
                    .map_err(|_| "journal lock")?
                    .append_run(
                        &run.id,
                        Payload::RunFinished(RunFinished {
                            status: Terminal::Failed,
                            reason_code: "provider_spawn_failed".into(),
                            verification: Verification::NotRun,
                            pending_artifacts: vec![],
                        }),
                    )?;
                return Err("provider_spawn_failed".into());
            }
        };
        let (tx, rx) = mpsc::sync_channel(8);
        let journal = self.journal.clone();
        let id = run.id.clone();
        let cancel = Arc::new(AtomicBool::new(false));
        let stopping = cancel.clone();
        let mut engine = Engine {
            id: id.clone(),
            journal,
            publish,
            protocol: Protocol::default(),
            transport,
            approvals: HashMap::new(),
            decisions: HashMap::new(),
            cancel_at: None,
            finished: false,
        };
        // Start is already committed; emit only a persisted event.
        let committed = engine
            .journal
            .lock()
            .map_err(|_| "journal lock")?
            .run_events(&id, 0)?;
        for e in committed {
            (engine.publish)(e);
        }
        let join = thread::Builder::new()
            .name("coi-run".into())
            .spawn(move || {
                let result = engine.drive(rx, stopping, launch.thread_request, launch.turn_request);
                // Terminate owned children before publishing terminal state and
                // releasing the durable project reservation.
                if engine.transport.terminate().is_err() {
                    return;
                }
                if let Some(workspace) = &launch.workspace {
                    if let Ok(changes) = workspace.collect(&input.task_copy_id) {
                        for file in changes.files {
                            let _ = engine.emit(Payload::ArtifactCreated(ArtifactCreated {
                                artifact_id: format!("{}:{}", changes.id, file.path),
                                kind: "diff".into(),
                                relative_path: file.path,
                                content_hash: file
                                    .after_hash
                                    .or(file.before_hash)
                                    .unwrap_or_default(),
                            }));
                        }
                    }
                }
                if !engine.finished {
                    let (status, reason) = match result {
                        Ok((status, reason)) => (status, reason),
                        Err(reason) => (Terminal::Failed, reason),
                    };
                    let _ = engine.finish(status, &reason);
                }
            })
            .map_err(|_| "run worker unavailable".to_string());
        match join {
            Ok(join) => {
                workers.insert(
                    id,
                    Worker {
                        control: tx,
                        join,
                        cancel,
                    },
                );
                Ok(run)
            }
            Err(e) => {
                self.journal
                    .lock()
                    .map_err(|_| "journal lock")?
                    .append_run(
                        &id,
                        Payload::RunFinished(RunFinished {
                            status: Terminal::Failed,
                            reason_code: "worker_start_failed".into(),
                            verification: Verification::NotRun,
                            pending_artifacts: vec![],
                        }),
                    )?;
                Err(e)
            }
        }
    }
}
impl RunManager {
    pub fn shutdown(&self) {
        if let Ok(mut workers) = self.workers.lock() {
            for worker in workers.values() {
                worker.cancel.store(true, Ordering::Release);
            }
            for (_, worker) in workers.drain() {
                let _ = worker.join.join();
            }
        }
    }
}
impl Drop for RunManager {
    fn drop(&mut self) {
        self.shutdown();
    }
}
struct Engine {
    id: String,
    journal: Journal,
    publish: Publish,
    protocol: Protocol,
    transport: StdioTransport,
    approvals: HashMap<String, ApprovalRef>,
    decisions: HashMap<String, String>,
    cancel_at: Option<Instant>,
    finished: bool,
}
impl Engine {
    fn emit(&mut self, payload: Payload) -> Result<()> {
        let event = self
            .journal
            .lock()
            .map_err(|_| "journal lock")?
            .append_run(&self.id, payload)?;
        (self.publish)(event);
        Ok(())
    }
    fn finish(&mut self, status: Terminal, reason: &str) -> Result<()> {
        // One terminal event clears all pending approvals even if storage limits
        // prevent individual expiry messages from being written.
        self.emit(Payload::RunFinished(RunFinished {
            status,
            reason_code: reason.into(),
            verification: Verification::NotRun,
            pending_artifacts: vec![],
        }))?;
        self.finished = true;
        self.approvals.clear();
        Ok(())
    }
    fn resolve(&mut self, request: ApprovalDecision) -> Result<()> {
        if self.cancel_at.is_some() {
            return Err("run cancelling".into());
        }
        let key = &request.reference.provider_request_id;
        let expected = self
            .approvals
            .get(key)
            .ok_or("unknown or expired approval")?;
        if request.run_id != self.id
            || expected.approval_id != request.reference.approval_id
            || expected.thread_id != request.reference.thread_id
            || expected.turn_id != request.reference.turn_id
            || expected.item_id != request.reference.item_id
        {
            return Err("stale or foreign approval".into());
        }
        let response = self.protocol.decide(
            key,
            &expected.thread_id,
            &expected.turn_id,
            &request.decision,
        )?;
        // Record the user's decision before sending it. If delivery fails, stop
        // the owned process; do not retry an approval with uncertain delivery.
        let state = match request.decision.as_str() {
            "allow_once" => "accepted",
            "deny" => "denied",
            _ => "cancelled",
        };
        let approval_id = expected.approval_id.clone();
        self.emit(Payload::ApprovalResolved(ApprovalResolved {
            approval_id,
            state: state.into(),
            actor: "user".into(),
        }))?;
        self.decisions.insert(key.clone(), state.into());
        self.transport.send(&response)?;
        if request.decision == "cancel_run" {
            self.begin_cancel()?;
        }
        Ok(())
    }
    fn begin_cancel(&mut self) -> Result<()> {
        if self.cancel_at.is_none() {
            self.cancel_at = Some(Instant::now() + Duration::from_secs(5));
            if let Ok(request) = self.protocol.interrupt() {
                self.transport.send(&request)?;
            }
        }
        Ok(())
    }
    fn drive(
        &mut self,
        controls: Receiver<Control>,
        stopping: Arc<AtomicBool>,
        thread_request: Value,
        turn_request: Value,
    ) -> Result<(Terminal, String)> {
        self.transport.send(&Protocol::initialize())?;
        let mut stage = 0;
        let mut deadline = Instant::now() + Duration::from_secs(15);
        loop {
            if stopping.load(Ordering::Acquire) {
                self.begin_cancel()?;
            }
            while let Ok(command) = controls.try_recv() {
                match command {
                    Control::Decide(request, reply) => {
                        let result = self.resolve(request);
                        // Rejected stale/foreign decisions leave a healthy run
                        // untouched; uncertain write/storage failures stop it.
                        let fatal = result.as_ref().err().is_some_and(|e| {
                            ![
                                "run cancelling",
                                "unknown or expired approval",
                                "stale or foreign approval",
                                "expired approval",
                                "unknown approval",
                                "stale or foreign approval",
                                "unsupported decision",
                            ]
                            .contains(&e.as_str())
                        });
                        let _ = reply.try_send(result.clone());
                        if fatal {
                            return Err(result.unwrap_err());
                        }
                    }
                }
            }
            if self.cancel_at.is_some_and(|end| Instant::now() >= end) {
                return Ok((Terminal::Cancelled, "cancel_timeout".into()));
            }
            if stage < 3 && Instant::now() >= deadline {
                return Err("provider_handshake_timeout".into());
            }
            let bytes = match self.transport.receive(Duration::from_millis(20)) {
                Ok(b) => b,
                Err(e) if e == "provider_timeout" => continue,
                Err(e) => {
                    return if self.cancel_at.is_some() {
                        Ok((Terminal::Cancelled, "provider_exited_after_cancel".into()))
                    } else {
                        Err(e)
                    }
                }
            };
            self.protocol.push(&bytes)?;
            while let Some(signals) = self.protocol.next_frame()? {
                for signal in signals {
                    match signal {
                        Signal::Response(id, value) => {
                            deadline = Instant::now() + Duration::from_secs(15);
                            match (stage, id) {
                                (0, 1) => {
                                    if self.cancel_at.is_some() {
                                        return Ok((
                                            Terminal::Cancelled,
                                            "cancelled_before_thread".into(),
                                        ));
                                    }
                                    self.transport
                                        .send(&serde_json::json!({"method":"initialized"}))?;
                                    if thread_request["method"] == "thread/resume" {
                                        self.protocol.thread = thread_request["params"]["threadId"]
                                            .as_str()
                                            .map(str::to_owned);
                                    }
                                    self.transport.send(&thread_request)?;
                                    stage = 1;
                                }
                                (1, 2) => {
                                    let thread = value["thread"]["id"]
                                        .as_str()
                                        .filter(|s| !s.is_empty())
                                        .ok_or("protocol_error: thread response")?;
                                    self.protocol.thread = Some(thread.into());
                                    self.journal
                                        .lock()
                                        .map_err(|_| "journal lock")?
                                        .bind_run(&self.id, thread, None)?;
                                    if self.cancel_at.is_some() {
                                        return Ok((
                                            Terminal::Cancelled,
                                            "cancelled_before_turn".into(),
                                        ));
                                    }
                                    let mut request = turn_request.clone();
                                    request["params"]["threadId"] = thread.into();
                                    self.transport.send(&request)?;
                                    stage = 2;
                                }
                                (2, 3) => {
                                    let turn = value["turn"]["id"]
                                        .as_str()
                                        .filter(|s| !s.is_empty())
                                        .ok_or("protocol_error: turn response")?;
                                    if self.protocol.turn.as_deref().is_some_and(|t| t != turn) {
                                        return Err("protocol_error: turn response mismatch".into());
                                    }
                                    self.protocol.turn = Some(turn.into());
                                    stage = 3;
                                    self.journal.lock().map_err(|_| "journal lock")?.bind_run(
                                        &self.id,
                                        self.protocol.thread.as_deref().ok_or("missing thread")?,
                                        Some(turn),
                                    )?;
                                    if self.cancel_at.is_some() {
                                        self.transport.send(&self.protocol.interrupt()?)?;
                                    }
                                }
                                (_, 4) if self.cancel_at.is_some() => {}
                                _ => return Err("protocol_error: unexpected response".into()),
                            }
                        }
                        Signal::Text(text) => {
                            self.emit(Payload::AssistantDelta(AssistantDelta {
                                message_id: self.id.clone(),
                                text,
                            }))?
                        }
                        Signal::Activity {
                            id,
                            phase,
                            kind,
                            target,
                            result,
                        } => self.emit(Payload::Activity(Activity {
                            activity_id: id,
                            phase,
                            activity_type: kind,
                            target,
                            result,
                        }))?,
                        Signal::Approval(key) => {
                            if self.cancel_at.is_some() {
                                continue;
                            }
                            let approval = self
                                .protocol
                                .pending
                                .get(&key)
                                .ok_or("protocol_error: approval disappeared")?;
                            let reference = ApprovalRef {
                                approval_id: uuid::Uuid::new_v4().to_string(),
                                provider_request_id: key.clone(),
                                thread_id: approval.thread.clone(),
                                turn_id: approval.turn.clone(),
                                item_id: Some(approval.item.clone()),
                            };
                            let payload = ApprovalRequested {
                                reference: reference.clone(),
                                scope: "task_copy".into(),
                                risk: if approval.method.contains("commandExecution") {
                                    "L2"
                                } else {
                                    "L1"
                                }
                                .into(),
                                decisions: vec![
                                    "allow_once".into(),
                                    "deny".into(),
                                    "cancel_run".into(),
                                ],
                                description: approval.description.clone(),
                            };
                            self.emit(Payload::ApprovalRequested(payload))?;
                            self.approvals.insert(key, reference);
                        }
                        Signal::ApprovalResolved(key) => {
                            if let Some(reference) = self.approvals.remove(&key) {
                                if self.decisions.remove(&key).is_none() {
                                    self.emit(Payload::ApprovalResolved(ApprovalResolved {
                                        approval_id: reference.approval_id,
                                        state: "expired".into(),
                                        actor: "provider".into(),
                                    }))?;
                                }
                            }
                        }
                        Signal::Finished(status) => {
                            return Ok((
                                match status.as_str() {
                                    "completed" => Terminal::Completed,
                                    "interrupted" => Terminal::Cancelled,
                                    _ => Terminal::Failed,
                                },
                                format!("provider_{status}"),
                            ))
                        }
                        Signal::Warning(_) => self.emit(Payload::RunWarning(RunWarning {
                            code: "unmapped_provider_event".into(),
                            redacted_message: crate::i18n::text(
                                "이 공급자 이벤트는 아직 화면에 매핑하지 않았어요.",
                            )
                            .into(),
                            retryable: false,
                        }))?,
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn setup() -> (tempfile::TempDir, Journal, RunInput) {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(&temp.path().join("coi.db")).unwrap();
        let project = store.register(temp.path()).unwrap();
        store
            .save(&json!({"sessions":[{"id":"session","projectId":project.id}]}).to_string())
            .unwrap();
        let input = RunInput {
            provider: "codex".into(),
            model: None,
            effort: None,
            request_message_id: None,
            conversation_key: None,
            session_id: "session".into(),
            project_id: project.id,
            task_copy_id: "fixture-copy".into(),
            mode: "review_copy".into(),
        };
        (temp, Arc::new(Mutex::new(store)), input)
    }
    fn launch_plan() -> LaunchPlan {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .canonicalize()
            .unwrap();
        LaunchPlan {
            workspace: None,
            executable: which::which("node").unwrap(),
            args: vec![root
                .join("tests/fixtures/cli/fake-app-server.cjs")
                .to_str()
                .unwrap()
                .into()],
            cwd: root,
            thread_request: json!({"id":2,"method":"thread/start","params":{}}),
            turn_request: json!({"id":3,"method":"turn/start","params":{}}),
        }
    }
    fn wait_for(journal: &Journal, id: &str, predicate: impl Fn(&[Event]) -> bool) -> Vec<Event> {
        let until = Instant::now() + Duration::from_secs(8);
        loop {
            let events = journal.lock().unwrap().run_events(id, 0).unwrap();
            if predicate(&events) {
                return events;
            }
            assert!(
                Instant::now() < until,
                "run did not reach expected state: {}",
                serde_json::to_string(&events).unwrap()
            );
            thread::sleep(Duration::from_millis(10));
        }
    }
    fn approval(journal: &Journal, id: &str) -> ApprovalRef {
        let events = wait_for(journal, id, |e| {
            e.iter()
                .any(|e| matches!(e.content, Payload::ApprovalRequested(_)))
        });
        events
            .into_iter()
            .find_map(|e| match e.content {
                Payload::ApprovalRequested(p) => Some(p.reference),
                _ => None,
            })
            .unwrap()
    }
    fn terminal(journal: &Journal, id: &str) -> Vec<Event> {
        wait_for(journal, id, |e| {
            e.iter()
                .any(|e| matches!(e.content, Payload::RunFinished(_)))
        })
    }
    #[test]
    fn production_gate_rejects_without_creating_a_run() {
        let (_temp, journal, input) = setup();
        let manager = RunManager::new(journal.clone()).unwrap();
        assert!(manager
            .start(input, "hello".into(), std::env::temp_dir(), None)
            .is_err());
        assert!(journal
            .lock()
            .unwrap()
            .native_runs("session")
            .unwrap()
            .is_empty());
    }
    #[test]
    fn owned_run_journals_approvals_and_rejects_foreign_and_duplicate_decisions() {
        let (temp, journal, input) = setup();
        let manager = RunManager::new(journal.clone()).unwrap();
        // A subscriber reads committed state: publication cannot race persistence.
        let read = journal.clone();
        let publish: Publish = Arc::new(move |event| {
            assert!(read.lock().unwrap().native_run(&event.run_id).unwrap().seq >= event.seq);
        });
        let run = manager
            .launch(input.clone(), launch_plan(), publish)
            .unwrap();
        let reference = approval(&journal, &run.id);
        assert!(manager
            .launch(input, launch_plan(), Arc::new(|_| {}))
            .is_err());
        let mut foreign = reference.clone();
        foreign.turn_id = "foreign".into();
        assert!(manager
            .decide(ApprovalDecision {
                run_id: run.id.clone(),
                reference: foreign,
                decision: "allow_once".into()
            })
            .is_err());
        manager
            .decide(ApprovalDecision {
                run_id: run.id.clone(),
                reference: reference.clone(),
                decision: "allow_once".into(),
            })
            .unwrap();
        assert!(manager
            .decide(ApprovalDecision {
                run_id: run.id.clone(),
                reference,
                decision: "allow_once".into()
            })
            .is_err());
        let events = terminal(&journal, &run.id);
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(e.content, Payload::RunFinished(_)))
                .count(),
            1
        );
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(e.content, Payload::ApprovalResolved(_)))
                .count(),
            1
        );
        for (i, e) in events.iter().enumerate() {
            assert_eq!(e.seq, i as u64 + 1);
            Event::parse(&serde_json::to_string(e).unwrap()).unwrap();
        }
        assert!(events.iter().any(|e|matches!(&e.content,Payload::RunFinished(p) if p.status==Terminal::Completed && p.verification==Verification::NotRun)));
        assert!(events.iter().any(|e|matches!(&e.content,Payload::Activity(p) if p.activity_type=="command" && p.result.as_deref()==Some("exit code 0"))));
        let stored = journal.lock().unwrap().native_run(&run.id).unwrap();
        assert_eq!(stored.thread_id.as_deref(), Some("fixture-thread"));
        assert_eq!(stored.turn_id.as_deref(), Some("fixture-turn"));
        // A UI snapshot cannot delete or fabricate this journal.
        journal
            .lock()
            .unwrap()
            .save(r#"{"sessions":[],"events":[]}"#)
            .unwrap();
        drop(manager);
        drop(journal);
        let reopened = Store::open(&temp.path().join("coi.db")).unwrap();
        assert_eq!(reopened.run_events(&run.id, 0).unwrap().len(), events.len());
        assert_eq!(
            reopened.run_events(&run.id, events[1].seq).unwrap()[0].seq,
            3
        );
    }
    #[test]
    fn cancel_and_shutdown_finish_once_without_accepting_pending_approval() {
        let (_temp, journal, input) = setup();
        let manager = RunManager::new(journal.clone()).unwrap();
        let run = manager
            .launch(input.clone(), launch_plan(), Arc::new(|_| {}))
            .unwrap();
        approval(&journal, &run.id);
        manager.cancel(&run.id).unwrap();
        manager.cancel(&run.id).unwrap();
        let events = terminal(&journal, &run.id);
        assert!(
            matches!(&events.last().unwrap().content,Payload::RunFinished(p) if p.status==Terminal::Cancelled)
        );
        assert!(!events
            .iter()
            .any(|e| matches!(&e.content,Payload::ApprovalResolved(p) if p.state=="accepted")));
        let second = manager
            .launch(input, launch_plan(), Arc::new(|_| {}))
            .unwrap();
        approval(&journal, &second.id);
        drop(manager);
        assert_eq!(
            journal
                .lock()
                .unwrap()
                .native_run(&second.id)
                .unwrap()
                .status,
            "cancelled"
        );
    }
    #[test]
    fn silent_provider_is_forced_down_after_cancel_deadline() {
        let (_temp, journal, input) = setup();
        let manager = RunManager::new(journal.clone()).unwrap();
        let mut plan = launch_plan();
        plan.args = vec![
            "-e".into(),
            "process.stdin.resume();setInterval(()=>{},1000)".into(),
        ];
        let run = manager.launch(input, plan, Arc::new(|_| {})).unwrap();
        manager.cancel(&run.id).unwrap();
        let events = terminal(&journal, &run.id);
        assert!(
            matches!(&events.last().unwrap().content,Payload::RunFinished(p) if p.status==Terminal::Cancelled && p.reason_code=="cancel_timeout")
        );
        drop(manager);
    }
    #[test]
    fn malformed_provider_fails_and_releases_project_reservation() {
        let (_temp, journal, input) = setup();
        let manager = RunManager::new(journal.clone()).unwrap();
        let mut plan = launch_plan();
        plan.args = vec![
            "-e".into(),
            "process.stdout.write('not json\\n');setInterval(()=>{},1000)".into(),
        ];
        let run = manager
            .launch(input.clone(), plan, Arc::new(|_| {}))
            .unwrap();
        let events = terminal(&journal, &run.id);
        assert!(
            matches!(&events.last().unwrap().content,Payload::RunFinished(p) if p.status==Terminal::Failed && p.reason_code.contains("malformed JSON"))
        );
        assert!(manager
            .launch(input, launch_plan(), Arc::new(|_| {}))
            .is_ok());
    }
    #[test]
    fn unicode_event_quota_preserves_room_for_terminal() {
        let (_temp, journal, input) = setup();
        let mut store = journal.lock().unwrap();
        let run = store.begin_run(&input).unwrap();
        let mut accepted = 0;
        for _ in 0..150 {
            let result = store.append_run(
                &run.id,
                Payload::AssistantDelta(AssistantDelta {
                    message_id: "m".into(),
                    text: "가".repeat(40_000),
                }),
            );
            if let Err(reason) = result {
                assert_eq!(reason, "event_storage_limit");
                break;
            }
            accepted += 1;
        }
        assert!(
            accepted < 140,
            "quota must measure UTF-8 bytes, not SQL text characters"
        );
        store
            .append_run(
                &run.id,
                Payload::RunFinished(RunFinished {
                    status: Terminal::Failed,
                    reason_code: "event_storage_limit".into(),
                    verification: Verification::NotRun,
                    pending_artifacts: vec![],
                }),
            )
            .unwrap();
        assert_eq!(store.native_run(&run.id).unwrap().status, "failed");
    }
    #[test]
    fn interrupted_journal_recovers_once_and_filters_secrets() {
        let (temp, journal, input) = setup();
        let run = journal.lock().unwrap().begin_run(&input).unwrap();
        journal
            .lock()
            .unwrap()
            .append_run(
                &run.id,
                Payload::AssistantDelta(AssistantDelta {
                    message_id: "m".into(),
                    text: "api_key=super-secret-value".into(),
                }),
            )
            .unwrap();
        drop(journal);
        let mut reopened = Store::open(&temp.path().join("coi.db")).unwrap();
        assert_eq!(reopened.recover_native_runs().unwrap(), 1);
        assert_eq!(reopened.recover_native_runs().unwrap(), 0);
        let events = reopened.run_events(&run.id, 0).unwrap();
        assert!(!serde_json::to_string(&events)
            .unwrap()
            .contains("super-secret-value"));
        assert!(
            matches!(&events.last().unwrap().content,Payload::RunFinished(p) if p.reason_code=="app_restarted" && p.verification==Verification::Incomplete)
        );
        assert!(reopened
            .append_run(
                &run.id,
                Payload::AssistantDelta(AssistantDelta {
                    message_id: "m".into(),
                    text: "late".into()
                })
            )
            .is_err());
        assert!(reopened.begin_run(&input).is_ok());
    }
}

#[cfg(test)]
mod live_acceptance {
    use super::*;
    #[test]
    #[ignore = "Uses an authenticated real Claude CLI; run explicitly"]
    fn claude_two_turn_edit_apply_undo_cancel() {
        live_provider("claude", "sonnet");
    }
    #[test]
    #[ignore = "Uses an authenticated real Codex CLI; run explicitly"]
    fn codex_two_turn_edit_apply_undo_cancel() {
        live_provider("codex", "gpt-5.6-luna");
    }
    #[test]
    #[ignore = "Uses an authenticated real Antigravity CLI with existing MCP configuration"]
    fn antigravity_two_turn_edit_apply_undo_cancel() {
        live_provider("antigravity", "gemini-3.8-flash-low");
    }
    fn live_provider(provider: &str, model: &str) {
        let temp = tempfile::tempdir().unwrap();
        let original = temp.path().join("original");
        std::fs::create_dir(&original).unwrap();
        std::fs::write(original.join("README.md"), "Original README\n").unwrap();
        let mut store = Store::open(&temp.path().join("coi.db")).unwrap();
        let project = store.register(&original).unwrap();
        store
            .save(
                &serde_json::json!({"sessions":[{"id":"live-session","projectId":project.id}]})
                    .to_string(),
            )
            .unwrap();
        let workspace = crate::workspace::Workspace::new(temp.path().join("data")).unwrap();
        let task = workspace.prepare(&project).unwrap();
        let cwd = workspace.work_path(&task.id, &project.id).unwrap();
        let journal = Arc::new(Mutex::new(store));
        let manager = RunManager::new(journal.clone()).unwrap();
        let input = RunInput {
            session_id: "live-session".into(),
            project_id: project.id,
            task_copy_id: task.id.clone(),
            mode: "review_copy".into(),
            provider: provider.into(),
            model: Some(model.into()),
            effort: Some("low".into()),
            request_message_id: Some("message-1".into()),
            conversation_key: Some("acceptance-conversation".into()),
        };
        let wait = |id: &str| {
            let deadline = Instant::now() + Duration::from_secs(90);
            loop {
                let run = journal.lock().unwrap().native_run(id).unwrap();
                if crate::storage::runs::terminal(&run.status) {
                    return run;
                }
                assert!(Instant::now() < deadline, "live acceptance timeout");
                std::thread::sleep(Duration::from_millis(100));
            }
        };
        let first = manager.start(input.clone(), "Remember the marker COI_SEED_K47 for the next turn. Use your file tools to replace README.md with exactly: COI native worker acceptance. Then briefly confirm.".into(), cwd.clone(), Some(workspace.clone())).unwrap();
        assert_eq!(wait(&first.id).status, "completed");
        assert_eq!(
            std::fs::read_to_string(original.join("README.md")).unwrap(),
            "Original README\n"
        );
        let changes = workspace.collect(&task.id).unwrap();
        assert!(changes.files.iter().any(|file| file.path == "README.md"));
        let application = workspace.apply(&changes.id).unwrap();
        assert!(std::fs::read_to_string(original.join("README.md"))
            .unwrap()
            .contains("COI native worker acceptance"));
        workspace.undo(&application, false).unwrap();
        assert_eq!(
            std::fs::read_to_string(original.join("README.md")).unwrap(),
            "Original README\n"
        );
        let second = manager.start(RunInput { request_message_id: Some("message-2".into()), ..input.clone() }, "Reply with only the marker I asked you to remember in the previous turn. Do not use tools.".into(), cwd.clone(), Some(workspace.clone())).unwrap();
        let second_result = wait(&second.id);
        assert_eq!(
            second_result.status,
            "completed",
            "{:?}",
            journal.lock().unwrap().run_events(&second.id, 0).unwrap()
        );
        let events = journal.lock().unwrap().run_events(&second.id, 0).unwrap();
        assert!(events.iter().any(|event| matches!(&event.content, Payload::AssistantDelta(delta) if delta.text.contains("COI_SEED_K47"))));
        let third = manager
            .start(
                RunInput {
                    request_message_id: Some("message-3".into()),
                    ..input
                },
                "Describe 100 different sorting algorithms in detail. Do not use tools.".into(),
                cwd,
                Some(workspace.clone()),
            )
            .unwrap();
        manager.cancel(&third.id).unwrap();
        assert_eq!(wait(&third.id).status, "cancelled");
        assert_eq!(
            std::fs::read_to_string(original.join("README.md")).unwrap(),
            "Original README\n"
        );
    }
}
