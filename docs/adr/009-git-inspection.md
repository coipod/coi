# ADR 009 — Git 상태와 diff 조회

2026-09-16. Git 상태는 원본의 HEAD·index·working tree를 비교한다. 작업 사본 baseline과 ChangeSet 비교는 별도 기능으로 유지한다. 알파는 Git 쓰기·stage·commit·push를 제공하지 않는다.

고정한 git2 0.21 / vendored libgit2 1.9.7을 사용한다. SSH·HTTPS 기능을 끄며 git 실행 파일, shell, credential callback, 사용자 등록 filter를 호출하지 않는다. libgit2의 기본 filter 등록은 CRLF/ident이며 외부 filter는 등록하지 않는다. 외부 clean 명령이 설정된 fixture에서 marker가 생기지 않는 것을 시험했다. [필터 API](https://libgit2.org/docs/reference/main/filter/index.html), [StatusOptions](https://docs.rs/git2/0.21.0/git2/struct.StatusOptions.html).

조회 전에 프로젝트 범위의 허용 상대 경로를 만든다. 기본 credential/provider/의존성 제외와 symlink guard를 적용하고 Git index의 삭제 경로도 같은 guard를 통과해야 한다. status pathspec은 이 목록의 literal 경로만 허용한다. 인덱스 갱신과 rename 유사도 탐색, submodule 탐색을 끈다. 원본·index를 고치는 API는 IPC에 없다.

Git 탭에서 파일별 스테이징(HEAD→index)과 작업 파일(index→working tree) diff를 구분한다. untracked 텍스트도 표시한다. diff는 최대 512 KiB, 큰 파일은 binary 요약으로 제한하고 결과 텍스트는 redaction한다. 모든 표시가 조회 범위에 한정됨을 안내하므로 제외 파일이 있는 저장소 전체를 ‘깨끗함’으로 판정하지 않는다.

현재 .git 디렉터리가 있는 일반 저장소 루트만 지원한다. 연결된 Git worktree·bare repo·부모 저장소 자동 탐색은 후속 범위다. 필터가 필수인 저장소에서 실패하면 오류를 표시하며 Git CLI로 재시도하지 않는다.

검증: 분리된 임시 저장소의 staged/unstaged/untracked diff, 경로/secret 제외, 조회 전후 index와 원본 바이트 불변, 외부 filter 미실행. 라이브러리 source는 수정하지 않았고 COPYING/linking exception/내부 구성요소 고지·AUTHORS·zlib license를 앱과 저장소에 포함한다. 설정 About에서 해당 고지를 볼 수 있다.
