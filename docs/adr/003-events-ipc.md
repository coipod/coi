# ADR 003 — 좁은 IPC와 공통 이벤트

2026-09-16 · 채택.

Tauri main WebView만 사용자 권한 IPC를 호출한다. 원시 명령 실행·임의 절대 경로 읽기·provider credential IPC는 없다. native picker가 등록한 project ID와 UUID 작업/ChangeSet/application ID를 사용한다. 상대 경로는 별도 검사하며 cap-std로 원본 디렉터리 내부 접근만 허용한다. capability는 main의 core:default, remote 권한은 없다.

공통 schemaVersion=1 이벤트는 9개 discriminated payload이다. TS Zod와 Rust tagged enum이 같은 JSON fixture를 읽는다. ID/run/session/seq로 중복과 지연 이벤트를 무시하고 terminal 이후 상태 변경을 막는다. 승인은 providerRequestId/threadId/turnId/itemId로 묶는다. 거절·취소·원본 복구는 다른 동작이다.

검증 상태는 not_run/running/passed/failed/incomplete. completed만으로 passed가 되지 않는다. passed에는 명령·exitCode=0·artifact hash·evidence가 필요하다. 수정 이후 이전 검증은 무효화한다. synthetic 결과는 origin=demo로 분리한다. Codex text/activity/approval/terminal의 native 정규화와 영구 journal은 fixture로 확인한다. 실제 CLI 오류 분류와 검증 증거는 live 실행 gate 이후 확인이 필요하다. start/approve/cancel/조회 IPC의 현재 차단 범위는 [ADR010](010-native-runs.md)에 정리했다.
