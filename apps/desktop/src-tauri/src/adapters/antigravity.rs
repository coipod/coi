//! Antigravity 1.2 NDJSON: event/init, step_update, result.
//! One instance represents one turn; never interpret a successful exit as verification.
use crate::{adapters::codex::Signal, Result};
use serde_json::Value;
#[derive(Default)]
pub struct Protocol {
    pub terminal: bool,
    pub conversation_id: Option<String>,
    buffer: Vec<u8>,
    text_buffer: String,
    streamed: bool,
}
impl Protocol {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn push(&mut self, chunk: &[u8]) -> Result<()> {
        self.buffer.extend_from_slice(chunk);
        if self.buffer.len() > 1024 * 1024 {
            return Err("protocol_error: frame limit".into());
        }
        Ok(())
    }
    pub fn next_frame(&mut self) -> Result<Option<Vec<Signal>>> {
        while let Some(pos) = self.buffer.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = self.buffer.drain(..=pos).collect();
            if line.iter().all(u8::is_ascii_whitespace) {
                continue;
            }
            let value =
                serde_json::from_slice(&line).map_err(|_| "protocol_error: malformed JSON")?;
            return self.message(value).map(Some);
        }
        Ok(None)
    }
    pub fn feed(&mut self, chunk: &[u8]) -> Result<Vec<Signal>> {
        self.push(chunk)?;
        let mut out = vec![];
        while let Some(signals) = self.next_frame()? {
            out.extend(signals);
        }
        Ok(out)
    }
    fn text(&mut self, delta: &str) -> Result<Vec<Signal>> {
        self.streamed = true;
        self.text_buffer.push_str(delta);
        if self.text_buffer.len() > 65536 {
            return Err("protocol_error: unterminated text limit".into());
        }
        if let Some(end) = self.text_buffer.rfind('\n') {
            let line: String = self.text_buffer.drain(..=end).collect();
            return Ok(vec![Signal::Text(crate::storage::redact(&line))]);
        }
        Ok(vec![])
    }
    fn bind(&mut self, value: &Value) -> Result<()> {
        if let Some(id) = value["conversation_id"]
            .as_str()
            .filter(|id| !id.is_empty())
        {
            if id.len() > 256
                || self
                    .conversation_id
                    .as_deref()
                    .is_some_and(|bound| bound != id)
            {
                return Err("protocol_error: foreign conversation".into());
            }
            self.conversation_id = Some(id.into());
        }
        Ok(())
    }
    fn message(&mut self, value: Value) -> Result<Vec<Signal>> {
        if self.terminal {
            return Ok(vec![]);
        }
        match value["event"].as_str() {
            Some("init") => {
                self.bind(&value)?;
                Ok(vec![])
            }
            Some("step_update") => {
                let step = &value["step_update"];
                self.bind(step)?;
                match step["step_type"].as_str() {
                    Some("agent_response") => self.text(step["text_delta"].as_str().unwrap_or("")),
                    Some("tool") => {
                        let tool = &step["tool_info"];
                        let name = step["tool_name"]
                            .as_str()
                            .or_else(|| tool["name"].as_str())
                            .unwrap_or("tool");
                        let phase = match step["state"].as_str() {
                            Some("ACTIVE") => "started",
                            Some("DONE" | "ERROR") => "finished",
                            _ => return Err("protocol_error: unknown tool state".into()),
                        };
                        let kind = match name {
                            "run_command" => "command",
                            "write_to_file"
                            | "replace_file_content"
                            | "multi_replace_file_content" => "editing",
                            "view_file" | "read_file" | "list_dir" | "grep_search"
                            | "find_by_name" => "reading",
                            _ => "analyzing",
                        };
                        let parameters = &tool["parameters"];
                        let target = ["TargetFile", "AbsolutePath", "DirectoryPath", "CommandLine"]
                            .into_iter()
                            .find_map(|key| parameters[key].as_str())
                            .unwrap_or(name);
                        let result = tool["error"]["message"]
                            .as_str()
                            .or_else(|| tool["output"].as_str());
                        Ok(vec![Signal::Activity {
                            id: format!(
                                "step-{}",
                                step["step_index"].as_u64().ok_or("missing step index")?
                            ),
                            phase: phase.into(),
                            kind: kind.into(),
                            target: crate::storage::redact(target).chars().take(256).collect(),
                            result: result.map(|text| {
                                crate::storage::redact(text).chars().take(1024).collect()
                            }),
                        }])
                    }
                    _ => Ok(vec![]),
                }
            }
            Some("result") => {
                let result = &value["result"];
                self.bind(result)?;
                let status = match result["status"].as_str() {
                    Some("SUCCESS") => "completed",
                    Some("CANCELED" | "INTERRUPTED") => "cancelled",
                    Some("ERROR" | "INVALID" | "WAITING" | "RUNNING") => "failed",
                    _ => return Err("protocol_error: unknown result status".into()),
                };
                let mut out = vec![];
                if !self.streamed {
                    out.extend(self.text(result["response"].as_str().unwrap_or(""))?);
                }
                if !self.text_buffer.is_empty() {
                    out.push(Signal::Text(crate::storage::redact(&std::mem::take(
                        &mut self.text_buffer,
                    ))));
                }
                if let Some(error) = result["error"].as_str() {
                    out.push(Signal::Warning(crate::storage::redact(error)));
                }
                if let Some(denials) = result["denied_actions"]
                    .as_array()
                    .filter(|items| !items.is_empty())
                {
                    out.push(Signal::Warning(crate::localized_format!(
                        "{}개 작업은 추가 승인을 받을 수 없어 실행되지 않았어요.",
                        "{} tasks were not run because additional approval was unavailable.",
                        "追加承認を取得できないため、{}件の作業を実行しませんでした。",
                        denials.len()
                    )));
                }
                self.terminal = true;
                out.push(Signal::Finished(status.into()));
                Ok(out)
            }
            Some(_) => Ok(vec![]),
            None => Err("protocol_error: missing event discriminator".into()),
        }
    }
}

