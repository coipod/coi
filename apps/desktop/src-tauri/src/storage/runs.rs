//! The native event journal is authoritative; UI snapshots cannot replace it.
use super::*;
use crate::protocol::{Event, Payload, RunFinished, RunStarted, Terminal, Verification};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RunInput {
    pub session_id: String,
    pub project_id: String,
    pub task_copy_id: String,
    pub mode: String,
    #[serde(default = "legacy_provider")]
    pub provider: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub effort: Option<String>,
    #[serde(default)]
    pub request_message_id: Option<String>,
    #[serde(default)]
    pub conversation_key: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRun {
    pub id: String,
    pub session_id: String,
    pub project_id: String,
    pub task_copy_id: String,
    pub mode: String,
    #[serde(default = "legacy_provider")]
    pub provider: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub effort: Option<String>,
    #[serde(default)]
    pub request_message_id: Option<String>,
    #[serde(default)]
    pub conversation_key: Option<String>,
    pub status: String,
    pub seq: u64,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
}
fn legacy_provider() -> String {
    "codex".into()
}
const COLUMNS: &str = "id,session_id,project_id,task_copy_id,mode,status,seq,thread_id,turn_id,provider,model,effort,request_message_id,conversation_key";
fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<NativeRun> {
    Ok(NativeRun {
        id: r.get(0)?,
        session_id: r.get(1)?,
        project_id: r.get(2)?,
        task_copy_id: r.get(3)?,
        mode: r.get(4)?,
        status: r.get(5)?,
        seq: r.get(6)?,
        thread_id: r.get(7)?,
        turn_id: r.get(8)?,
        provider: r.get(9)?,
        model: r.get(10)?,
        effort: r.get(11)?,
        request_message_id: r.get(12)?,
        conversation_key: r.get(13)?,
    })
}
pub fn terminal(status: &str) -> bool {
    matches!(status, "completed" | "failed" | "cancelled")
}
impl Store {
    pub(crate) fn ensure_workspace_idle(&self) -> Result<()> {
        let active: bool = self.conn.query_row("SELECT EXISTS(SELECT 1 FROM native_runs WHERE status NOT IN ('completed','failed','cancelled'))", [], |row| row.get(0)).map_err(|e| e.to_string())?;
        if active {
            Err(crate::i18n::text(
                "CLI가 작업 중이에요. 중지하거나 완료한 뒤 사본과 원본을 변경해 주세요.",
            )
            .into())
        } else {
            Ok(())
        }
    }

    pub(crate) fn begin_run(&mut self, input: &RunInput) -> Result<NativeRun> {
        if !["plan", "review_copy"].contains(&input.mode.as_str())
            || [&input.session_id, &input.project_id, &input.task_copy_id]
                .iter()
                .any(|s| s.is_empty() || s.len() > 128)
        {
            return Err("invalid run input".into());
        }
        if !["codex", "claude", "antigravity"].contains(&input.provider.as_str())
            || input
                .model
                .as_ref()
                .is_some_and(|s| s.is_empty() || s.len() > 200)
            || input.effort.as_ref().is_some_and(|s| s.len() > 32)
            || input
                .conversation_key
                .as_ref()
                .is_some_and(|s| s.is_empty() || s.len() > 128)
            || input
                .request_message_id
                .as_ref()
                .is_some_and(|s| s.is_empty() || s.len() > 128)
        {
            return Err("invalid execution settings".into());
        }
        self.project(&input.project_id)?;
        let session: String = self
            .conn
            .query_row(
                "SELECT payload FROM sessions WHERE id=?1",
                [&input.session_id],
                |r| r.get(0),
            )
            .map_err(|_| "unknown session")?;
        let session: serde_json::Value =
            serde_json::from_str(&session).map_err(|_| "invalid session")?;
        if session["projectId"].as_str() != Some(&input.project_id) {
            return Err("foreign session project".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        let tx = self.conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO native_runs(id,session_id,project_id,task_copy_id,mode,status,seq,provider,model,effort,request_message_id,conversation_key) VALUES(?1,?2,?3,?4,?5,'running',0,?6,?7,?8,?9,?10)",params![id,input.session_id,input.project_id,input.task_copy_id,input.mode,input.provider,input.model,input.effort,input.request_message_id,input.conversation_key]).map_err(|_|crate::i18n::text("프로젝트에 진행 중인 실행이 있거나 실행을 저장할 수 없어요."))?;
        tx.commit().map_err(|e| e.to_string())?;
        // The reservation is durable before any process starts. A crash here is
        // recovered as failed on the next launch, never silently resumed.
        self.append_run(
            &id,
            Payload::RunStarted(RunStarted {
                mode: input.mode.clone(),
                task_copy_id: input.task_copy_id.clone(),
                baseline_id: input.task_copy_id.clone(),
            }),
        )?;
        self.native_run(&id)
    }
    pub fn native_run(&self, id: &str) -> Result<NativeRun> {
        self.conn
            .query_row(
                &format!("SELECT {COLUMNS} FROM native_runs WHERE id=?1"),
                [id],
                row,
            )
            .map_err(|_| "unknown native run".into())
    }
    pub fn native_runs(&self, session: &str) -> Result<Vec<NativeRun>> {
        let mut query=self.conn.prepare(&format!("SELECT {COLUMNS} FROM native_runs WHERE session_id=?1 ORDER BY rowid DESC LIMIT 100")).map_err(|e|e.to_string())?;
        let result = query
            .query_map([session], row)
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string());
        result
    }
    pub fn run_events(&self, id: &str, after: u64) -> Result<Vec<Event>> {
        self.native_run(id)?;
        let mut query = self
            .conn
            .prepare("SELECT payload FROM events WHERE run_id=?1 AND seq>?2 ORDER BY seq LIMIT 128")
            .map_err(|e| e.to_string())?;
        let rows = query
            .query_map(params![id, after], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.map(|v| Event::parse(&v.map_err(|e| e.to_string())?))
            .collect()
    }
    pub(crate) fn bind_run(&self, id: &str, thread: &str, turn: Option<&str>) -> Result<()> {
        let run = self.native_run(id)?;
        if terminal(&run.status)
            || run.thread_id.as_deref().is_some_and(|t| t != thread)
            || run.turn_id.as_deref().is_some_and(|t| Some(t) != turn)
        {
            return Err("stale run binding".into());
        }
        self.conn
            .execute(
                "UPDATE native_runs SET thread_id=?2,turn_id=?3 WHERE id=?1",
                params![id, thread, turn],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub(crate) fn append_run(&mut self, id: &str, payload: Payload) -> Result<Event> {
        let run = self.native_run(id)?;
        if terminal(&run.status) {
            return Err("run already finished".into());
        }
        if run.seq >= 10_000 && !matches!(payload, Payload::RunFinished(_)) {
            return Err("event_limit".into());
        }
        let timestamp: String = self
            .conn
            .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        let event = Event {
            schema_version: 1,
            id: uuid::Uuid::new_v4().to_string(),
            session_id: run.session_id,
            run_id: id.into(),
            seq: run.seq + 1,
            timestamp,
            provider: run.provider,
            origin: "live".into(),
            source_event_id: None,
            content: payload,
        };
        let mut value = serde_json::to_value(&event).map_err(|e| e.to_string())?;
        sanitize_value(&mut value);
        let clean = serde_json::to_string(&value).map_err(|e| e.to_string())?;
        if clean.len() > 128 * 1024 {
            return Err("event_size_limit".into());
        }
        let event = Event::parse(&clean)?;
        let unresolved:i64 = self.conn.query_row("SELECT count(*) FROM events request WHERE request.run_id=?1 AND json_extract(request.payload,'$.kind')='approval_requested' AND NOT EXISTS(SELECT 1 FROM events resolution WHERE resolution.run_id=request.run_id AND json_extract(resolution.payload,'$.kind')='approval_resolved' AND json_extract(resolution.payload,'$.payload.approvalId')=json_extract(request.payload,'$.payload.ref.approvalId'))",[id],|r|r.get(0)).map_err(|e|e.to_string())?;
        let status = match &event.content {
            Payload::ApprovalRequested(_) => "awaiting_approval",
            Payload::ApprovalResolved(_) => {
                if unresolved > 1 {
                    "awaiting_approval"
                } else {
                    "running"
                }
            }
            Payload::RunFinished(p) => match p.status {
                Terminal::Completed => "completed",
                Terminal::Failed => "failed",
                Terminal::Cancelled => "cancelled",
            },
            _ => run.status.as_str(),
        };
        let tx = self.conn.transaction().map_err(|e| e.to_string())?;
        let bytes: i64 = tx
            .query_row(
                "SELECT COALESCE(sum(length(CAST(payload AS BLOB))),0) FROM events WHERE run_id=?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if bytes + clean.len() as i64 > 16 * 1024 * 1024
            && !matches!(event.content, Payload::RunFinished(_))
        {
            return Err("event_storage_limit".into());
        }
        if tx
            .execute(
                "UPDATE native_runs SET seq=?2,status=?3 WHERE id=?1 AND seq=?4",
                params![id, event.seq, status, run.seq],
            )
            .map_err(|e| e.to_string())?
            != 1
        {
            return Err("event sequence conflict".into());
        }
        tx.execute(
            "INSERT INTO events(id,run_id,seq,payload) VALUES(?1,?2,?3,?4)",
            params![event.id, id, event.seq, clean],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(event)
    }
    /// Called once before workers are created. No persisted PID is ever signalled.
    pub fn recover_native_runs(&mut self) -> Result<usize> {
        let ids = {
            let mut q=self.conn.prepare("SELECT id FROM native_runs WHERE status NOT IN ('completed','failed','cancelled')").map_err(|e|e.to_string())?;
            let result = q
                .query_map([], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?
                .collect::<std::result::Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            result
        };
        for id in &ids {
            self.append_run(
                id,
                Payload::RunFinished(RunFinished {
                    status: Terminal::Failed,
                    reason_code: "app_restarted".into(),
                    verification: Verification::Incomplete,
                    pending_artifacts: vec![],
                }),
            )?;
        }
        Ok(ids.len())
    }
}
