# COI · 함께 만드는 작업실

**Coding Organizing Intelligence** — 로컬 코딩 작업을 함께하는 캐릭터형 데스크톱 앱. Tauri 2 · React · TypeScript · Rust · SQLite.

> **0.1.0 macOS Apple Silicon 개발 빌드입니다.**
> Codex 0.154.0, Claude Code 2.1.267, Antigravity CLI 1.2.7의 실제 사본 실행·대화 재개·변경 적용·되돌리기·중지를 검증했습니다. 설치와 계정 연결은 앱의 **설치하고 연결**에서 진행합니다. Antigravity는 기존 MCP 설정을 유지하며 추가 승인 도구는 자동 거절합니다. 전체 출시 조건은 [현재 상태](docs/STATUS.md)를 확인하세요.

![COI 작업실](docs/screenshots/workspace.png)

COI 로그인·회원가입·계정 서버·결제·원격 telemetry는 없습니다. 공급자 인증은 사용자가 공식 CLI에서 진행합니다. COI는 credential 파일을 읽거나 가져오지 않습니다. 탐지는 버전과 지원되는 인증 상태를 확인합니다. 사용자가 **설치하고 연결**을 누르면 Claude·Antigravity에 짧은 실제 연결 확인 요청을 보내므로 공급자 사용량이 발생할 수 있습니다.

## 실행