/// Existing CLI customizations are never modified. Broad grants and executable
/// hooks/plugins need a separately reviewed execution profile.
pub fn check_settings() -> Result<()> {
    let home = dirs::home_dir().ok_or("missing home directory")?;
    let settings = home.join(".gemini/antigravity-cli/settings.json");
    if settings.exists() {
        let bytes = std::fs::read(&settings)
            .map_err(|_| crate::i18n::text("Antigravity 설정을 확인할 수 없어요."))?;
        if bytes.len() > 1024 * 1024 {
            return Err("Antigravity settings limit".into());
        }
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| crate::i18n::text("Antigravity 설정 형식이 올바르지 않아요."))?;
        if value["permissions"]["allow"]
            .as_array()
            .is_some_and(|items| !items.is_empty())
            || value["toolPermission"]
                .as_str()
                .is_some_and(|mode| mode != "request-review")
            || value["allowNonWorkspaceAccess"] == true
        {
            return Err(crate::i18n::text("Antigravity의 전역 자동 승인 설정이 있어요. 이 설정에서 COI 사본 경계를 보장할 수 없어 실행을 중단했어요.").into());
        }
    }
    for root in [
        home.join(".gemini/config"),
        home.join(".gemini/antigravity-cli"),
    ] {
        if root.join("hooks.json").exists()
            || std::fs::read_dir(root.join("plugins")).is_ok_and(|mut items| items.next().is_some())
        {
            return Err(crate::i18n::text(
                "Antigravity 사용자 훅·플러그인의 실행 범위 검증이 필요해요.",
            )
            .into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn streams_fragments_without_duplicating_result() {
        let mut protocol = Protocol::new();
        protocol
            .feed(b"{\"event\":\"init\",\"conversation_id\":\"c\"}\n")
            .unwrap();
        assert!(protocol.feed(b"{\"event\":\"step_update\",\"step_update\":{\"conversation_id\":\"c\",\"step_type\":\"agent_response\",\"text_delta\":\"hello\"}}\n").unwrap().is_empty());
        let signals = protocol.feed(b"{\"event\":\"result\",\"result\":{\"conversation_id\":\"c\",\"status\":\"SUCCESS\",\"response\":\"hello\"}}\n").unwrap();
        assert_eq!(
            signals,
            vec![
                Signal::Text("hello".into()),
                Signal::Finished("completed".into())
            ]
        );
    }
    #[test]
    fn errors_are_not_success_and_foreign_conversations_fail() {
        let mut protocol = Protocol::new();
        let signals = protocol
            .feed(
                b"{\"event\":\"result\",\"result\":{\"status\":\"ERROR\",\"error\":\"denied\"}}\n",
            )
            .unwrap();
        assert_eq!(signals.last(), Some(&Signal::Finished("failed".into())));
        let mut protocol = Protocol::new();
        protocol
            .feed(b"{\"event\":\"init\",\"conversation_id\":\"a\"}\n")
            .unwrap();
        assert!(protocol.feed(b"{\"event\":\"result\",\"result\":{\"conversation_id\":\"b\",\"status\":\"SUCCESS\"}}\n").is_err());
    }
}
