# ADR 000 — Greenfield, 무계정, 공개 정책

2026-09-16 · 채택. 근거: 사용자 참조 대화의 최종 결정과 COI 실행계획서 v1.6. 이번 요청은 전체 구현 진행이므로 문서의 과거 '다음 세션 Phase 0만' 예시보다 우선한다. 안전 실행 조건과 릴리스 gate는 유지한다.

COI는 하나의 캐릭터가 작업 이벤트를 설명하는 로컬 데스크톱 앱이다. COI 로그인·회원가입·계정 서버·결제·추적 코드는 만들지 않는다. 공식 CLI 인증을 사용자가 관리하며 credential 수집·프록시·쿠키 복제는 하지 않는다. 코드 Apache-2.0, 문서·이미지 CC BY 4.0 배포는 권리 확인 후로 제한한다. 저장소 공개·push는 별도 요청 전 하지 않는다.

경쟁 구현은 읽기 전용으로 비교했으며 코드를 재사용하지 않았다.

| 참고 | 확인 코드 | 학습 및 COI 결정 |
|---|---|---|
| [RunJam](https://github.com/peintune/runjam/tree/5f8e67ac2185bde763e40f7b4538e4d13b591912) | `src-tauri/src/session/runner.rs`, SessionManager | 실행/입력/승인/종료 책임 분리. 설치 구현은 확인한 파일에서 실체가 없어 제품 소개를 구현 증거로 삼지 않음 |
| [Desktop CC GUI](https://github.com/zhukunpenglinyutong/desktop-cc-gui/tree/b48675fae011a06c5336c550501fd183704ce5f6) | `src-tauri/src/engine/codex.rs` | Rust adapter 분리와 소유 프로세스 수명주기 참고. 확인한 버전은 codex exec 중심. 위험 권한 우회 분기는 가져오지 않음 |

UI 참조는 정보 구조와 차가운 파란색·여백의 방향만 활용한다. 원본 화면을 앱 자산으로 사용하지 않는다. 생성된 캐릭터 atlas의 출처·제약은 `assets/coi/manifest.json`에 기록한다.
