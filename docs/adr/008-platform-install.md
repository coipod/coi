# ADR 008 — 플랫폼과 CLI 설치 안내

2026-09-16 · macOS arm64 개발 검증, 다른 플랫폼 미검증.

지원 목표는 macOS 13+ arm64/x64, Windows 11 x64. 현재 환경은 macOS 26.2 arm64, Node 22.22.2, Rust/Cargo 1.93.1이다. platform-specific 동작은 native core에서 처리하고 frontend에 shell을 노출하지 않는다.

설치 manifest에 공식 문서, OS별 명령, 버전 검사, 외부 인증 안내, 문서 확인 날짜를 기록한다. 사용자가 복사해 실행하며 COI가 설치하거나 관리자 권한을 요청하지 않는다. 고정된 CLI 이름만 PATH/일반 설치 위치에서 탐지하고 --version timeout을 둔다. 인증은 unknown으로 표시하며 인증 검사 명목의 inference를 하지 않는다.

확인한 글로벌 Codex는0.46.0, 공식 npm에서 프로젝트 내부로 설치한 검사 전용 Codex는0.154.0. 전역 CLI를 업그레이드하지 않았다. Gemini 탐지와 Claude 미설치 상태는 버전 연결 성공 또는 호환성 증거가 아니다. 세 공급자 모두 live 실행은 잠겨 있다.

CI matrix의 macos-15/arm64, macos-15-intel/x64, windows-2022/x64는 빌드 정의다. workflow가 원격에서 실행된 결과가 없고 Windows Server는 Windows 11 실기 증거가 아니다. 서명 인증서, macOS notarization, clean-machine 설치·제거/PATH 복귀와 고배율 접근성은 릴리스 gate다.
