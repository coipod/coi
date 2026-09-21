//! Fixed official installation recipes. Renderer input never becomes shell code.
use super::{detect, executable, Detection};
use crate::Result;
use base64::Engine as _;
use serde::Serialize;
use sha2::{Digest, Sha256, Sha512};
use std::{fs, path::Path, sync::Mutex, time::Duration};
static SETUP: Mutex<()> = Mutex::new(());
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupProgress {
    pub provider: String,
    pub stage: String,
    pub message: String,
}
fn command(program: &Path, args: &[&str], seconds: u64) -> Result<Vec<u8>> {
    let mut transport =
        super::transport::StdioTransport::spawn(program, args, &std::env::temp_dir())?;
    let deadline = std::time::Instant::now() + Duration::from_secs(seconds);
    let mut bytes = Vec::new();
    loop {
        if std::time::Instant::now() >= deadline {
            return Err(crate::i18n::text("설정 시간이 초과됐어요. 다시 연결해 주세요.").into());
        }
        match transport.receive(Duration::from_millis(200)) {
            Ok(chunk) => {
                bytes.extend(chunk);
                if bytes.len() > 2 * 1024 * 1024 {
                    return Err("setup output limit".into());
                }
            }
            Err(error) if error == "provider_timeout" => continue,
            Err(error) if error == "provider_exited" => break,
            Err(error) => return Err(error),
        }
    }
    transport.terminate()?;
    if transport.exit_success != Some(true) {
        return Err(crate::i18n::text("공식 CLI 설정을 완료하지 못했어요. 네트워크와 로그인 상태를 확인하고 다시 시도해 주세요.").into());
    }
    Ok(bytes)
}
fn install_codex(cache: &Path, stage: &impl Fn(&str, &str)) -> Result<()> {
    let executable = super::managed_codex().ok_or(crate::i18n::text(
        "이 OS와 CPU의 Codex 자동 설치는 아직 검증되지 않았어요.",
    ))?;
    if executable.is_file() {
        return Ok(());
    }
    let destination = dirs::data_dir()
        .ok_or("missing app data")?
        .join("dev.coi.desktop/providers/codex/0.154.0");
    if destination.exists() {
        return Err(crate::i18n::text(
            "이전 Codex 설치가 완전하지 않아요. 설치 폴더 확인이 필요해요.",
        )
        .into());
    }
    fs::create_dir_all(cache).map_err(|_| "setup cache unavailable")?;
    let temporary = cache.join(uuid::Uuid::new_v4().to_string());
    fs::create_dir(&temporary).map_err(|_| "setup cache unavailable")?;
    let result = (|| -> Result<()> {
        let archive = temporary.join("codex.tgz");
        stage(
            "download",
            crate::i18n::text(
                "COI용 공식 Codex 네이티브 패키지를 내려받고 있어요. 기존 CLI는 유지해요.",
            ),
        );
        command(
            Path::new("/usr/bin/curl"),
            &[
                "-fsSL",
                "--proto",
                "=https",
                "--proto-redir",
                "=https",
                "--max-time",
                "180",
                "--max-filesize",
                "536870912",
                "-o",
                archive.to_str().ok_or("invalid archive path")?,
                "https://registry.npmjs.org/@openai/codex/-/codex-0.154.0-darwin-arm64.tgz",
            ],
            185,
        )?;
        stage(
            "integrity",
            crate::i18n::text("공식 패키지의 SHA-512를 확인하고 있어요."),
        );
        let bytes = fs::read(&archive).map_err(|_| "archive unavailable")?;
        if base64::engine::general_purpose::STANDARD.encode(Sha512::digest(bytes)) != "HP/vJCH/t2hB9Kg6hotN9UglClJ6/z584fal5lEP14C9gNAgAQS4/kTQC7l5V+BA3TqwDPwINSjul28cX8AYXg==" { return Err(crate::i18n::text("Codex 패키지 무결성 확인에 실패했어요.").into()); }
        stage(
            "install",
            crate::i18n::text("Node.js 없이 COI 전용 폴더에 설치하고 있어요."),
        );
        let extracted = temporary.join("extracted");
        fs::create_dir(&extracted).map_err(|_| "setup extraction unavailable")?;
        command(
            Path::new("/usr/bin/tar"),
            &[
                "-xzf",
                archive.to_str().ok_or("archive path")?,
                "-C",
                extracted.to_str().ok_or("extraction path")?,
            ],
            30,
        )?;
        fs::create_dir_all(destination.parent().ok_or("provider directory")?)
            .map_err(|_| "provider directory unavailable")?;
        fs::rename(extracted, &destination)
            .map_err(|_| crate::i18n::text("Codex 설치를 완료하지 못했어요."))?;
        Ok(())
    })();
    let _ = fs::remove_dir_all(temporary);
    result
}
pub fn setup(provider: &str, cache: &Path, publish: impl Fn(SetupProgress)) -> Result<Detection> {
    let _guard = SETUP.try_lock().map_err(|_| {
        crate::i18n::text("다른 CLI를 설정하고 있어요. 완료 후 다시 시도해 주세요.")
    })?;
    let name = match provider {
        "claude" => "claude",
        "codex" => "codex",
        "antigravity" => "agy",
        _ => return Err("unknown provider".into()),
    };
    let stage = |stage: &str, message: &str| {
        publish(SetupProgress {
            provider: provider.into(),
            stage: stage.into(),
            message: message.into(),
        })
    };
    stage(
        "environment",
        crate::i18n::text("설치 환경을 확인하고 있어요."),
    );
    if !cfg!(target_os = "macos") {
        return Err(crate::i18n::text(
            "이 OS의 자동 설치는 아직 검증되지 않았어요. 공식 설치 안내를 이용해 주세요.",
        )
        .into());
    }
    if provider == "codex" && detect(provider).version.as_deref() != Some("codex-cli 0.154.0") {
        install_codex(cache, &stage)?;
    }
    if executable(name).is_none() {
        let (url, digest) = match provider {
            "claude" => (
                "https://claude.ai/install.sh",
                "3a68d3406cf674e17bed1733a4dcf37805e2e47d87417700007d7e1aa766a944",
            ),
            "antigravity" => (
                "https://antigravity.google/cli/install.sh",
                "ee1ea43ce4e9e56356c4ab6dad907ef357ae4bdfcaadb682735909fb57c9c640",
            ),
            _ => {
                return Err(crate::i18n::text(
                    "Codex 네이티브 설치 경로 검증이 필요해요. 공식 설치 안내를 이용해 주세요.",
                )
                .into())
            }
        };
        fs::create_dir_all(cache)
            .map_err(|_| crate::i18n::text("설치 임시 폴더를 만들 수 없어요."))?;
        let directory = cache.join(uuid::Uuid::new_v4().to_string());
        fs::create_dir(&directory)
            .map_err(|_| crate::i18n::text("설치 임시 폴더를 만들 수 없어요."))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
                .map_err(|_| "setup permissions")?;
        }
        let script = directory.join("install.sh");
        let installation: Result<()> = (|| {
            stage(
                "download",
                crate::i18n::text("공식 설치 프로그램을 내려받고 있어요."),
            );
            command(
                Path::new("/usr/bin/curl"),
                &[
                    "--fail",
                    "--silent",
                    "--show-error",
                    "--location",
                    "--proto",
                    "=https",
                    "--proto-redir",
                    "=https",
                    "--max-time",
                    "30",
                    "--max-filesize",
                    "1048576",
                    "--output",
                    script.to_str().ok_or("invalid setup path")?,
                    url,
                ],
                35,
            )?;
            stage(
                "integrity",
                crate::i18n::text("설치 프로그램의 무결성을 확인하고 있어요."),
            );
            let bytes =
                fs::read(&script).map_err(|_| crate::i18n::text("설치 파일을 읽을 수 없어요."))?;
            if hex::encode(Sha256::digest(&bytes)) != digest {
                return Err(crate::i18n::text(
                    "공식 설치 프로그램이 변경됐어요. COI의 설치 레시피 업데이트가 필요해요.",
                )
                .into());
            }
            stage(
                "install",
                crate::i18n::text("공식 CLI를 설치하고 있어요. 배포 파일의 체크섬도 확인해요."),
            );
            let mut args = vec![script.to_str().ok_or("invalid setup path")?];
            if provider == "claude" {
                args.push("stable");
            }
            command(Path::new("/bin/bash"), &args, 300)?;
            Ok(())
        })();
        let _ = fs::remove_dir_all(&directory);
        installation?;
    }
    stage("verify", crate::i18n::text("설치된 CLI를 확인하고 있어요."));
    let path = executable(name).ok_or(crate::i18n::text("설치 후 CLI를 찾지 못했어요."))?;
    let mut detection = detect(provider);
    if provider == "claude" {
        let authenticated = || -> bool {
            command(&path, &["auth", "status"], 15)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
                .is_some_and(|value| value["loggedIn"] == true)
        };
        if !authenticated() {
            stage(
                "authentication",
                crate::i18n::text("열린 공식 브라우저에서 로그인을 완료해 주세요."),
            );
            command(&path, &["auth", "login"], 300)?;
        }
        if !authenticated() {
            return Err(
                crate::i18n::text("로그인을 확인하지 못했어요. 다시 연결해 주세요.").into(),
            );
        }
        detection.auth_status = "available".into();
        stage(
            "connection",
            crate::i18n::text("도구를 사용하지 않는 짧은 요청으로 연결을 확인하고 있어요."),
        );
        let bytes = command(
            &path,
            &[
                "-p",
                "Reply with exactly COI_CONNECTION_OK. Do not use tools.",
                "--output-format",
                "json",
                "--safe-mode",
                "--restricted",
                "--disable-slash-commands",
                "--strict-mcp-config",
                "--mcp-config",
                "{\"mcpServers\":{}}",
                "--tools",
                "",
                "--model",
                "sonnet",
                "--effort",
                "low",
            ],
            90,
        )?;
        let response: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| "invalid connection response")?;
        if response["is_error"] == true
            || response["result"].as_str().map(str::trim) != Some("COI_CONNECTION_OK")
        {
            return Err(crate::i18n::text(
                "실제 응답을 확인하지 못했어요. 구독과 사용량을 확인해 주세요.",
            )
            .into());
        }
        detection.reason = crate::i18n::text(
            "로그인과 실제 응답 확인 완료. 작업 사본의 파일을 읽고 편집할 수 있어요.",
        )
        .into();
        stage("connected", &detection.reason);
    } else if provider == "codex" {
        stage(
            "authentication",
            crate::i18n::text("공식 Codex 로그인 상태를 확인하고 있어요."),
        );
        if command(&path, &["login", "status"], 15).is_err() {
            stage(
                "authentication",
                crate::i18n::text("열린 공식 브라우저에서 Codex 로그인을 완료해 주세요."),
            );
            command(&path, &["login"], 300)?;
        }
        command(&path, &["login", "status"], 15)?;
        super::capabilities::discover(provider)?;
        detection.auth_status = "available".into();
        stage(
            "connected",
            crate::i18n::text("Codex 로그인과 모델 목록을 확인했어요."),
        );
    } else if provider == "antigravity" {
        super::gate::require_provider(provider, detection.version.as_deref().unwrap_or(""))?;
        stage(
            "connection",
            crate::i18n::text("기존 Antigravity 설정을 유지하며 실제 응답을 확인하고 있어요."),
        );
        let bytes = command(
            &path,
            &[
                "--output-format",
                "json",
                "--sandbox",
                "--mode",
                "plan",
                "--model",
                "gemini-3.8-flash-low",
                "--effort",
                "low",
                "--print-timeout",
                "90s",
                "-p",
                "Reply with exactly COI_CONNECTION_OK. Do not use any tools or access any files.",
            ],
            100,
        )?;
        let response: serde_json::Value = serde_json::from_slice(&bytes)
            .map_err(|_| crate::i18n::text("Antigravity 연결 응답을 읽을 수 없어요."))?;
        if response["status"].as_str() != Some("SUCCESS")
            || response["response"].as_str().map(str::trim) != Some("COI_CONNECTION_OK")
        {
            return Err(crate::i18n::text("Antigravity 실제 응답을 확인하지 못했어요. 공식 CLI 로그인과 사용량을 확인해 주세요.").into());
        }
        super::capabilities::discover(provider)?;
        detection.auth_status = "available".into();
        stage(
            "connected",
            crate::i18n::text(
                "Antigravity 로그인·모델·실제 응답을 확인했어요. 기존 MCP 설정은 유지돼요.",
            ),
        );
    }
    Ok(detection)
}

pub(crate) fn auth_status(path: &Path) -> String {
    match command(path, &["auth", "status"], 10)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
    {
        Some(value) if value["loggedIn"] == true => "available".into(),
        _ => "required".into(),
    }
}

#[cfg(test)]
mod live_setup {
    #[test]
    #[ignore = "Uses the authenticated Antigravity CLI and existing MCP configuration"]
    fn antigravity_connection_setup() {
        let cache = tempfile::tempdir().unwrap();
        let result = super::setup("antigravity", cache.path(), |progress| {
            println!("{}", progress.stage)
        })
        .unwrap();
        assert_eq!(result.auth_status, "available");
    }
    #[test]
    #[ignore = "Downloads the pinned official CLI into COI app data"]
    fn codex_native_setup() {
        let cache = tempfile::tempdir().unwrap();
        let result = super::setup("codex", cache.path(), |progress| {
            println!("{}", progress.stage)
        })
        .unwrap();
        assert_eq!(result.version.as_deref(), Some("codex-cli 0.154.0"));
    }
}
