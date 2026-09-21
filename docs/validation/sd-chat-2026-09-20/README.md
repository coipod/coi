# COI SD 채팅 개선 검증 · 2026-09-20

COI 왼쪽/사용자 오른쪽, 개별 생성한 6종 SD 스티커, 대화 아바타, 앱 아이콘, 공통 UI 모션을 반영했다. 오른쪽 캐릭터 렌더러는 변경하지 않았다.

## 통과
- TypeScript 타입 검사, ESLint, Vitest 16개, Playwright 22개(스티커 9 + 기존 workspace 13).
- macOS arm64 debug 앱 빌드 및 Finder에서 실행. 네이티브 스티커 패널의 6개 이미지와 이름을 육안 확인.
- 960/1440/1728px 배치와 긴 요청·코드 텍스트, 가로 넘침 검사.
- 삽입·교체·제거·편집·전송·재시도·재시작 복원, 이미지 실패/알 수 없는 ID의 텍스트 보존.
- 클릭만으로 실행하지 않음, CLI에는 최종 요청 텍스트만 전달, 취소/시작 실패의 초안 보존, 승인 대기 중 바뀐 다음 요청 설정 보존.
- 키보드 열기·선택·닫기와 초점 복귀, OS reduced motion, 과거 메시지 복원 시 등장 효과 없음.
- SD 원본 및 투명 알파 확인, 6종 얼굴·손·전체 실루엣 육안 확인. 16/32/64px 아이콘과 Finder 앱 아이콘 확인.

## 산출물
- 앱: `apps/desktop/src-tauri/target/debug/bundle/macos/COI.app`
- 생성 지침·원본 경로·SHA256: `assets/coi/sd-generation.json`
- 자산 및 파생 파일 설명: `assets/coi/manifest.json`
- macOS ICNS, Windows ICO/PNG: `apps/desktop/src-tauri/icons`
- 웹 favicon: `apps/desktop/public/favicon.png`
- 이 폴더의 PNG는 화면 크기별 검증 기록이다.

## 검증 한계
- Windows 아이콘 파일은 생성했지만 Windows 실기 검증은 하지 않았다.
- Dock 접근 도구가 시간 초과하여 Dock 자체의 표시 검증은 완료하지 못했다. Finder의 번들 아이콘과 ICNS 생성은 확인했다.
- 16px에서는 얼굴과 청색/은백색 식별이 가능하지만 머리핀 세부 형태는 작은 크기로 인해 구분이 어렵다.
- 이번 회귀 테스트의 CLI 전송은 mock bridge, UI 실행은 Demo를 사용했다. 기존 실제 CLI 연결/인증 설정은 수정하지 않았다.
- Vite의 기존 500kB 초과 chunk 경고는 남아 있으며 빌드는 성공한다. 배포 서명/공증 없는 로컬 debug 빌드다.
