# #162 문서에서 회사 계정 이름 지우기

- 이슈: [#162](https://github.com/sirloinbh/workout-memo/issues/162) (중앙 sirloinbh/project-standards#237)

## 변경

`AGENTS.project.md`, `docs/project-github-auth.md`에서 회사 GitHub 계정 이름을 지웠다. "기본 `gh`는 회사 계정용으로 두고 프로젝트 원격 변경에는 개인 계정 래퍼를 쓴다"는 규칙은 그대로다.

같은 작업(#237)에서 이 리포의 커밋 작성자 중 회사 신원을 개인 noreply로 바꿔 히스토리를 다시 썼다(2026-10-27, 파일 내용은 그대로).

## 검증

- `git grep`으로 저장소 파일에 회사 계정 이름이 없음을 확인
- Prettier 통과
