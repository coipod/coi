# ADR 007 — 첫 만남과 Demo

2026-09-16 · 구현.

introduction → provider_check → trust_pact → first_mission → guided_run → completed를 저장한다. 어느 단계든 skip/resume 가능하다. 사용자 이름은 선택이고 로컬 설정이다. 가입 단계는 없다. 처음 CLI가 없어도 Demo로 끝까지 완료할 수 있다.

Demo는 동일 CliAdapter 계약으로 모의 읽기·승인·수정·검증·산출물·완료를 내보낸다. 실제 filesystem, provider, network는 사용하지 않는다. 스크립트된 예제임을 배지와 결과 문구에 명시한다. plan 모드는 승인·수정·검증 통과·가짜 artifact를 만들지 않는다. 취소는 타이머와 승인을 끝내고 terminal을 한 번만 보낸다.

checkpoint/reload, 첫 임무 전체, stop/retry, 키보드, 최소 화면을 Playwright로 검사한다. 실제 신규 사용자 5~8분 사용성 시험은 아직 수행하지 않았다.
