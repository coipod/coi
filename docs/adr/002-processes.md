# ADR 002 — 소유 프로세스 종료

2026-09-16 · 구현, fake child macOS 검증. 실제 Codex/다른 OS는 미검증.

stdio transport가 Child, bounded writer/reader queue를 소유한다. stderr는 버린다. cancel은 turn/interrupt를 보내고 최대 5초 후 종료한다. Drop도 소유 프로세스를 종료한다. 저장된 PID를 읽어 죽이지 않는다. stdin 쓰기는500 ms 안에 완료되지 않으면 불명확한 전송으로 실패 처리한다. RunManager의 취소 flag와 정상 앱 Exit 종료 절차는 [ADR010](010-native-runs.md)을 따른다.

Unix: 독립 process group. WNOWAIT로 부모를 reap하지 않은 채 정상 종료를 관찰하고, group 종료 후 부모를 wait하여 PID 재사용 경합과 부모만 종료되는 orphan을 피한다. fixture는 부모가 종료할 때 남겨 둔 자식이 더 이상 실행되지 않음을 검사한다. setsid 등 의도적인 group 이탈까지 격리한다는 보장은 없으므로 live lifecycle gate는 여전히 닫힌다.

Windows: KILL_ON_JOB_CLOSE Job Object와 TerminateJobObject. 현재 spawn 후 Job attach 사이 경합이 남아 있으며 suspended spawn + assign + resume 또는 동일 보장을 실제 Windows에서 검증해야 한다. Job 할당 실패 시 즉시 child를 죽이고 실행을 거절한다. Windows 동작을 macOS 테스트 성공으로 대체하지 않는다.
