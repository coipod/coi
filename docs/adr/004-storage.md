# ADR 004 — SQLite 저장과 복원

2026-09-16 · 채택, schema version 2 (UI snapshot은1).

native는 SQLite WAL과 transaction을 사용한다. settings/sessions/projects/events/migrations 테이블을 생성한다. 현재 UI는 버전이 있는 snapshot을 기본 복원 단위로 사용하고 세션을 별도 테이블에 반영한다. Demo Run은 세션 JSON에 저장한다. native Run은 별도의 native_runs/events journal에 순서대로 저장하며 UI snapshot으로 덮어쓰지 않는다. 실제 native 실행은 gate에서 차단되고 journal lifecycle은 fixture로 검증했다. [ADR010](010-native-runs.md)을 참고한다. 브라우저 Demo만 localStorage를 사용한다.

재시작 시 미완료 Run은 failed, 진행 중 검증은 incomplete, pending 승인은 비운다. 이전 승인으로 실행을 재개하지 않는다. 알 수 없는 버전 또는 읽기 실패는 기존 저장소를 덮어쓰지 않는다. 문자열 값을 재귀 정제하며 JSON 원문에 정규식을 적용해 구조를 손상시키지 않는다. 원본 적용 백업은 정확한 복구를 위해 그대로 보존한다. 사용자 소스의 모든 비밀 제거를 보장하지 않는다.

설정에서 이야기와 작업 사본을 명시 삭제할 수 있다. 이야기를 삭제해도 복구 데이터는 유지한다. 즉시 사본 삭제는 관련 journal이 모두 reverted일 때만 가능하다. 일반 SQLite 삭제가 디스크 포렌식 삭제를 보장하지는 않는다.

## 보존과 정리

열린 사본과 미적용 변경은 기한 없이 보존한다. 사용자가 두 단계로 ‘30일 뒤 정리’를 예약하면 그때부터 사본과 적용 백업의 기한을 센다. 사본 내용이 baseline과 같거나 모든 변경이 적용된 journal의 postimage와 일치해야 예약할 수 있다. 미완료 거래는 예약과 정리를 모두 차단한다. 재개/사본 폴더 열기/변경 검토/적용/복구는 예약을 해제한다.

만료 시 앱 시작 또는 ‘기한 지난 예약 정리’로 정리한다. 삭제 직전 내용 hash를 다시 확인하고 예약 후 편집, 제외·숨김 파일 추가, symlink, 확인 범위 초과, 알 수 없는 보존 기록이면 보호 상태로 남긴다. 미적용 변경을 자동 삭제하지 않는다. 검사에는 project ignore 규칙을 적용하지 않는다. 원본과 대화는 정리 대상이 아니다.

정리 recipe를 fsync한 뒤 작업 디렉터리를 retired로 atomic rename하고 연관 journal/ChangeSet/사본을 삭제한다. 중단된 삭제는 재시작 때 같은 recipe로 재개한다. UI는 삭제된 사본 참조를 정리한다. 30일 경계, 미적용/추가 파일 보호, 미완료 복구 보호, 재개, 알 수 없는 버전, 삭제 재시작을 Rust 테스트로 검증한다.

진단 raw log는 저장하지 않고 메타데이터만 요청 시 내보내므로 현재 앱 내부에 7일 보존 대상 진단 파일은 없다. 사용자가 다른 위치에 내보낸 파일은 앱이 자동 삭제하지 않는다. 향후 내부 진단 기록을 추가하면 별도의 7일 정책을 적용한다.

## Migration

현재 지원 SQLite schema는2이다. 버전별 SQL을 단일 transaction으로 실행하고 필수 컬럼을 확인한 다음 commit한다. 기존 데이터와 반복 실행을 검증했다. 지원 버전보다 새로운 DB는 WAL 설정 변경 전 거절하며 실패한 migration은 DDL까지 rollback한다. schema1의 기존 테이블과 데이터를 유지하며 native_runs와 인덱스를 추가한다. 손상된 DB의 사용자 복구 화면은 아직 후속 항목이다.

## UI persistence update — 2026-09-22

Durable snapshot changes are coalesced in a single writer; transient controls no longer serialize history. Native SQLite saves run on a blocking worker rather than the UI thread. Starting a native request flushes pending snapshot persistence first. Snapshot version 2 and previous-version compatibility remain unchanged. Failure remains visible and prevents subsequent unsafe start assumptions.
