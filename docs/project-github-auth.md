# 프로젝트 GitHub와 Codex 계정

이 프로젝트에서도 기본 `gh`는 회사 계정 `byunghKim`용으로 유지한다. 프로젝트의 개인 GitHub 작업은 `ghp`를 우선 사용한다. `ghp`는 `scripts/gh-project.ps1` 래퍼를 호출하며 개인 설정 `%USERPROFILE%/.config/gh-personal`과 계정 `sirloinbh`를 명시한다. 설치 스크립트 경로 `%LOCALAPPDATA%/gh-workout-memo`는 인증 설정 경로와 별개다.

## GitHub 사용

- VS Code의 새 프로젝트 터미널은 회사 설정 `GH_CONFIG_DIR=%APPDATA%/GitHub CLI`를 사용하고 상속받은 `GH_TOKEN`/`GITHUB_TOKEN`을 제거한다. `project-terminal.ps1`은 `gh`를 재정의하지 않고 `ghp` 함수만 제공하므로 PowerShell 사용자 프로필 없이도 사용할 수 있다. 초기화 스크립트도 회사 설정과 개인 `CODEX_HOME`을 지정하여 이전 브랜치의 VS Code 설정으로 열어도 설치본 갱신 후에는 같은 조합을 적용한다.
- 개인 계정 확인: `ghp api user --jq .login`. 기대 계정은 `sirloinbh`이다. 기본 회사 `gh`로 이 프로젝트의 이슈·푸시·PR 등 원격 변경을 수행하지 않는다.
- 함수가 없는 비대화형 워커·외부 PowerShell: `./scripts/gh-project.ps1 api user --jq .login`처럼 래퍼를 명시적으로 사용한다.
- Git push/fetch: 이 저장소의 로컬 credential helper는 `%LOCALAPPDATA%/gh-workout-memo/gh-project.ps1` 설치본을 사용한다. 전역 helper와 회사 기본 인증은 변경하지 않는다. 재클론 시 로컬 helper 설정은 별도로 필요하다.
- 개인 폴더에 처음 인증해야 한다면 `ghp auth login --hostname github.com --git-protocol https --web` 또는 같은 인자의 명시적 래퍼를 사용한다. 기존 개인 로그인은 그대로 사용하며 이 변경 자체는 로그인을 실행하거나 토큰 저장소를 옮기지 않는다.

래퍼는 상속 토큰을 제거한 뒤 `auth token --hostname github.com --user sirloinbh`로 계정을 명시해 해당 호출의 `GH_TOKEN`에만 적용한다. 계정이 없으면 다른 계정으로 대체하지 않고 실패한다. 성공·실패 후 부모 환경을 복원하고 인자·종료 코드·Git credential 요청의 stdin을 전달한다. 토큰 값을 문서·로그에 기록하지 않는다. 앱 환경 파일에 GitHub 인증을 넣지 않는다.

## 개인 Codex 프로필

공식 환경변수 `CODEX_HOME`으로 Codex의 로컬 설정·상태 저장 위치를 선택한다. 이 프로젝트는 `%LOCALAPPDATA%/Codex-Account-B`의 기존 개인 계정B 프로필을 사용한다. 여기서 계정B 프로필은 기존 홈 폴더를 가리키며 `--profile` 설정 프리셋과 구분한다. [OpenAI 공식 구성 문서](https://learn.chatgpt.com/docs/config-file/config-advanced#config-and-state-locations)는 `CODEX_HOME` 아래에 설정과 로컬 상태를 저장한다고 설명한다.

실행기는 이 홈을 선택할 뿐 실제 로그인이나 인증 저장 방식을 변경하지 않는다. 이미 실행 중인 회사 계정 Codex 대화가 자동 전환되는 것은 아니다. 새 프로젝트 창과 새 터미널에서 개인 프로필을 사용해야 한다. ChatGPT 앱 계정은 별도이며 앱에서 개인 계정을 선택해야 한다. 이메일이나 인증 파일은 저장소에 기록하지 않는다.

## VSCode-계정B.cmd와 설치본

바탕화면 실행 파일은 `scripts/open-vscode-account-b.cmd`의 로컬 경로 적용 사본이다. 인자 없이 실행하거나 프로젝트 루트를 첫 인자로 전달하면 개인 `CODEX_HOME`, 회사 `GH_CONFIG_DIR`, 프로젝트 전용 사용자 데이터 폴더 `%LOCALAPPDATA%/VSCode-Account-B-workout-memo`로 연다. 상속 토큰을 제거하며 개인 GitHub 토큰을 조회하거나 VS Code 프로세스 전체에 주입하지 않는다. 다른 폴더를 첫 인자로 전달하면 기존 GitHub 환경을 보존하고 `%LOCALAPPDATA%/VSCode-Account-B` 사용자 데이터 폴더를 사용한다. 배치 실행기의 `setlocal`은 호출자의 환경을 보존한다.

워커는 버전 관리 파일만 수정한다. 래퍼·터미널 초기화 설치본과 바탕화면 실행기 갱신은 주 대화에서 별도로 진행한다. 설치 경로는 그대로 유지하며 전역 `gh`/`ghp`, 회사 Codex 프로필과 회사 인증은 변경하지 않는다. 갱신 후 실행기를 다시 실행하고 통합 터미널을 새로 열어야 한다. 브랜치를 바꿔도 설치본 경로는 유지된다. 프로젝트 이동 시 바탕화면 실행 파일의 `WORKOUT_PROJECT_ROOT`도 갱신한다.

## 검증

`node --test scripts/test/project-github-auth.test.mjs`

Windows 테스트는 가짜 `gh`·`code`, 임시 `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`와 합성 토큰만 사용한다. 회사 gh와 개인 ghp 분리, 부모 환경 복원, CODEX_HOME 초기화, 실행기 조합과 다른 프로젝트 보존, 인자·종료 코드·stdin 전달을 검증한다. 실제 인증·설치본·VS Code는 사용하지 않는다. 다른 운영체제에서는 Windows 전용 검사를 skip한다. 실제 계정과 Git helper 확인은 설치본 갱신 후 주 대화에서 토큰 출력 없이 수행한다.

참고: [GitHub CLI 환경변수](https://cli.github.com/manual/gh_help_environment), [VS Code 터미널 프로필](https://code.visualstudio.com/docs/terminal/profiles).
