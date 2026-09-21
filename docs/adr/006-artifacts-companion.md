# ADR 006 — 정적 산출물과 COI 상태

2026-09-16 · 채택.

Companion과 Artifact는 오른쪽 공간을 공유한다. Focus 모드에서도 승인·완료·diff 동작은 중앙에서 접근할 수 있다. 7개 표정은 이벤트 상태에서만 파생한다. 검증 없는 완료, 실패, 승인 대기를 success로 표시하지 않는다. 캐릭터 atlas는 개발용 생성 초안이다.

코드·줄 번호 diff·HTML을 버리는 Markdown·파일 목록을 제공한다. main WebView에 HTML/SVG를 삽입하지 않는다. 외부 이미지 beacon과 javascript 링크를 제거한다. CSP는 object/frame/remote script/network를 차단한다. main navigation은 로컬 앱 origin으로 제한한다. 디버그 개발 서버는 1420만 허용한다.

PNG·JPEG·WebP는 native에서 압축 파일8 MiB, 너비/높이8192, decoder 메모리64 MiB로 제한하고 최대1600px PNG로 재인코딩한다. 원본의 실행 가능한 markup이나 metadata를 WebView에 전달하지 않는다. 손상된 데이터/SVG는 거절한다.

실행형 localhost preview, Live2D 원화는 이 개발 프리뷰에 포함되지 않는다. 실행형 preview를 추가하려면 별도 무권한 WebView, origin/port allowlist, popup/download와 IPC 차단 native 시험이 선행되어야 한다.
