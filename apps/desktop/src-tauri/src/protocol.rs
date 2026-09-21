use crate::Result;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Verification {
    NotRun,
    Running,
    Passed,
    Failed,
    Incomplete,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Terminal {
    Completed,
    Failed,
    Cancelled,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ApprovalRef {
    pub approval_id: String,
    pub provider_request_id: String,
    pub thread_id: String,
    pub turn_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_id: Option<String>,
}
macro_rules! payload {($name:ident{$($key:ident:$ty:ty),*$(,)?})=>{#[derive(Clone,Debug,Serialize,Deserialize)]#[serde(deny_unknown_fields,rename_all="camelCase")]pub struct $name{$(pub $key:$ty),*}}}
payload!(RunStarted {
    mode: String,
    task_copy_id: String,
    baseline_id: String
});
payload!(AssistantDelta {
    message_id: String,
    text: String
});

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Activity {
    pub activity_id: String,
    pub phase: String,
    #[serde(rename = "type")]
    pub activity_type: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApprovalRequested {
    #[serde(rename = "ref")]
    pub reference: ApprovalRef,
    pub scope: String,
    pub risk: String,
    pub decisions: Vec<String>,
    pub description: String,
}
payload!(ApprovalResolved {
    approval_id: String,
    state: String,
    actor: String
});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct VerificationChanged {
    pub status: Verification,
    pub check_id: String,
    pub artifact_hash: String,
    pub evidence_ref: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    pub summary: String,
}
payload!(ArtifactCreated {
    artifact_id: String,
    kind: String,
    relative_path: String,
    content_hash: String
});
payload!(RunWarning {
    code: String,
    redacted_message: String,
    retryable: bool
});
payload!(RunFinished{status:Terminal,reason_code:String,verification:Verification,pending_artifacts:Vec<String>});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", content = "payload", rename_all = "snake_case")]
pub enum Payload {
    RunStarted(RunStarted),
    AssistantDelta(AssistantDelta),
    Activity(Activity),
    ApprovalRequested(ApprovalRequested),
    ApprovalResolved(ApprovalResolved),
    VerificationChanged(VerificationChanged),
    ArtifactCreated(ArtifactCreated),
    RunWarning(RunWarning),
    RunFinished(RunFinished),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub schema_version: u8,
    pub id: String,
    pub session_id: String,
    pub run_id: String,
    pub seq: u64,
    pub timestamp: String,
    pub provider: String,
    pub origin: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_event_id: Option<String>,
    #[serde(flatten)]
    pub content: Payload,
}
impl Event {
    pub fn parse(raw: &str) -> Result<Self> {
        let v: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
        let object = v.as_object().ok_or("event must be an object")?;
        let allowed = [
            "schemaVersion",
            "id",
            "sessionId",
            "runId",
            "seq",
            "timestamp",
            "provider",
            "origin",
            "sourceEventId",
            "kind",
            "payload",
        ];
        if object.keys().any(|k| !allowed.contains(&k.as_str())) {
            return Err("unknown envelope field".into());
        }
        let e: Self = serde_json::from_value(v).map_err(|e| e.to_string())?;
        if e.schema_version != 1
            || e.seq == 0
            || !["demo", "codex", "claude", "gemini", "antigravity"].contains(&e.provider.as_str())
            || !["demo", "live"].contains(&e.origin.as_str())
            || (e.provider == "demo") != (e.origin == "demo")
        {
            return Err("invalid envelope".into());
        }
        match &e.content {
            Payload::RunStarted(p) if !["plan", "review_copy"].contains(&p.mode.as_str()) => {
                return Err("invalid mode".into())
            }
            Payload::Activity(p)
                if !["started", "finished"].contains(&p.phase.as_str())
                    || !["reading", "analyzing", "editing", "command"]
                        .contains(&p.activity_type.as_str()) =>
            {
                return Err("invalid activity".into())
            }
            Payload::ApprovalRequested(p)
                if !["L1", "L2"].contains(&p.risk.as_str())
                    || p.decisions
                        .iter()
                        .any(|d| !["allow_once", "deny", "cancel_run"].contains(&d.as_str())) =>
            {
                return Err("invalid approval".into())
            }
            Payload::ApprovalResolved(p)
                if !["accepted", "denied", "cancelled", "expired"].contains(&p.state.as_str())
                    || !["user", "provider", "system"].contains(&p.actor.as_str()) =>
            {
                return Err("invalid approval result".into())
            }
            Payload::ArtifactCreated(p)
                if !["diff", "code", "markdown", "image", "log"].contains(&p.kind.as_str()) =>
            {
                return Err("invalid artifact".into())
            }
            Payload::VerificationChanged(p)
                if p.status == Verification::Passed
                    && (p.command.as_deref().unwrap_or("").is_empty()
                        || p.exit_code != Some(0)
                        || p.artifact_hash.is_empty()
                        || p.evidence_ref.is_empty()) =>
            {
                return Err("verification evidence required".into())
            }
            _ => {}
        }
        Ok(e)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_contract_fixture() {
        let data = include_str!("../../../../tests/fixtures/events.json");
        let events: Vec<serde_json::Value> = serde_json::from_str(data).unwrap();
        for v in events {
            let e = Event::parse(&v.to_string()).unwrap();
            assert_eq!(serde_json::to_value(e).unwrap(), v);
        }
    }
    #[test]
    fn payload_is_closed() {
        let raw = r#"{"schemaVersion":1,"id":"e","sessionId":"s","runId":"r","seq":1,"timestamp":"now","provider":"demo","origin":"demo","kind":"assistant_delta","payload":{"messageId":"m","text":"a","unexpected":true}}"#;
        assert!(Event::parse(raw).is_err());
    }
}
