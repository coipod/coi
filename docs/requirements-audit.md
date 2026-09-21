> Historical development record. Current support: [STATUS](STATUS.md). Current release conditions: [READINESS](release/READINESS.md).

# 계획서 v1.6 항목별 점검

> 2026-09-19 추가: 아래 표는 9월 16일 기준 기록입니다. 실제 CLI 실행·연결·설치·캐릭터 관련 차단 상태는 [최신 검증](validation-2026-09-19.md)과 [현재 상태](STATUS.md)로 대체합니다. 첨부·Monaco·xterm·다른 OS·출시 관련 항목의 완료를 의미하지 않습니다.

2026-09-16. 기준은 사용자 제공 계획서와 참조 대화다. 개발 프리뷰를 Codex 알파로 바꿔 부르지 않는다. S0~S7·S9가 알파 조건이며 S8은 베타 조건이다. ‘로컬 확인’은 macOS arm64에 한정한다. 이 표에서 외부 검증 항목을 분리해도 필수 기능의 미구현 상태가 해소되지는 않는다.

| 계획서 항목 | 판정 | 구현·증거 또는 남은 일 |
|---|---|---|
| 1.3·1.8 자체 계정/서버/구독/telemetry 없음 | 구현 | 앱·DB에 해당 기능 없음, README/ADR000 |
| 1.7 Greenfield·OSS 비교 | 구현 | ADR000에 pinned 비교 소스, 코드 가져오지 않음 |
| 1.8 Apache·기여·보안 정책 | 구현, 출시 점검 필요 | LICENSE/NOTICE/SECURITY/DCO·템플릿, 연락 경로·권리 최종 검토 필요 |
| 1.8 의존성 목록·secret scan | 로컬 확인 | npm SBOM·Rust inventory·audit. 실제 타깃별 bundle/NOTICE 최종 감사 필요 |
| S0·4 Demo 첫 임무 | 로컬 확인 | 첫 만남→승인→diff→적용/undo→복원 E2E |
| S0·4 실제 CLI 첫 임무 | 미구현/차단 | native start gate까지 연결. 공급자 경계 확보, 전송/사용량 고지와 샘플 실행 연결 필요 |
| 4.1 첫 사용 5~8분 | 미검증 | 신규 사용자 관찰 시험 필요. E2E 시간을 사용성 결과로 간주하지 않음 |
| 4 Skip/Resume·checkpoint | 로컬 확인 | 중간 재시작 E2E, 완료·건너뛰기 저장 |
| 4.6 CLI 설치 가이드·복사·재탐지 | 부분 구현 | 공식 링크·OS별 명령·고정 CLI 탐지. shell/package-manager 상세 환경 검사·PATH 변경 실기 필요 |
| 4.2 외부 인증 상태 | 부분 구현 | 현재 unknown, 미인증으로 단정하지 않음. 인증 상태 API·오류 분류 연결 필요 |
| 3.1 3-pane·960×640·drawer·resize | 웹 확인 | 960/1440/1728 E2E. Windows 고배율 실기 필요 |
| 3.2·S3 Companion↔Artifact 상태 유지 | 로컬 확인 | 숨겨진 Artifact를 유지하여 선택 tab·검토 상태 보존. 회귀 E2E |
| 3.1 검색·최근 프로젝트·이름 변경 | 구현 | 프로젝트 picker, 세션 검색·이름 변경·명시 삭제 |
| 3.1 키보드·IME·명령 팔레트 | 웹 확인 | Cmd/Ctrl K/N/Shift F, IME 전송 방지. 전체 스크린리더 실기 필요 |
| 3.1 첨부 | 미구현 | 범위·형식·전송 고지를 갖춘 첨부 기능 필요 |
| 3.4 이벤트 기반 표정·완료/검증 분리 | fixture 확인 | 9개 이벤트 계약과 reducer, 7표정. live 이벤트 매핑 미완료 |
| 4 접근성·Focus·대사 속도 | 부분 구현 | 설정·키보드·고대비·reduced motion. VoiceOver/Windows 실기 필요 |
| 5 Tauri2/React/TS/Zustand/SQLite | 구현 | 빌드·typecheck·Rust tests |
| 5 코드·diff Monaco | 부분 구현 | 현재 읽기 전용 pre/줄 diff. Monaco/문법 강조는 미구현 |
| 5 읽기 전용 xterm 로그 | 부분 구현 | 정제 이벤트 타임라인 있음. 실제 명령 로그 viewer와 xterm은 미구현 |
| 5.2 좁은 IPC·main 창 제한 | 로컬 확인 | 고정 command, 경로 guard, 외부 navigation/CSP 제한 |
| 5.2.1·S1 실제 Codex stable stdio | 차단/부분 구현 | initialize만 실제 확인. native RunManager·stdio lifecycle·저장 fixture 구현. 생산용 LaunchPlan 없음 |
| 5.2.1 제한 읽기/쓰기·network | standalone만 확인 | 두 named-profile 경우 × 6검사 통과. app-server thread에서 재검증 필요 |
| 5.2.1 MCP/hooks/plugins·project config 격리 | 차단 | 빈 map은 recursive merge로 기존 MCP 유지. 공식 실행별 완전 차단 경로 필요 |
| 5.2.1 사용자 config 불변 | 현재 준수, 연결 미검증 | thread 시작 시 trust 기록 가능성 발견. 연결 전에 방지해야 함 |
| 6.1~6.3 공통 envelope/정규화 | 부분 구현 | TS/Rust/shared fixture. native text/activity/approval/terminal 정규화 fixture 추가. 실제 오류 분류·검증 증거 연결 필요 |
| 6.3 native 승인·중복/지연 거절 | fixture 확인 | request/thread/turn ID·한 번만 응답, 미지원 권한 확대 거절. native 승인 IPC·worker·DB fixture 추가, 실제 공급자 확인 필요 |
| 6.3 Stop·프로세스 소유/강제 종료 | 부분 확인 | macOS fake parent+descendant, worker interrupt/5초 강제 취소·stdin 무응답·정상 앱 Exit 구현. 실제 Codex/앱 crash·Windows suspended spawn 필요 |
| 6.3 프로젝트별 단일 실행 | 부분 구현 | native DB partial unique index·worker/앱 OS 잠금 fixture 확인. 원본 거래 lock과의 통합은 남음 |
| 6.4 ProviderThread·resume fingerprint | 미구현 | native thread 저장·경계 변경 시 새 thread·resume 검증 필요 |
| 7.1·S5 로컬 저장/복원 | 로컬 확인 | UI snapshot+세션 mirror, native 재시작 확인. schema2 native Run/Event journal·thread/turn ID·중단 복구 fixture 추가. live UI replay/ProviderThread resume 미완료 |
| 7.1 migration | 부분 확인 | 버전별 transaction·필수 컬럼·future version 거절·rollback 시험. 손상 DB 복구 UI 필요 |
| 7.3 비밀·raw log·진단 | 로컬 확인 | raw log 미저장, 값 단위 정제, 진단 preview/save. 임의 비밀 완전 탐지는 아님 |
| 7.3 진단 7일 | 현재 저장 대상 없음 | 내부 진단 기록을 만들지 않음. 사용자 export는 자동 삭제하지 않음 |
| 7.3 사본/백업 30일·미적용 보존 | 구현·core 확인 | 명시적 닫기→기한 표시→예약 정리. 내용 변경/미완료 거래 보호·중단 재개 tests |
| 7.4 dirty working tree 사본 | 로컬 확인 | baseline 현재 내용, 제외·한도·symlink 검사. Windows junction 실기 필요 |
| 7.4 불변 ChangeSet·충돌 0쓰기 | 로컬 확인 | Rust tests와 native 원본 적용 smoke |
| 7.4 WAL journal·partial recovery·undo | 로컬 확인 | 실패 주입·재시작·후속 편집 거절·원본 바이트 복구 |
| 7.4 binary/delete/rename 차단 | 로컬 확인 | 지원 텍스트 생성·수정 외 자동 적용 거절 |
| 2 Git 상태·diff 조회 | 구현·core 확인 | 일반 저장소 루트의 staged/unstaged/untracked diff, index·원본 불변 테스트. Git worktree 연결은 후속 |
| 7.5 Markdown/이미지/CSP | 로컬 확인 | HTML·SVG·remote image 차단, PNG/JPEG/WebP 한도 decode→PNG |
| 7.5 실행형 web preview | 베타 미구현 | 전용 무권한 WebView 검증 후 추가 |
| 9 캐릭터 flat turnaround/투명7표정 | 부분 구현 | 생성 atlas 초안·manifest만 있음. 정식 원화·출처/권리 확인 필요 |
| S6 오류 UX | 부분 구현 | 저장 실패·탐지·경로·복구·modal 알림. auth/quota/provider crash live 흐름 필요 |
| S7 CI 3타깃 | 정의만 있음 | 원격 실행 결과 없음. 실제 Apple Silicon/Intel/Windows 결과 필요 |
| S7 DMG/NSIS 서명·새 사용자 설치 | 미검증 | macOS arm64 unsigned debug app만 빌드. 인증서·공증·다른 OS 실기 필요 |
| S8 세 CLI·명시적 Handoff | 베타 미구현 | Codex 알파 조건 통과 뒤 진행. 설치 안내를 실행 지원으로 표시하지 않음 |

## 다음 구현 순서

1. Codex 경계 조사 결과를 유지하면서, 아직 가능한 로컬 구현을 완료한다: native 코어의 UI replay/사본·거래 lock 통합, 첨부, 코드·로그 viewer, 문자열 key, 손상 DB 복구 UX.
2. 실제 Codex thread 시작 전 MCP/hooks/plugins 및 설정 불변을 강제할 경로를 검증한다. 기존 인증 파일 복제·전역 config 변경·PTY 우회는 해법에 포함하지 않는다.
3. 검증된 조건에서만 native live 연결·승인/취소·실제 README 작업을 수행한다. fixture와 실제 증거를 분리한다.
4. 다른 OS/서명/권리/사용성 등 외부 증거를 모으고 알파 기준을 다시 판정한다. Codex 알파 완료 전 베타 성공을 선언하지 않는다.
