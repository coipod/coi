//! Claude CLI stream-json adapter. Full assistant messages are consumed once;
//! partial-message mode is intentionally omitted to avoid duplicate text.
use crate::{adapters::codex::Signal, Result};
use serde_json::Value;
#[derive(Default)]
pub struct Protocol {
    pub session_id: Option<String>,
    pub actual_model: Option<String>,
    pub terminal: bool,
    buffer: Vec<u8>,
    saw_text: bool,
    allowed_tools: Option<Vec<String>>,
}
impl Protocol {
    pub fn restricted(read_only: bool) -> Self {
        Self {
            allowed_tools: Some(
                if read_only {
                    vec!["Read", "Glob", "Grep"]
                } else {
                    vec!["Read", "Write", "Edit", "Glob", "Grep"]
                }
                .into_iter()
                .map(String::from)
                .collect(),
            ),
            ..Self::default()
        }
    }

    pub fn feed(&mut self, chunk: &[u8]) -> Result<Vec<Signal>> {
        self.buffer.extend_from_slice(chunk);
        if self.buffer.len() > 1024 * 1024 {
            return Err("protocol_error: frame limit".into());
        }
        let mut out = vec![];
        while let Some(index) = self.buffer.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = self.buffer.drain(..=index).collect();
            if line.iter().all(u8::is_ascii_whitespace) {
                continue;
            }
            let value: Value =
                serde_json::from_slice(&line).map_err(|_| "protocol_error: malformed JSON")?;
            if self.terminal {
                continue;
            }
            if let Some(id) = value["session_id"].as_str() {
                if id.len() > 256 || self.session_id.as_deref().is_some_and(|bound| bound != id) {
                    return Err("protocol_error: foreign session".into());
                }
                self.session_id = Some(id.into());
            }
            match value["type"].as_str() {
                Some("system") if value["subtype"] == "init" => {
                    if let Some(allowed) = &self.allowed_tools {
                        if value["tools"].as_array().is_none_or(|tools| {
                            tools.iter().any(|tool| {
                                tool.as_str()
                                    .is_none_or(|name| !allowed.iter().any(|item| item == name))
                            })
                        }) || ["mcp_servers", "plugins", "skills"]
                            .iter()
                            .any(|key| value[key].as_array().is_some_and(|items| !items.is_empty()))
                        {
                            return Err("provider_scope_mismatch".into());
                        }
                    }
                    self.actual_model = value["model"].as_str().map(String::from);
                }
                Some("assistant") => {
                    if !value["parent_tool_use_id"].is_null() {
                        continue;
                    }
                    if let Some(content) = value["message"]["content"].as_array() {
                        for block in content {
                            match block["type"].as_str() {
                                Some("text") => {
                                    if let Some(text) = block["text"].as_str() {
                                        self.saw_text = true;
                                        out.push(Signal::Text(crate::storage::redact(text)));
                                    }
                                }
                                Some("tool_use") => {
                                    let name = block["name"].as_str().unwrap_or("tool");
                                    let target = block["input"]["file_path"]
                                        .as_str()
                                        .or_else(|| block["input"]["command"].as_str())
                                        .unwrap_or(name);
                                    out.push(Signal::Activity {
                                        id: block["id"].as_str().ok_or("missing tool id")?.into(),
                                        phase: "started".into(),
                                        kind: match name {
                                            "Read" | "Glob" | "Grep" => "reading",
                                            "Write" | "Edit" => "editing",
                                            "Bash" => "command",
                                            _ => "analyzing",
                                        }
                                        .into(),
                                        target: crate::storage::redact(target)
                                            .chars()
                                            .take(256)
                                            .collect(),
                                        result: None,
                                    });
                                }
                                _ => (),
                            }
                        }
                    }
                }
                Some("user") => {
                    if let Some(content) = value["message"]["content"].as_array() {
                        for block in content
                            .iter()
                            .filter(|block| block["type"] == "tool_result")
                        {
                            out.push(Signal::Activity {
                                id: block["tool_use_id"]
                                    .as_str()
                                    .ok_or("missing tool id")?
                                    .into(),
                                phase: "finished".into(),
                                kind: "analyzing".into(),
                                target: "".into(),
                                result: Some(
                                    if block["is_error"] == true {
                                        crate::i18n::text("도구 실행 거부 또는 오류")
                                    } else {
                                        crate::i18n::text("도구 응답 수신")
                                    }
                                    .into(),
                                ),
                            });
                        }
                    }
                }
                Some("result") => {
                    if !self.saw_text {
                        if let Some(text) = value["result"].as_str() {
                            out.push(Signal::Text(crate::storage::redact(text)));
                        }
                    }
                    let success = value["subtype"] == "success" && value["is_error"] == false;
                    if let Some(denials) = value["permission_denials"]
                        .as_array()
                        .filter(|denials| !denials.is_empty())
                    {
                        out.push(Signal::Warning(crate::localized_format!(
                            "{}개 도구 요청이 허용되지 않았어요. 결과를 확인해 주세요.",
                            "{} tool requests were not allowed. Review the results.",
                            "{}件のツールリクエストが許可されませんでした。結果をご確認ください。",
                            denials.len()
                        )));
                    }
                    self.terminal = true;
                    out.push(Signal::Finished(
                        if success { "completed" } else { "failed" }.into(),
                    ));
                }
                Some("control_request") => {
                    return Err("unsupported_provider_control_request".into())
                }
                Some(_) => (),
                None => return Err("protocol_error: missing type".into()),
            }
        }
        Ok(out)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn success_requires_success_result_and_text_is_not_duplicated() {
        let mut protocol = Protocol::default();
        let signals = protocol.feed(b"{\"type\":\"assistant\",\"session_id\":\"s\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"ok\"}]}}\n{\"type\":\"result\",\"session_id\":\"s\",\"subtype\":\"success\",\"is_error\":false,\"result\":\"ok\"}\n").unwrap();
        assert_eq!(
            signals,
            vec![
                Signal::Text("ok".into()),
                Signal::Finished("completed".into())
            ]
        );
        let mut protocol = Protocol::default();
        assert_eq!(protocol.feed(b"{\"type\":\"result\",\"subtype\":\"error_during_execution\",\"is_error\":true}\n").unwrap(), vec![Signal::Finished("failed".into())]);
    }
    #[test]
    fn rejects_cross_session_events() {
        let mut protocol = Protocol::default();
        protocol
            .feed(b"{\"type\":\"system\",\"session_id\":\"first\"}\n")
            .unwrap();
        assert!(protocol
            .feed(b"{\"type\":\"result\",\"session_id\":\"other\"}\n")
            .is_err());
    }
}
