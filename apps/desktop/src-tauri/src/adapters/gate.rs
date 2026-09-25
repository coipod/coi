use crate::Result;
use serde::Serialize;
/// Every entry must be backed by docs/validation.md and the native acceptance suite.
/// Entries cover a specific OS, architecture, version and launch profile.
const VERIFIED: &[(&str, &str, &str)] = &[("macos", "aarch64", "codex-cli 0.154.0")];
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GateStatus {
    pub enabled: bool,
    pub reason: String,
    pub os: String,
    pub arch: String,
    pub supported_versions: Vec<String>,
}
pub fn status(version: &str) -> GateStatus {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let enabled = VERIFIED.contains(&(os, arch, version));
    GateStatus {
        enabled,
        reason: if enabled {
            "validated"
        } else {
            "native_capabilities_unverified"
        }
        .into(),
        os: os.into(),
        arch: arch.into(),
        supported_versions: VERIFIED
            .iter()
            .filter(|(o, a, _)| *o == os && *a == arch)
            .map(|(_, _, v)| v.to_string())
            .collect(),
    }
}
pub fn require(version: &str) -> Result<()> {
    if status(version).enabled {
        Ok(())
    } else {
        Err(crate::i18n::text("실제 CLI 실행을 보류했어요. 이 OS·버전의 sandbox와 외부 도구 차단·프로세스 종료 검증이 필요해요. 파일 탐색을 이용하거나 지원되는 CLI를 연결해 주세요.").into())
    }
}

/// Restricted native-file profile; shell, MCP and customizations are unavailable.
/// Other providers retain the original fail-closed gate until acceptance completes.
pub fn require_provider(provider: &str, version: &str) -> Result<()> {
    if provider == "claude"
        && version == "2.1.267 (Claude Code)"
        && cfg!(all(target_os = "macos", target_arch = "aarch64"))
    {
        for path in [
            "/Library/Application Support/ClaudeCode/managed-settings.json",
            "/etc/claude-code/managed-settings.json",
        ] {
            if std::path::Path::new(path).exists() {
                return Err(crate::i18n::text(
                    "관리자 CLI 정책이 있는 환경은 실행 경계 검증이 필요해요.",
                )
                .into());
            }
        }
        return Ok(());
    }
    if provider == "antigravity"
        && version == "1.2.7"
        && cfg!(all(target_os = "macos", target_arch = "aarch64"))
    {
        return super::antigravity::check_settings();
    }
    if provider == "codex" {
        require(version)
    } else {
        Err(crate::i18n::text("이 CLI의 실행 프로필은 아직 검증 중이에요.").into())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn unknown_versions_cannot_enable_live_execution() {
        assert!(super::require("0.46.0").is_err());
        assert!(super::require("999.0.0").is_err());
    }
}
