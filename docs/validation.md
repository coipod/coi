> Historical development record. Current support: [STATUS](STATUS.md). Current release conditions: [READINESS](release/READINESS.md).

# COI 0.1 개발 프리뷰 검증표

2026-09-16 · 로컬 macOS 26.2 arm64. Node 22.22.2, Rust/Cargo 1.93.1, 공식 CLI 전역0.46.0/검사용0.154.0. 모든 결과는 이 환경에 한정한다. 전체 MVP 완료나 public release를 선언하지 않는다.

## 자동 검사

| 검사 | 결과 | 증거/범위 |
|---|---|---|
| TypeScript typecheck / ESLint | PASS | `npm run check` |
| TS unit/contract | 12 PASS | 공통 이벤트, Demo, unsafe Markdown 정제 |
| Rust unit/integration | 41 PASS | path guard, 실제 fake child, protocol, SQLite, 충돌·복구·삭제 방어, 30일 정리, Git 읽기/외부 필터 미실행, native worker·승인/취소·journal·OS 잠금 |
| rustfmt / Clippy -D warnings | PASS | macOS all-targets |
| Vite production build | PASS | assets JS 약489 kB, CSS 약36 kB, 별도 이미지 atlas |
| Web E2E | 13 PASS | 최초 임무 전체, 취소/재시도, plan, checkpoint, 키보드, 3크기, 미지 저장 버전 보존, 삭제 확인, modal 오류, Artifact 상태 유지, 차단된 프로젝트 요청 보존 |
| npm audit | 0 vulnerabilities | 로컬 검사 당시 결과 |
| cargo audit | vulnerability 0, warning 7 | unmaintained 6개 + glib unsound 1개. 아래 검토 기록 참조 |
| repository secret pattern scan | PASS | 정규식 검사, 완전 탐지 보장은 아님 |
| macOS 개발 .app build | PASS | Tauri debug bundle, 서명/공증 배포 검증 아님 |

최종 Web E2E는 `npx playwright test --workers=2`로13개 통과했다. 첫 실행의 신규 테스트 접근성 label 오타를 고쳤고, 이후 Rust 빌드와 겹친5-worker 실행에서 시간 초과가 발생하여 빌드 종료 후 재검사했다. Cargo 출력 트리가 Vite 파일 감시를 과도하게 발생시키지 않도록 `src-tauri`를 감시에서 제외했다.

공유 contract fixture: `tests/fixtures/events.json`. 실제 AI 공급자 이벤트로 주장하지 않는다. fake CLI는 실제 stdio child process이며 모델·계정·외부 네트워크를 사용하지 않는다.

## 네이티브 수동 smoke

테스트용으로 새로 만든 임시 프로젝트만 사용했다. 사용자 기존 코드와 credential은 대상이 아니다.

| 순서 | 관찰 |
|---|---|
| COI.app 실행 | Tauri 창과 로컬 UI 정상, 계정 UI 없음 |
| native folder picker | 임시 project를 등록하고 README 파일 목록 확인 |
| 사본 생성 | 1개 파일 복사 보고, 원본은 그대로 |
| 사본 외부 편집 → 변경 확인 | 추가한 한 줄 diff 표시, 미검증 상태 유지 |
| checkbox 확인 → 원본에 적용 | UI 성공, 디스크의 샘플 원본에 정확한 문장 추가 확인 |
| 적용한 변경 되돌리기 | UI 복구 성공, `cmp`로 원본과 보관 baseline 바이트 일치 확인 |
| 이미지 미리보기 | PNG를 native IPC로 디코딩·재인코딩하여 실제 창에 표시 |
| 진단 저장 | native Save dialog로 임시 폴더에 JSON 저장, 메타데이터만 포함 확인 |
| 앱 재시작 | PASS 최종 개발 빌드에서 프로젝트·2개 세션·사본 참조 복원. 추가로 Demo 대화·11개 이벤트·완료 상태·diff가 재시작 후 복원되는 것 확인 |
| 30일 정리 예약 | 미적용 사본의 예약 거절과 창 내부 안내 확인. 새 3파일 사본은 2026-10-16 만료 표시. ‘계속 보관’ 후 예약 해제 확인. 원본 README는 기존 baseline과 바이트 일치 |
| native 시작 gate·DB schema2 | 최신 .app에서 요청 보존과 Rust 차단 안내 확인. 기존 2프로젝트·4세션 유지, 차단 후 native_runs/events 0개 |
| Git 상태/diff | 별도 로컬 fixture에서 staged와 working 변경이 각각 정확히 표시됨. Companion 왕복 후 선택·diff 유지. native 조회 전후 원본 README와 .git/index SHA256 불변 |

macOS native는 CUA로 실제 .app과 OS folder picker를 조작했다. 웹 모의 IPC를 네이티브 증거로 사용하지 않았다. Tauri native WebDriver의 macOS 공식 지원 제약으로 이 환경에서는 native 자동 E2E 대신 실제 UI smoke와 Rust 통합 검사를 사용했다. Windows tauri-driver 실기/자동 시험은 없다.

## CLI capability matrix

