//! Read-only discovery. Model choices must come from the selected CLI.
use super::{executable, transport::StdioTransport};
use crate::Result;
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Model {
    id: String,
    label: String,
    efforts: Vec<String>,
    default_effort: String,
}
#[derive(Serialize)]
pub struct Choice {
    model: String,
    effort: String,
}
#[derive(Serialize)]
pub struct Capabilities {
    provider: String,
    models: Vec<Model>,
    presets: BTreeMap<String, Choice>,
}
fn rpc(transport: &mut StdioTransport, request: Value) -> Result<Value> {
    let claude = request["type"] == "control_request";
    let id = if claude {
        request["request_id"].clone()
    } else {
        request["id"].clone()
    };
    transport.send(&request)?;
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut buffer = Vec::new();
    while Instant::now() < deadline {
        match transport.receive(Duration::from_millis(200)) {
            Ok(chunk) => buffer.extend(chunk),
            Err(error) if error == "provider_timeout" => continue,
            Err(error) => return Err(error),
        }
        if buffer.len() > 1024 * 1024 {
            return Err("model_response_too_large".into());
        }
        while let Some(index) = buffer.iter().position(|byte| *byte == b'\n') {
            let line: Vec<_> = buffer.drain(..=index).collect();
            let value: Value =
                serde_json::from_slice(&line).map_err(|_| "invalid_model_response")?;
            if claude && value["response"]["request_id"] == id {
                if value["response"]["subtype"] != "success" {
                    return Err("model_discovery_failed".into());
                }
                return Ok(value["response"]["response"].clone());
            }
            if !claude && value["id"] == id {
                if value.get("error").is_some() {
                    return Err(crate::i18n::text(
                        "이 CLI 버전은 모델 조회를 지원하지 않아요. 공식 업데이트가 필요해요.",
                    )
                    .into());
                }
                return Ok(value["result"].clone());
            }
        }
    }
    Err(crate::i18n::text("모델 조회 시간이 초과됐어요.").into())
}
pub fn discover(provider: &str) -> Result<Capabilities> {
    let executable_name = match provider {
        "codex" => "codex",
        "claude" => "claude",
        "antigravity" => "agy",
        _ => return Err("unknown provider".into()),
    };
    let path =
        executable(executable_name).ok_or(crate::i18n::text("CLI를 설치하고 연결해 주세요."))?;
    let cwd = std::env::temp_dir();
    let models = if provider == "codex" {
        let mut transport = StdioTransport::spawn(&path, &["app-server"], &cwd)?;
        rpc(
            &mut transport,
            json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"coi","version":"0.1.0"},"capabilities":{"experimentalApi":false}}}),
        )?;
        transport.send(&json!({"method":"initialized"}))?;
        let result = rpc(
            &mut transport,
            json!({"id":2,"method":"model/list","params":{"includeHidden":false}}),
        )?;
        result["data"]
            .as_array()
            .ok_or("invalid model list")?
            .iter()
            .filter_map(|item| {
                let id = item["model"].as_str()?.to_string();
                let efforts = item["supportedReasoningEfforts"]
                    .as_array()?
                    .iter()
                    .filter_map(|effort| effort["reasoningEffort"].as_str().map(String::from))
                    .collect();
                Some(Model {
                    label: item["displayName"].as_str().unwrap_or(&id).into(),
                    id,
                    efforts,
                    default_effort: item["defaultReasoningEffort"].as_str().unwrap_or("").into(),
                })
            })
            .collect::<Vec<_>>()
    } else if provider == "antigravity" {
        let transport = StdioTransport::spawn(&path, &["models"], &cwd)?;
        let deadline = Instant::now() + Duration::from_secs(25);
        let mut bytes = Vec::new();
        loop {
            match transport.receive(Duration::from_millis(200)) {
                Ok(chunk) => {
                    bytes.extend(chunk);
                    if bytes.len() > 256 * 1024 {
                        return Err("model list too large".into());
                    }
                }
                Err(error) if error == "provider_exited" => break,
                Err(error) if error == "provider_timeout" && Instant::now() < deadline => continue,
                Err(error) => return Err(error),
            }
        }
        String::from_utf8(bytes)
            .map_err(|_| "invalid model encoding")?
            .lines()
            .filter_map(|line| {
                let (id, label) = line.split_once('\t')?;
                if id.is_empty()
                    || !id.bytes().all(|byte| {
                        byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.')
                    })
                {
                    return None;
                }
                Some(Model {
                    id: id.into(),
                    label: label.into(),
                    efforts: id
                        .rsplit_once('-')
                        .filter(|(_, level)| ["low", "medium", "high"].contains(level))
                        .map(|(_, level)| vec![level.into()])
                        .unwrap_or_default(),
                    default_effort: id
                        .rsplit_once('-')
                        .filter(|(_, level)| ["low", "medium", "high"].contains(level))
                        .map(|(_, level)| level.into())
                        .unwrap_or_default(),
                })
            })
            .collect::<Vec<_>>()
    } else {
        let mut transport = StdioTransport::spawn(
            &path,
            &[
                "-p",
                "--input-format",
                "stream-json",
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
                "",
            ],
            &cwd,
        )?;
        let result = rpc(
            &mut transport,
            json!({"type":"control_request","request_id":"coi-models","request":{"subtype":"initialize"}}),
        )?;
        result["models"]
            .as_array()
            .ok_or("invalid Claude model list")?
            .iter()
            .filter_map(|item| {
                let id = item["value"].as_str()?.to_string();
                let efforts: Vec<String> = item["supportedEffortLevels"]
                    .as_array()
                    .map(|levels| {
                        levels
                            .iter()
                            .filter_map(|level| level.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                let default_effort = if efforts.iter().any(|level| level == "medium") {
                    "medium".into()
                } else {
                    efforts.first().cloned().unwrap_or_default()
                };
                Some(Model {
                    id,
                    label: format!(
                        "{} · {}",
                        item["displayName"].as_str().unwrap_or("Claude"),
                        item["resolvedModel"].as_str().unwrap_or("")
                    ),
                    efforts,
                    default_effort,
                })
            })
            .collect::<Vec<_>>()
    };
    if models.is_empty() {
        return Err(crate::i18n::text(
            "사용 가능한 모델을 받지 못했어요. CLI 로그인을 확인해 주세요.",
        )
        .into());
    }
    let mut presets = BTreeMap::new();
    // Only validated, explicitly selected provider mappings are exposed.
    if provider == "antigravity" {
        for (preset, model, effort) in [
            ("performance", "gemini-3.1-pro-high", "high"),
            ("balanced", "gemini-3.8-flash-medium", "medium"),
            ("economy", "gemini-3.8-flash-low", "low"),
        ] {
            if models
                .iter()
                .any(|entry| entry.id == model && entry.efforts.iter().any(|e| e == effort))
            {
                presets.insert(
                    preset.into(),
                    Choice {
                        model: model.into(),
                        effort: effort.into(),
                    },
                );
            }
        }
    }
    if provider == "codex" {
        for (preset, model, effort) in [
            ("performance", "gpt-6-astra", "high"),
            ("balanced", "gpt-5.6-sol", "medium"),
            ("economy", "gpt-5.6-luna", "low"),
        ] {
            if models
                .iter()
                .any(|entry| entry.id == model && entry.efforts.iter().any(|e| e == effort))
            {
                presets.insert(
                    preset.into(),
                    Choice {
                        model: model.into(),
                        effort: effort.into(),
                    },
                );
            }
        }
    }
    if provider == "claude" {
        for (preset, model, effort) in [
            ("performance", "opus", "high"),
            ("balanced", "sonnet", "medium"),
            ("economy", "haiku", ""),
        ] {
            if models.iter().any(|entry| {
                entry.id == model
                    && (entry.efforts.iter().any(|e| e == effort)
                        || entry.efforts.is_empty() && effort.is_empty())
            }) {
                presets.insert(
                    preset.into(),
                    Choice {
                        model: model.into(),
                        effort: effort.into(),
                    },
                );
            }
        }
    }
    Ok(Capabilities {
        provider: provider.into(),
        models,
        presets,
    })
}

pub fn validate(provider: &str, model: &str, effort: &str) -> Result<()> {
    let capabilities = discover(provider)?;
    let entry = capabilities
        .models
        .iter()
        .find(|entry| entry.id == model)
        .ok_or(crate::i18n::text(
            "선택한 모델을 사용할 수 없어요. 모델 목록에서 다시 선택해 주세요.",
        ))?;
    if !(entry.efforts.contains(&effort.to_string())
        || entry.efforts.is_empty() && effort.is_empty())
    {
        return Err(crate::i18n::text("이 모델은 선택한 Effort를 지원하지 않아요.").into());
    }
    Ok(())
}