개발 환경: Node.js 22+, npm, Rust 1.88+ stable, OS용 Tauri 빌드 도구. macOS에는 Xcode Command Line Tools, Windows에는 MSVC Build Tools와 WebView2가 필요합니다. [Tauri 공식 준비 안내](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci --legacy-peer-deps
npm run dev        # http://127.0.0.1:1420 — 브라우저 Demo
npm run desktop    # 별도 터미널 대신 이 명령만으로 Tauri 개발 앱 실행
```

이미 `npm run dev`가 실행 중이면 종료한 뒤 `npm run desktop`을 사용하세요. 두 명령이 같은 1420 포트를 사용합니다.

```sh
npm run tauri -w @coi/desktop -- build --debug --bundles app   # macOS 개발 .app
npm run tauri -w @coi/desktop -- build --debug --bundles nsis  # Windows에서 개발 설치 파일
```

macOS 결과: `apps/desktop/src-tauri/target/debug/bundle/macos/COI.app`. 서명·공증되지 않은 로컬 개발 빌드이며 공개 배포물은 아닙니다. 처음에는 Finder에서 COI.app을 열어 주세요. 자동화 도구가 실행한 인스턴스에서 기존 MCP가 시작되지 않으면 앱을 종료한 뒤 Finder에서 다시 열어 확인하세요. CLI는 번들에 포함되지 않습니다. `.local/codex`는 검증용으로 별도 설치한 개발 의존성으로 git과 번들에서 제외됩니다.

## 사용할 수 있는 흐름

1. 첫 만남 → 도구 확인 → 작업 방식 약속 → README 첫 임무. 건너뛰기와 이어하기를 지원합니다.
2. Demo에서 모의 요청을 승인하고, 표정·작업 상태·검증 결과를 확인합니다. Demo는 메모리 예제만 사용하며 CLI·프로젝트 파일·네트워크를 호출하지 않습니다.
3. 네이티브 앱에서 **프로젝트 폴더 열기 → 산출물 → 사본 검토 → 작업 사본 만들기**를 선택합니다.
4. **사본 폴더 열기**에서 사본만 편집한 뒤 **변경 확인**을 누릅니다. 모든 diff를 검토하고 체크박스로 확인한 뒤 **원본에 적용**합니다.
5. **적용한 변경 되돌리기**, 또는 설정의 **로컬 저장과 복구**에서 적용을 복구합니다. 사용자의 후속 편집이 있으면 전체 자동 복구를 중단합니다.

프로젝트 원본은 CLI 실행 root가 아닙니다. 채팅에서 CLI와 모델을 선택해 사본 편집을 요청할 수 있습니다. 일반 설정은 고성능·비용효율·절약, 고급 설정은 실제 모델과 Effort를 제공합니다. Demo의 검증 통과는 실제 코드 테스트 통과를 의미하지 않습니다.

네이티브 산출물의 **Git** 탭에서 원본의 스테이징/작업 파일 diff를 읽기 전용으로 볼 수 있습니다. 일반 저장소 루트를 지원하며 Git worktree 연결과 Git 쓰기 작업은 지원하지 않습니다.

세션 검색·이름 변경(목록 두 번 클릭)·삭제, 재시작 복원, 패널 크기 조절·접기, Focus 모드, 키보드 명령, reduced motion, 고대비, 대사 속도를 지원합니다. `⌘/Ctrl K` 명령 창, `⌘/Ctrl N` 새 이야기, `⌘/Ctrl Shift F` Focus. 입력 중 `Enter` 전송, `Shift Enter` 줄바꿈이며 IME 조합 중에는 전송하지 않습니다.

## 안전한 변경 적용

- 복사 시점의 실제 working tree를 기준으로 삼습니다. 커밋되지 않은 사용자 변경도 보존합니다.
- `.git`, `.env*`, 공급자 설정, credential 패턴, 의존성·빌드 폴더를 제외합니다. symlink/junction은 따라가지 않습니다. 최대 10,000개 파일·200 MiB·파일당 20 MiB입니다.
- 사본 변경을 불변 ChangeSet으로 고정합니다. 적용 전 모든 원본 hash를 확인하여 충돌 시 아무 파일도 적용하지 않습니다.
- write-ahead journal과 파일별 atomic replace를 사용합니다. 파일 여러 개를 한 번에 atomic하게 바꾼다고 가정하지 않습니다. 부분 실패는 복구 우선 상태로 남습니다.
- 되돌리기는 현재 내용이 COI가 적용한 postimage일 때만 수행합니다. `git reset`/`checkout`을 사용하지 않습니다.
- 알파의 자동 적용 대상은 UTF-8 텍스트 생성·수정입니다. 삭제·바이너리·rename은 거절합니다.
- HTML·SVG·스크립트 실행 프리뷰는 없습니다. Markdown의 raw HTML과 자동 원격 이미지도 제거합니다. 코드·diff는 읽기 전용입니다. PNG·JPEG·WebP는 크기·메모리 한도 내에서 디코딩한 뒤 메타데이터 없는 PNG로 변환해 표시합니다.

파일 내용에 있는 임의의 비밀을 완전히 탐지하는 보안 제품은 아닙니다. [보안 정책](SECURITY.md)과 [작업 사본 ADR](docs/adr/005-workspace.md)을 확인하세요.

## 데이터

네이티브 앱: OS 사용자별 `dev.coi.desktop` 앱 데이터 폴더에 SQLite, 사본, ChangeSet, 복구 journal을 저장합니다. macOS는 `~/Library/Application Support/dev.coi.desktop/`, Windows는 Tauri가 반환하는 사용자 앱 데이터 경로입니다. 브라우저 Demo는 `localStorage`를 사용합니다. 암호화 금고가 아닙니다.

이야기 삭제는 원본·사본·복구 기록을 유지합니다. 사본 즉시 삭제는 사용자의 명시적 확인 후 미적용 변경까지 삭제합니다. 적용된 백업이나 미완료 거래는 먼저 복구해야 삭제할 수 있습니다. 끝난 사본은 설정에서 **30일 뒤 정리**를 예약할 수 있습니다. 사본과 복구 백업의 만료일을 표시하며, 미적용 변경·예약 후 편집·미완료 복구 거래는 자동 정리에서 보호합니다. **계속 보관**, 사본 열기·검토·복구로 예약을 해제할 수 있습니다. 진단은 요청 시 메타데이터만 만들며 미가공 CLI 로그는 저장하지 않습니다. 이 앱의 삭제는 공식 CLI 인증 해제와 관계없습니다.

## 검사

```sh
npm run check
npm run test:e2e
npm run test:native
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
node scripts/secret-scan.mjs
npm audit --audit-level=moderate
```

웹 E2E 최초 실행 전 `npx playwright install chromium`이 필요합니다. 공식 Codex 실행 파일이 있을 때 다음 프로브는 버전·생성 스키마·초기 handshake만 검사합니다. thread와 추론을 시작하지 않으며 실행 gate를 열지 않습니다.

```sh
node scripts/codex-probe.mjs /absolute/path/to/codex
node scripts/codex-sandbox-probe.mjs /absolute/path/to/codex  # macOS 임시 파일 경계 시험
```

CI는 macOS arm64/x64 및 Windows x64 빌드 조합을 정의합니다. 이 저장소에서 원격 CI를 실행하거나 결과를 확인한 상태는 아닙니다. Windows Server CI는 Windows 11 설치·sandbox 실기 시험을 대신하지 않습니다.

## 구조와 진행 상태

```text
apps/desktop/src/             React 화면, Zustand, Demo, 좁은 IPC bridge
apps/desktop/src-tauri/src/   저장소, 사본·복구, 탐지·설치, 3개 CLI protocol/transport
packages/protocol/src/       버전이 있는 공통 이벤트와 reducer
assets/coi/manifest.json      7표정 atlas 출처·라이선스 검토 상태
tests/                       공유 이벤트, 가짜 CLI, 웹 E2E
docs/adr/                    제품·프로토콜·보안 결정
docs/validation.md           실제 확인 결과와 미검증 항목
docs/STATUS.md               남은 작업과 다음 착수 조건
```

세부 상태는 [검증표](docs/validation.md)와 [STATUS](docs/STATUS.md), [계획서 항목별 점검](docs/requirements-audit.md)에 있습니다. Windows 및 Intel 실기·서명·자산 권리 검토 등 공개 릴리스 조건은 남아 있습니다. 최신 실제 실행 증거는 [2026-09-19 검증](docs/validation-2026-09-19.md)에 기록합니다.

## 라이선스

Greenfield 코드: [Apache-2.0](LICENSE). 타사 의존성은 원래 라이선스를 유지하며 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)와 SBOM을 참고하세요. 캐릭터는 제공된 참고 시트를 바탕으로 생성한 개발용 초안으로, 공개 재배포 권리는 검토 전입니다. 모든 자산이 CC BY 4.0이라고 표시하지 않습니다. 원본 계획서와 참고 스크린샷은 저장소·앱에 포함하지 않습니다.