| 대상 | 연결 | 사본 내/외 파일 경계 | 네트워크 | 외부 도구 차단 | 취소/트리 종료 | 실제 실행 |
|---|---|---|---|---|---|---|
| Codex 0.46.0 / macOS arm64 | 감지/버전 확인 | 미검증 | 미검증 | 미검증 | 미검증 | BLOCKED |
| Codex 0.154.0 / macOS arm64 / app-server stable | initialize PASS, inference 없음 | 안정 SandboxPolicy에 restricted-read 필드 없음 | schema 필드 존재, 턴 미검증 | 빈 map으로 MCP 제거 불가 확인 | 실제 Codex 미검증 | BLOCKED |
| Codex 0.154.0 / macOS arm64 / standalone sandbox -P | 로컬 명령만 | 내부 read/write PASS, 외부 read/write/symlink DENY | loopback DENY | 해당 시험 범위 아님 | 해당 시험 범위 아님 | 앱 연결 미검증 |
| fake JSONL child / macOS arm64 | fragmented/coalesced handshake, worker approval/terminal/journal PASS | 기능 없음 | 사용 안 함 | 사용 안 함 | parent/descendant, stdin 무응답, 취소5초 한도, 정상 shutdown PASS | fixture only |
| macOS Intel | 미실행 | 미검증 | 미검증 | 미검증 | 미검증 | BLOCKED |
| Windows 11 x64 | 미실행 | 미검증 | 미검증 | 미검증 | 미검증 | BLOCKED |
| Claude / Gemini | 안내/탐지만 구현 | 미검증 | 미검증 | 미검증 | 미검증 | 베타 미구현 |

`docs/release/codex-probe.json`은 생성된 안정 스키마 hash와 실제 initialize 결과다. `sandbox-probe.json`은 macOS standalone profile 시험이다. named profile을 thread에 직접 지정하는 API는0.154.0 소스에서 experimental이다. SessionFlags default_permissions의 legacy 우선 경로를 소스에서 확인했다. MCP table merge, hooks, 사용자 trust config 변경, 프로세스 트리 전체를 검증하기 전에는 gate를 열 수 없다. 이를 단순히 '최신 CLI 설치하면 동작'으로 안내하지 않는다.

공식 문서와 실제 소스: [app-server](https://learn.chatgpt.com/docs/app-server), [permissions](https://learn.chatgpt.com/docs/permissions), [pinned thread params](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/app-server-protocol/src/protocol/v2/thread.rs), [pinned config merge](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/config/src/merge.rs), [Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/).

## 계획서 성공 기준

| 기준 | 현재 판정 |
|---|---|
| S0 온보딩으로 첫 작업/diff | Demo PASS; CLI 경로 BLOCKED, 신규 사용자 시간 측정 미완료 |
| S1 실제 Codex 세션/스트림 | 미완료 — native boundary gate |
| S2 CLI 이벤트 정규화 | 공통 계약·Demo·native fixture 정규화 구현, 실제 오류·검증 증거 미완료 |
| S3 캐릭터/산출물 전환 | PASS, 캐릭터가 없어도 승인/검토 가능 |
| S4 사본·diff·승인 적용·충돌 | PASS macOS core/UI smoke, Windows 미검증 |
| S5 재시작 복원 | SQLite·web·native 재시작 PASS |
| S6 CLI/인증/파서/종료 복구 | 탐지와 fake 오류 계약 구현, 실제 인증/CLI 오류 E2E 미완료 |
| S7 3개 플랫폼 패키징/E2E | macOS arm64 개발 .app만 PASS |
| S8 세 CLI/인계 | 베타 미구현 |
| S9 자체 계정 없음/Demo | PASS 코드·UI, 자동 네트워크 수집 기능 없음 |

## 공개 배포 gate

닫힘: 실제 Codex 작업, MCP/hooks/plugins 비활성, 앱 종료 시 전체 provider tree 정리, Intel/Windows11 clean install, signed DMG/NSIS와 notarization, 자산 권리·정식 무음영7표정/투명PNG, Rust 유지보수 경고/의존성 notice 완전성, 접근성 실기·사용성 측정.

native 실행 코어/IPC와 SQLite schema2 journal을 추가했다. production start는 gate에서 거절하며 certified LaunchPlan·사본/거래 lock 통합·UI replay·ProviderThread resume는 남아 있다. [ADR010](adr/010-native-runs.md)에 정확한 범위를 기록했다. 30일 예약 정리와 migration transaction/future version 보호도 확인했다. 미적용 변경·후속 편집·미완료 거래는 정리에서 보호한다. 내부 진단 기록은 저장하지 않는다. 남은 구현은 [항목별 점검](requirements-audit.md)을 기준으로 추적한다. public CI 결과, 서명, 계정이나 다른 OS 실기를 성공으로 추정하지 않는다.

## Rust 감사 검토

`cargo-audit 0.22.2`로 현재 lock을 검사했다. vulnerability 분류는0개지만 경고가7개 있으므로 '보안 문제 없음'으로 해석하지 않는다. 전체 결과는 `release/rust-audit.json`에 보존한다.

- proc-macro-error 및 unic 계열5개: unmaintained. unic는 urlpattern → tauri-utils의 build/runtime 전이 의존성이다. 강제 major override로 바꾸지 않고 upstream 교체를 추적한다.
- glib0.18.5: VariantStrIter unsound 경고. `cargo tree --target aarch64-apple-darwin -i glib` 및 `--target x86_64-pc-windows-msvc -i glib`는 모두 포함 없음. 현재 지원 대상의 실행 의존성은 아니며 lock의 Linux GTK 경로에 남는다. Linux 지원을 추가할 경우 이 경고를 해결해야 한다.

공개 릴리스 전에 최신 advisory와 실제 각 타깃의 빌드 그래프를 다시 검토한다. 경고를 ignore 설정으로 숨기지 않았다.
