# 프로젝트 GitHub와 Codex 계정

개인 계정 도구(`gh-project.ps1`, `project-terminal.ps1`, 계정B VS Code 실행기)의 원본과 설치 방법은 중앙 리포 [sirloinbh/project-standards `docs/tools.md`](https://github.com/sirloinbh/project-standards/blob/main/docs/tools.md)가 관리합니다. 설치 위치는 `%LOCALAPPDATA%\sirloinbh-tools`입니다. 이 문서는 이 프로젝트에서 쓰는 방식만 적습니다.

## GitHub 사용

- 기본 `gh`는 회사 계정용으로 유지합니다. 이 프로젝트의 이슈·푸시·PR 같은 원격 변경은 개인 계정 `sirloinbh`로 하고, 기본 `gh`로 하지 않습니다.
- 대화형 터미널에서는 `ghp`를 씁니다. VS Code 통합 터미널 프로필(`.vscode/settings.json`, 중앙 관리 파일)이 `project-terminal.ps1`을 불러 `ghp` 함수를 만듭니다.
- 함수가 없는 비대화형 워커·외부 PowerShell은 래퍼를 직접 부릅니다: `./scripts/gh-project.ps1 api user --jq .login`(중앙 관리 파일). 기대 계정은 `sirloinbh`입니다.
- Git push/fetch는 이 저장소의 로컬 credential helper가 `%LOCALAPPDATA%\sirloinbh-tools\gh-project.ps1 auth git-credential`을 씁니다. 전역 helper와 회사 기본 인증은 바꾸지 않습니다. 재클론하면 중앙 `tools/set-credential-helper.ps1`로 다시 설정합니다.

래퍼는 상속 토큰을 지운 뒤 `auth token --hostname github.com --user sirloinbh`로 계정을 명시해 그 호출의 `GH_TOKEN`에만 씁니다. 계정이 없으면 다른 계정으로 대신하지 않고 실패합니다. 성공·실패 후 부모 환경을 복원하고 인자·종료 코드·Git credential 요청의 stdin을 그대로 넘깁니다. 토큰 값은 문서·로그에 남기지 않습니다.

## 개인 Codex 프로필

공식 환경변수 `CODEX_HOME`으로 Codex의 설정·상태 저장 위치를 고릅니다. 이 프로젝트는 `%LOCALAPPDATA%/Codex-Account-B`의 기존 개인 계정B 프로필을 씁니다([OpenAI 구성 문서](https://learn.chatgpt.com/docs/config-file/config-advanced#config-and-state-locations)). 실행기는 이 홈을 고를 뿐 로그인이나 인증 저장 방식을 바꾸지 않습니다. 이미 실행 중인 회사 계정 Codex 대화는 자동으로 바뀌지 않으므로, 새 프로젝트 창과 새 터미널에서 씁니다.

## 검증

`node --test scripts/test/project-github-auth.test.mjs` — `scripts/gh-project.ps1` 래퍼의 계정 선택, 상속 토큰 제거, 부모 환경 복원, 인자·종료 코드·stdin 전달을 가짜 `gh`와 임시 환경으로 확인합니다. Windows 전용이며 다른 운영체제에서는 건너뜁니다. 터미널 초기화와 실행기 검사는 중앙 리포 `tools/` 테스트가 맡습니다.
