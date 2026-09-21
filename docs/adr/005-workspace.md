# ADR 005 — 작업 사본과 원본 적용 거래

2026-09-16 · 구현 및 macOS native smoke 검증.

사용자가 native picker로 고른 원본을 기준으로 현재 내용을 baseline/work에 각각 복사한다. Git HEAD가 기준이 아니다. 제외 목록·.gitignore·symlink/junction·10,000 files/200 MiB/20 MiB file 제한을 적용한다. COI 데이터 폴더를 포함한 상위 폴더는 사본 대상으로 거절한다. 누락 목록을 UI에서 확인할 수 있다.

collect는 baseline hash를 재확인하고 UTF-8 생성·수정/지원 불가 변경을 불변 ChangeSet 파일에 저장한다. 적용은 모든 파일의 원본 hash와 postimage 무결성을 먼저 검사한다. 하나라도 충돌하면 write 0개. preimage journal을 fsync한 후 각 파일을 temporary write/fsync/rename한다. 각 단계의 written 목록과 상태를 디스크에 남긴다.

여러 파일의 원자성을 주장하지 않는다. 도중 실패·강제 종료는 applying/recovery_required/reverting journal로 탐지하며 같은 프로젝트의 새로운 적용보다 복구를 먼저 요구한다. undo는 모든 현재 hash를 검사하고, 후속 사용자 편집이 있으면 덮어쓰지 않는다. 부분 복구는 이미 baseline인 파일을 허용한다. original Git 메타데이터를 건드리지 않는다.

검증: dirty baseline 보존, 생성/복구, 적용 전 conflict write0, 적용 후 편집 보존, 2파일 중 실패와 재시작 복구, symlink 탈출, 위험 경로/설정 제외, 복구 전 백업 삭제 거절. Native UI smoke도 별도의 임시 README 프로젝트로 수행했다.

한계: 파일 hash 검사와 교체 사이 외부 프로세스의 동시 쓰기는 파일 시스템 전체에서 잠글 수 없다. hostile OS 계정으로부터 보호하는 보안 경계는 아니다. 지금은 native CLI sandbox가 검증되지 않아 이 사본을 AI 프로세스에 전달하지 않는다.
