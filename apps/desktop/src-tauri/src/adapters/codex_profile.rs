//! Stable named permission profile, validated with Codex 0.154.0 on macOS arm64.
use crate::Result;
use serde_json::{json, Value};
use std::path::Path;
pub fn build(cwd: &Path, read_only: bool) -> Result<(Vec<String>, Value)> {
    let cwd = cwd.canonicalize().map_err(|_| "task copy unavailable")?;
    let mut mcp = serde_json::Map::new();
    let path = std::env::var_os("CODEX_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".codex")))
        .ok_or("Codex configuration directory unavailable")?
        .join("config.toml");
    if path.exists() {
        let bytes = std::fs::read_to_string(path).map_err(|_| "Codex configuration unreadable")?;
        if bytes.len() > 1024 * 1024 {
            return Err("Codex configuration too large".into());
        }
        let config: toml::Value =
            toml::from_str(&bytes).map_err(|_| "Codex configuration invalid")?;
        if let Some(servers) = config.get("mcp_servers").and_then(toml::Value::as_table) {
            for name in servers.keys() {
                mcp.insert(name.clone(), json!({"enabled":false}));
            }
        }
    }
    let mut features = serde_json::Map::new();
    for key in [
        "apps",
        "connectors",
        "plugins",
        "remote_plugin",
        "hooks",
        "codex_hooks",
        "plugin_hooks",
        "multi_agent",
        "multi_agent_v2",
        "collab",
        "browser_use",
        "computer_use",
        "image_generation",
        "web_search",
        "memories",
        "memory_tool",
        "skill_search",
        "skill_mcp_dependency_install",
        "remote_control",
    ] {
        features.insert(key.into(), false.into());
    }
    let profile = json!({"filesystem":{":root":"deny",":minimal":"read",cwd.to_string_lossy().as_ref(): if read_only {"read"} else {"write"}},"network":{"enabled":false}});
    let config = json!({"features":features,"skills":{"include_instructions":false},"projects":{cwd.to_string_lossy().as_ref():{"trust_level":"untrusted"}},"mcp_servers":mcp,"web_search":"disabled","default_permissions":"coi-task-copy","permissions":{"coi-task-copy":profile}});
    let mut args = vec!["app-server".into()];
    for (key, value) in config.as_object().ok_or("invalid profile")? {
        args.extend(["-c".into(), format!("{key}={}", inline_toml(value)?)]);
    }
    Ok((args, config))
}
fn inline_toml(value: &Value) -> Result<String> {
    Ok(match value {
        Value::Object(map) => format!(
            "{{{}}}",
            map.iter()
                .map(|(key, value)| Ok(format!(
                    "{}={}",
                    serde_json::to_string(key).map_err(|_| "config key")?,
                    inline_toml(value)?
                )))
                .collect::<Result<Vec<_>>>()?
                .join(",")
        ),
        Value::Array(items) => format!(
            "[{}]",
            items
                .iter()
                .map(inline_toml)
                .collect::<Result<Vec<_>>>()?
                .join(",")
        ),
        Value::Null => return Err("null configuration unsupported".into()),
        _ => serde_json::to_string(value).map_err(|_| "config encoding")?,
    })
}
