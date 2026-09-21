# ADR 010 — 네이티브 실행 소유권과 이벤트 journal

2026-09-16 · 실행 코어는 synthetic child로 확인. 실제 Codex 연결은 닫힌 상태.

## 실행과 저장

RunManager가 프로젝트별 실행을 예약하고 worker thread가 stdio 자식 프로세스를 소유한다. SQLite `native_runs`의 partial unique index가 종료되지 않은 프로젝트 실행의 중복을 막는다. 예약과 시작 기록을 저장한 뒤 프로세스를 생성한다. 프로세스 생성 실패도 실패 이벤트로 남긴다. taskCopyId와 mode는 Run에 기록되며 실제 안전 프로필이 승인되기 전에는 생산용 LaunchPlan을 만들 수 없다.

worker는 initialize → initialized → thread/start → turn/start 순서를 확인한다. 한 OS read에 응답과 후속 알림이 함께 와도 프레임마다 상태를 반영한다. thread/turn 식별자는 DB에 저장한다. text, item의 시작/종료, 명령 종료 코드, 승인, terminal을 공통 이벤트로 변환한다. 명령 exit code 0만으로 verification=passed를 생성하지 않는다. 미지원 제어 요청, stdin 승인, remote environment 지정과 권한 확대는 실패로 처리한다. null인 optional 권한 필드는 확대 요청으로 간주하지 않는다.

이벤트 ID·순번·payload와 Run의 seq/status는 같은 transaction으로 저장한 뒤 구독자에게 알린다. renderer snapshot 저장은 이 journal을 덮어쓰지 못한다. run당 10,000개 이벤트/UTF-8 바이트 기준16 MiB, 개별 이벤트128 KiB 한도를 두며 terminal 기록 공간을 별도로 허용한다. 조회는 seq cursor와128개 페이지를 사용한다. UI snapshot schema는1, SQLite schema는2다.

## 승인·취소·종료

승인에는 run/approval/request/thread/turn/item 식별자가 모두 맞아야 한다. 한 번 결정한 요청은 다시 응답하지 않는다. 결정은 전송 전에 저장하며 전송 결과가 불명확하면 재전송하지 않고 소유 프로세스를 종료한다. 공급자의 resolved 이벤트를 사용자의 allow 결정으로 추측하지 않는다. 결정되지 않은 요청은 expired로 표시한다. terminal은 pending 전체를 폐기한다.

Stop은 bounded 승인 queue와 별도의 atomic flag이므로 승인 요청으로 queue가 차도 취소할 수 있다. worker는 interrupt 후 최대5초 동안 공급자의 terminal을 받고, 응답하지 않으면 소유 process group/Job을 종료한다. 프로세스 정리 후 terminal을 저장하고 프로젝트 예약을 해제한다. stdin writer는 bounded queue와500 ms 응답 제한을 사용해 입력을 읽지 않는 자식이 무한 대기시키지 못하게 한다. 원시 stdout/stderr는 저장하지 않는다.

정상 앱 종료에서 모든 worker에 취소를 먼저 요청하고 join한다. OS 파일 잠금을 DB 복구 전에 얻어 두 번째 앱 인스턴스가 실행 중인 journal을 재시작 기록으로 바꾸지 못하게 한다. 앱 재시작 시 미종료 Run은 app_restarted 실패로 확정하며 자동 재개하지 않는다. 저장된 PID를 종료 대상으로 쓰지 않는다.

## IPC와 현재 범위

main 창에 start_run / resolve_run_approval / cancel_run / list_native_runs / read_run_events를 추가했다. start_run은 gate에서 항상 거절하며 실행 파일·args·cwd·권한·thread ID를 renderer에서 받지 않는다. 화면의 실제 프로젝트 요청은 이 native gate까지 호출하며 거절 시 입력을 지우지 않는다. 실행/이벤트/승인 fixture는 임시 DB만 사용하며 실제 사용자 앱 기록에 들어가지 않는다.

실제 CLI 연결 완료를 뜻하지 않는다. 남은 항목은 certified LaunchPlan, 인증/사용량/오류 분류, 사본 소유권과 원본 거래 lock의 통합, 전송 고지, UI 이벤트 구독/복원, 공급자 thread fingerprint/resume, 변경 산출물 수집과 검증 증거 연결이다. Windows Job의 spawn→attach 경합, 비정상 앱 crash의 descendant 정리 및 group 이탈 방어도 미검증이다. 이 조건을 갖추기 전에는 gate tuple만 추가해서 실행을 열지 않는다.

## 검사

macOS의 실제 Node fixture process로 정상 lifecycle/승인 scope·중복 거절/프로젝트 단일 실행/승인 중 취소/앱 shutdown/비정상 JSON/무응답 강제 취소/DB 재개 복구·순번·redaction을 검사한다. 별도 transport 검사는 stdin 무응답과 orphan parent 종료를 확인한다. 실제 모델이나 인증을 사용하는 시험이 아니다.
