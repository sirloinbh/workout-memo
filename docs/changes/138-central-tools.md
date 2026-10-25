# #138 개인 계정 도구 복사본 정리

## 변경

- `scripts/project-terminal.ps1`, `scripts/open-vscode-account-b.cmd` 삭제. 원본은 중앙 `sirloinbh/project-standards`의 `tools/`이고 `%LOCALAPPDATA%\sirloinbh-tools`에 설치된다(중앙 #19, #21).
- `scripts/test/project-github-auth.test.mjs`: 지운 두 파일과 `gh-workout-memo` 설치 위치, 예전 `.vscode/settings.json` 프로필(`Workout Memo PowerShell`)을 검사하던 테스트 9건을 지웠다. 남은 9건은 `scripts/gh-project.ps1`(중앙 동기화 관리 파일) 래퍼 검사다.
- `docs/project-github-auth.md`: 중앙 `docs/tools.md` 안내와 이 프로젝트의 사용 방식만 남겼다.
- `AGENTS.project.md`: 설치 위치를 `%LOCALAPPDATA%/sirloinbh-tools`로 고쳤다.

## 이유

중앙 첫 동기화 PR(#143)이 `.vscode/settings.json`을 중앙 템플릿(`sirloinbh PowerShell` 프로필, `sirloinbh-tools` 경로)으로 바꾸면서, 예전 경로를 확인하던 `VS Code terminal settings select company gh and personal Codex` 테스트가 `windows-auth`에서 실패했다. 이 PR을 먼저 병합하면 #143의 `windows-auth`가 통과한다.

`.vscode/settings.json`은 #143이 바꾸므로 이 PR에서는 건드리지 않았다. 그래서 `gh-workout-memo` 경로는 #143 병합 전까지 이 파일에 남는다.

## 검증

- `node --test scripts/test/project-github-auth.test.mjs`(Windows): 9 pass, 0 fail.
- `prettier --check`(변경 파일 4개): 통과.
