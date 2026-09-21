pub mod antigravity;
pub mod capabilities;
pub mod claude;
pub mod codex;
pub mod codex_profile;
pub mod gate;
pub mod setup;
pub mod transport;
use serde::Serialize;
use std::{
    path::PathBuf,
    process::{Command, Stdio},
    time::Duration,
};
use wait_timeout::ChildExt;
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detection {
    pub provider: String,
    pub executable: Option<String>,
    pub version: Option<String>,
    pub auth_status: String,
    pub compatibility: String,
    pub reason: String,
}
pub(crate) fn executable(name: &str) -> Option<PathBuf> {
    if name == "codex" {
        if let Some(path) = managed_codex().filter(|path| path.is_file()) {
            return Some(path);
        }
    }
    which::which(name).ok().or_else(|| {
        let home = dirs::home_dir()?;
        [
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
            home.join(".local/bin"),
            home.join(".npm-global/bin"),
            home.join("AppData/Roaming/npm"),
        ]
        .iter()
        .map(|p| {
            p.join(if cfg!(windows) {
                format!("{name}.cmd")
            } else {
                name.to_string()
            })
        })
        .find(|p| p.is_file())
    })
}
pub(crate) fn detect(name: &str) -> Detection {
    let mut result = Detection {
        provider: name.into(),
        executable: None,
        version: None,
        auth_status: "unknown".into(),
        compatibility: "missing".into(),
        reason: crate::i18n::text("공식 CLI 설치 후 다시 확인해 주세요.").into(),
    };
    let Some(path) = executable(if name == "antigravity" { "agy" } else { name }) else {
        return result;
    };
    result.executable = Some(path.to_string_lossy().to_string());
    result.compatibility = "unverified".into();
    result.reason=if name=="codex"{crate::i18n::text("이 버전·OS의 읽기/쓰기 경계, 외부 도구 차단과 종료 시험이 필요해요. 실제 실행은 잠겨 있어요.")}else{crate::i18n::text("설치 감지만 지원해요. 실제 실행은 베타에서 연결할 예정이에요.")}.into();
    let Ok(mut child) = Command::new(&path)
        .arg("--version")
        .env("AGY_CLI_DISABLE_AUTO_UPDATE", "true")
        .env("DISABLE_AUTOUPDATER", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return result;
    };
    match child.wait_timeout(Duration::from_secs(3)) {
        Ok(Some(status)) if status.success() => {
            use std::io::Read;
            let mut out = String::new();
            if let Some(stdout) = child.stdout.take() {
                let _ = stdout.take(4096).read_to_string(&mut out);
            }
            result.version = Some(out.trim().chars().take(120).collect());
        }
        _ => {
            let _ = child.kill();
            let _ = child.wait();
            result.reason = crate::i18n::text(
                "CLI 버전 확인이 끝나지 않았어요. 터미널에서 --version을 확인해 주세요.",
            )
            .into()
        }
    }
    if gate::require_provider(name, result.version.as_deref().unwrap_or("")).is_ok() {
        result.compatibility = "verified".into();
        if name == "claude" {
            result.auth_status = setup::auth_status(&path);
        }
        result.reason = if name == "codex" {
            crate::i18n::text("작업 사본 안에서 실행해요. 외부 파일·네트워크·MCP는 차단돼요.")
        } else if name == "antigravity" {
            crate::i18n::text("작업 사본에서 실행해요. 기존 MCP 설정은 유지하며 추가 승인이 필요한 도구는 거절돼요.")
        } else {
            crate::i18n::text("작업 사본의 파일 읽기·편집 지원. 셸 명령과 외부 도구는 차단돼요.")
        }
        .into();
    }
    result
}
pub fn detect_all() -> Vec<Detection> {
    ["codex", "claude", "antigravity"]
        .into_iter()
        .map(detect)
        .collect()
}

pub(crate) fn managed_codex() -> Option<PathBuf> {
    if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        return None;
    }
    Some(dirs::data_dir()?.join(
        "dev.coi.desktop/providers/codex/0.154.0/package/vendor/aarch64-apple-darwin/bin/codex",
    ))
}
