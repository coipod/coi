//! Bounded app-server response parser, exercised against synthetic fixtures.
//! No production thread/turn builder is exposed until the CLI's effective
//! permission profile and external-tool isolation have been certified.
use crate::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RequestId {
    Number(i64),
    Text(String),
}
#[derive(Debug, Clone)]
pub struct Approval {
    pub id: RequestId,
    pub thread: String,
    pub turn: String,
    pub item: String,
    pub method: String,
    pub decided: bool,
    pub description: String,
}
#[derive(Default)]
pub struct Protocol {
    pub thread: Option<String>,
    pub turn: Option<String>,
    pub terminal: bool,
    pub pending: BTreeMap<String, Approval>,
    seen: BTreeSet<String>,
    buffer: Vec<u8>,
    text_buffer: String,
}
#[derive(Debug, PartialEq)]
pub enum Signal {
    Text(String),
    Approval(String),
    ApprovalResolved(String),
    Activity {
        id: String,
        phase: String,
        kind: String,
        target: String,
        result: Option<String>,
    },
    Finished(String),
    Warning(String),
    Response(u64, Value),
}
impl Protocol {
    pub fn initialize() -> Value {
        json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"coi","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":false}}})
    }
    pub fn interrupt(&self) -> Result<Value> {
        Ok(
            json!({"id":4,"method":"turn/interrupt","params":{"threadId":self.thread.as_ref().ok_or("no thread")?,"turnId":self.turn.as_ref().ok_or("no turn")?}}),
        )
    }
    pub fn push(&mut self, chunk: &[u8]) -> Result<()> {
        self.buffer.extend_from_slice(chunk);
        if self.buffer.len() > 1024 * 1024 {
            return Err("protocol_error: frame limit".into());
        }
        Ok(())
    }
    // Process one frame at a time so response bindings are installed before a
    // following notification, even when the OS coalesces both into one read.
    pub fn next_frame(&mut self) -> Result<Option<Vec<Signal>>> {
        while let Some(pos) = self.buffer.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = self.buffer.drain(..=pos).collect();
            if line.iter().all(u8::is_ascii_whitespace) {
                continue;
            }
            let v: Value = serde_json::from_slice(&line)
                .map_err(|_| "protocol_error: malformed JSON".to_string())?;
            return self.message(v).map(Some);
        }
        Ok(None)
    }
    pub fn feed(&mut self, chunk: &[u8]) -> Result<Vec<Signal>> {
        self.push(chunk)?;
        let mut out = vec![];
        while let Some(frame) = self.next_frame()? {
            out.extend(frame);
        }
        Ok(out)
    }
    fn message(&mut self, v: Value) -> Result<Vec<Signal>> {
        if self.terminal {
            return Ok(vec![]);
        }
        if v.get("error").is_some() {
            return Err(format!(
                "protocol_error: {}",
                crate::storage::redact(
                    v["error"]["message"]
                        .as_str()
                        .unwrap_or("server rejected request")
                )
                .chars()
                .take(600)
                .collect::<String>()
            ));
        }
        if let Some(id) = v["id"].as_u64() {
            if let Some(result) = v.get("result") {
                return Ok(vec![Signal::Response(id, result.clone())]);
            }
        }
        let method = v["method"]
            .as_str()
            .ok_or("protocol_error: method missing")?;
        let p = &v["params"];
        if matches!(
            method,
            "item/agentMessage/delta"
                | "item/commandExecution/requestApproval"
                | "item/fileChange/requestApproval"
                | "item/started"
                | "item/completed"
        ) && (self.thread.is_none()
            || self.turn.is_none()
            || p["threadId"].as_str() != self.thread.as_deref()
            || p["turnId"].as_str() != self.turn.as_deref())
        {
            return Err("protocol_error: missing or foreign run scope".into());
        }
        if let Some(t) = p["threadId"].as_str() {
            if self.thread.as_deref() != Some(t) {
                return Err("protocol_error: foreign thread".into());
            }
        }
        if let Some(t) = p["turnId"].as_str() {
            if let Some(turn) = &self.turn {
                if turn != t {
                    return Err("protocol_error: foreign turn".into());
                }
            }
        }
        match method {
            "item/agentMessage/delta" => {
                self.text_buffer
                    .push_str(p["delta"].as_str().ok_or("protocol_error: delta")?);
                if self.text_buffer.len() > 65536 {
                    return Err("protocol_error: unterminated text limit".into());
                }
                if let Some(end) = self.text_buffer.rfind('\n') {
                    let line: String = self.text_buffer.drain(..=end).collect();
                    Ok(vec![Signal::Text(crate::storage::redact(&line))])
                } else {
                    Ok(vec![])
                }
            }
            "item/commandExecution/requestApproval" | "item/fileChange/requestApproval" => {
                let id: RequestId = serde_json::from_value(v["id"].clone())
                    .map_err(|_| "protocol_error: request ID")?;
                let key = serde_json::to_string(&id).unwrap();
                if !self.seen.insert(key.clone()) {
                    return Err("protocol_error: duplicate approval".into());
                }
                let thread = p["threadId"]
                    .as_str()
                    .ok_or("protocol_error: thread")?
                    .to_string();
                let turn = p["turnId"]
                    .as_str()
                    .ok_or("protocol_error: turn")?
                    .to_string();
                let item = p["itemId"]
                    .as_str()
                    .ok_or("protocol_error: item")?
                    .to_string();
                if [
                    "additionalPermissions",
                    "grantRoot",
                    "networkApprovalContext",
                    "environmentId",
                ]
                .iter()
                .any(|k| p.get(k).is_some_and(|v| !v.is_null()))
                {
                    return Err("policy_error: permission expansion is unsupported".into());
                }
                if method == "item/commandExecution/requestApproval"
                    && p["kind"].as_str().is_some_and(|kind| kind != "command")
                {
                    return Err("policy_error: unsupported approval kind".into());
                }
                self.pending.insert(
                    key.clone(),
                    Approval {
                        id,
                        thread,
                        turn,
                        item,
                        method: method.into(),
                        decided: false,
                        description: crate::storage::redact(
                            p["command"]
                                .as_str()
                                .or_else(|| p["reason"].as_str())
                                .unwrap_or(crate::i18n::text("작업 사본 변경 승인")),
                        )
                        .chars()
                        .take(2048)
                        .collect(),
                    },
                );
                Ok(vec![Signal::Approval(key)])
            }
            "serverRequest/resolved" => {
                let key = serde_json::to_string(&p["requestId"]).unwrap();
                if p["threadId"].as_str() != self.thread.as_deref() || self.thread.is_none() {
                    return Err("protocol_error: unscoped approval resolution".into());
                }
                if self.pending.remove(&key).is_some() {
                    Ok(vec![Signal::ApprovalResolved(key)])
                } else {
                    Ok(vec![])
                }
            }
            "turn/started" => {
                if self.thread.is_none() || p["threadId"].as_str() != self.thread.as_deref() {
                    return Err("protocol_error: unscoped turn".into());
                }
                let id = p["turn"]["id"].as_str().ok_or("protocol_error: turn ID")?;
                if self.turn.as_deref().is_some_and(|t| t != id) {
                    return Err("protocol_error: foreign turn".into());
                }
                self.turn = Some(id.into());
                Ok(vec![])
            }
            "turn/completed" => {
                if p["threadId"].as_str() != self.thread.as_deref()
                    || self.thread.is_none()
                    || p["turn"]["id"].as_str() != self.turn.as_deref()
                    || self.turn.is_none()
                {
                    return Err("protocol_error: foreign terminal turn".into());
                }
                let status = p["turn"]["status"]
                    .as_str()
                    .ok_or("protocol_error: terminal")?;
                if !["completed", "interrupted", "failed"].contains(&status) {
                    return Err("protocol_error: terminal status".into());
                }
                self.terminal = true;
                self.pending.clear();
                let mut signals = vec![];
                if !self.text_buffer.is_empty() {
                    signals.push(Signal::Text(crate::storage::redact(&std::mem::take(
                        &mut self.text_buffer,
                    ))));
                }
                signals.push(Signal::Finished(status.into()));
                Ok(signals)
            }
            "item/started" | "item/completed" => {
                let item = &p["item"];
                let kind = match item["type"].as_str() {
                    Some("commandExecution") => "command",
                    Some("fileChange") => "editing",
                    Some("reasoning" | "plan") => "analyzing",
                    Some("agentMessage" | "userMessage") => return Ok(vec![]),
                    _ => return Ok(vec![Signal::Warning("unmapped_item".into())]),
                };
                let target = crate::storage::redact(
                    item["command"]
                        .as_str()
                        .unwrap_or(crate::i18n::text("작업 사본")),
                )
                .chars()
                .take(2048)
                .collect();
                Ok(vec![Signal::Activity {
                    id: item["id"].as_str().ok_or("protocol_error: item ID")?.into(),
                    phase: if method == "item/started" {
                        "started"
                    } else {
                        "finished"
                    }
                    .into(),
                    kind: kind.into(),
                    target,
                    result: item["exitCode"].as_i64().map(|n| format!("exit code {n}")),
                }])
            }
            method
                if v.get("id").is_some()
                    || method.contains("Approval")
                    || method.contains("permission") =>
            {
                Err("protocol_error: unsupported control request".into())
            }
            _ => Ok(vec![Signal::Warning(method.chars().take(100).collect())]),
        }
    }
    pub fn decide(&mut self, key: &str, thread: &str, turn: &str, decision: &str) -> Result<Value> {
        if self.terminal {
            return Err("expired approval".into());
        }
        let p = self.pending.get_mut(key).ok_or("unknown approval")?;
        if p.decided || p.thread != thread || p.turn != turn {
            return Err("stale or foreign approval".into());
        }
        let wire = match decision {
            "allow_once" => "accept",
            "deny" => "decline",
            "cancel_run" => "cancel",
            _ => return Err("unsupported decision".into()),
        };
        p.decided = true;
        Ok(json!({"id":p.id,"result":{"decision":wire}}))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn partial_and_invalid_frames() {
        let mut p = Protocol::default();
        assert!(p.feed(br#"{"id":1,"res"#).unwrap().is_empty());
        assert_eq!(p.feed(b"ult\":{} }\n").unwrap().len(), 1);
        assert!(p.feed(b"not json\n").is_err());
    }
    #[test]
    fn approval_once_and_terminal() {
        let mut p = Protocol {
            thread: Some("t".into()),
            turn: Some("u".into()),
            ..Default::default()
        };
        let req = json!({"id":8,"method":"item/fileChange/requestApproval","params":{"threadId":"t","turnId":"u","itemId":"f"}});
        p.message(req).unwrap();
        assert!(p.decide("8", "t", "wrong", "allow_once").is_err());
        assert!(p.decide("8", "t", "u", "allow_once").is_ok());
        assert!(p.decide("8", "t", "u", "allow_once").is_err());
        p.message(json!({"method":"turn/completed","params":{"threadId":"t","turn":{"id":"u","status":"completed"}}})).unwrap();
        assert!(p.pending.is_empty());
        assert!(p
            .message(
                json!({"method":"item/agentMessage/delta","params":{"threadId":"t","delta":"late"}})
            )
            .unwrap()
            .is_empty());
    }
    #[test]
    fn split_secrets_and_foreign_terminal() {
        let mut p = Protocol {
            thread: Some("t".into()),
            turn: Some("u".into()),
            ..Default::default()
        };
        for delta in ["api_", "key=do-not", "-expose"] {
            assert!(p.message(json!({"method":"item/agentMessage/delta","params":{"threadId":"t","turnId":"u","delta":delta}})).unwrap().is_empty());
        }
        assert!(p.message(json!({"method":"turn/completed","params":{"threadId":"t","turn":{"id":"foreign","status":"completed"}}})).is_err());
        let signals=p.message(json!({"method":"turn/completed","params":{"threadId":"t","turn":{"id":"u","status":"completed"}}})).unwrap();
        assert_eq!(signals[0], Signal::Text("api_key=[REDACTED]".into()));
        assert_eq!(signals[1], Signal::Finished("completed".into()));
    }
    #[test]
    fn null_permission_fields_are_absent_but_expansions_and_unscoped_lifecycle_fail() {
        let mut p = Protocol {
            thread: Some("t".into()),
            turn: Some("u".into()),
            ..Default::default()
        };
        p.message(json!({"id":-2,"method":"item/fileChange/requestApproval","params":{"threadId":"t","turnId":"u","itemId":"i","grantRoot":null}})).unwrap();
        assert!(p.decide("-2", "t", "u", "deny").is_ok());
        assert!(p.message(json!({"id":3,"method":"item/fileChange/requestApproval","params":{"threadId":"t","turnId":"u","itemId":"i","grantRoot":"/outside"}})).is_err());
        assert!(p
            .message(json!({"method":"serverRequest/resolved","params":{"requestId":-2}}))
            .is_err());
        assert!(p
            .message(
                json!({"method":"turn/completed","params":{"turn":{"id":"u","status":"completed"}}})
            )
            .is_err());
        assert!(!p.terminal);
        assert!(p.message(json!({"id":4,"method":"item/commandExecution/requestApproval","params":{"threadId":"t","turnId":"u","itemId":"i","kind":"stdin"}})).is_err());
        assert!(p.message(json!({"id":5,"method":"item/commandExecution/requestApproval","params":{"threadId":"t","turnId":"u","itemId":"i","environmentId":"remote"}})).is_err());
    }
    #[test]
    fn unscoped_text_and_approval_before_turn_are_rejected() {
        let mut p = Protocol {
            thread: Some("t".into()),
            ..Default::default()
        };
        assert!(p.message(json!({"id":1,"method":"item/fileChange/requestApproval","params":{"threadId":"t","turnId":"u","itemId":"i"}})).is_err());
        p.turn = Some("u".into());
        assert!(p
            .message(json!({"method":"item/agentMessage/delta","params":{"delta":"unscoped"}}))
            .is_err());
        assert!(p.pending.is_empty());
    }
}
