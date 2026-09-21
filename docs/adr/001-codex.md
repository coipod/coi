# ADR 001 — Codex stdio와 실패 시 실행 보류

2026-09-16 · 실행 방식 채택, live gate 닫힘.

공식 app-server JSONL stdio, initialize → initialized → thread/start → turn/start. `experimentalApi=false`. 숫자/문자 request ID, thread/turn/item, 한 번만 허용하는 승인 응답, interrupted/failed/completed를 구분한다. HTTP 또는 PTY 추정 실행으로 대체하지 않는다. 프레임은 1 MiB, stdout queue는 64 × 8 KiB로 제한한다. raw stdout/stderr는 저장하지 않는다. 텍스트는 줄 단위로 모아 분할 토큰도 정제한다.

실제 확인: 전역 `codex-cli 0.46.0`, 프로젝트 검증용 공식 npm 패키지 `0.154.0`. 전역 설치·사용자 설정은 바꾸지 않았다. 0.154.0 initialize handshake는 통과했지만 생성된 안정 `TurnStartParams`의 workspaceWrite에는 writableRoots/networkAccess/excludeTmpdirEnvVar/excludeSlashTmp만 있다. 문서에서 기대한 readOnlyAccess/access 제한 필드는 없다. 알 수 없는 필드를 보내도 차단이 보장되지 않으므로 턴을 시작하지 않았다. `docs/release/codex-probe.json`의 스키마 hash와 결과가 근거다.

Rust에는 bounded parser와 stdio transport가 있다. 미지원 restricted-read 필드와 빈 MCP map을 보내던 synthetic thread/turn builder는 제거했다. fixture 요청은 테스트 안에만 있으며 production 실행 정책으로 노출하지 않는다. VERIFIED 목록은 비어 있고 감지된 버전만으로 열리지 않는다. 실험 API를 켜거나 전체 파일 읽기 권한을 허용하는 식으로 해결하지 않는다.

재개 조건: 정확한 CLI/OS/arch에서 제한 읽기·쓰기 root, 프로젝트 설정·외부 도구 비활성, 네트워크 제한, native 승인과 취소, 프로세스 트리 종료, 인증 오류를 모두 검증. 그 후 native RunManager/IPC와 이벤트 normalize를 연결하고 실제 임시 README 수정 smoke를 수행한다. 인증은 CLI에 맡기고 추론 비용·전송 주체를 첫 실행 전에 UI로 알린다.

공식 근거: [app-server](https://learn.chatgpt.com/docs/app-server), [CLI](https://learn.chatgpt.com/docs/codex/cli). 문서는 설치된 실행 파일의 schema/실증을 대신하지 않는다.

추가 조사: 별도 `codex sandbox -P` named profile은 macOS arm64에서 사본 내 읽기/쓰기 성공, 원본 marker 읽기/쓰기 거절, 사본 symlink를 통한 외부 읽기 거절, loopback 네트워크 거절을 모두 통과했다. `docs/release/sandbox-probe.json` 참고. 이는 standalone sandbox 증거이며 app-server 실행 성공을 의미하지 않는다. [0.154.0 thread 프로토콜 소스](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/app-server-protocol/src/protocol/v2/thread.rs)는 `thread/start.permissions`를 experimental로 표시한다. [권한 문서](https://learn.chatgpt.com/docs/permissions)는 기존 sandbox_mode가 프로필보다 우선할 수 있다고 설명한다. 사용자 전역 설정을 지우거나 실험 API를 켜지 않았다.

또한 [0.154.0 config merge 소스](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/config/src/merge.rs)는 table을 재귀 병합한다. 따라서 빈 `mcp_servers={}`는 기존 서버를 제거하는 수단이 아니다. 이 값은 안전 보장으로 인정할 수 없다. 인증 파일을 복사하거나 사용자 설정을 변경하지 않고 모든 외부 서버를 비활성화할 수 있는 정식 연결 방법을 추가 검증해야 한다.


## 후속 소스 조사 — legacy 우선순위 정정

[고정 버전 core config](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/core/src/config/mod.rs)의 `resolve_permission_config_syntax`는 SessionFlags에 `default_permissions`가 있으면 legacy보다 profile을 선택한다. [ConfigManager](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/app-server/src/config_manager.rs)는 안정 `thread/start.config`를 CLI override layer에 합친다. 따라서 **legacy 사용자 설정 때문에 안정 경로가 무조건 불가능하다는 이전 추론은 정정한다**. 다만 stable config를 통한 app-server thread의 실제 권한은 아직 시험하지 않았다.

standalone `-P`는 legacy danger-full-access가 함께 있을 때도 6개 경계 검사를 통과했다. `-P` 없이 `codex sandbox -c default_permissions=...`만 주는 시험은 CLI usage 오류로 종료됐다. 이는 app-server 경로의 성공이나 실패 증거가 아니다. 현재 프로브는 적용 가능한 두 standalone 경우만 기록한다.

남은 차단 근거: CLI app-server 진입점은 `LoaderOverrides::default()`를 쓰며 ignore_user_config/ignore_project_config를 외부 CLI 플래그로 노출하지 않는다. 빈 MCP table은 전체 비활성화가 아니다. 서버 이름을 사전 열거하고 개별 비활성화하는 방식만으로는 다음 config reload에서 새 서버가 나타나는 경합을 배제할 수 없다. `mcpServerStatus/list`는 서버 상태 수집 경로를 사용하므로 이를 무실행 인증/설정 검사로 가정하지 않는다. 임의 MCP가 실행될 가능성을 제거하기 전에는 thread를 만들지 않는다.

추가 발견: [thread processor](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/app-server/src/request_processors/thread_processor.rs)는 writable thread를 처음 시작할 때 project trust를 사용자 설정에 저장할 수 있다. 안전한 연결은 이 부작용도 피해야 한다. 조사 동안 사용자 설정·인증 저장소는 변경하지 않았고 실제 thread/추론을 시작하지 않았다.


## 2026-09-19 update — validated stable profile

The previously untested stable `thread/start.config` named permission profile was exercised with Codex 0.154.0 on macOS arm64. Task-copy read/write succeeded, outside canary read/write was denied, and the global config hash was unchanged. Explicit per-server MCP disabling, customization feature disabling and an in-memory untrusted project entry are applied by `adapters/codex_profile.rs`. Production two-turn resume/edit/apply/undo/cancel acceptance passed. The gate is open only for this version/platform/profile. Concurrent user modification of provider settings during a run is not certified; COI never copies credentials or edits global configuration.
