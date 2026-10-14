# 프로젝트 전용 GitHub 계정

이 프로젝트는 sirloinbh, GitHub CLI 설정 폴더는 %LOCALAPPDATA%/gh-workout-memo를 사용한다. 설정 폴더는 저장소 외부에 있으며 인증 정보는 커밋하지 않는다. Windows 키체인의 공유 활성 토큰에 의존하지 않도록 명령마다 auth token --user sirloinbh로 계정을 명시해 해당 자식 프로세스의 GH_TOKEN에만 주입한다. 앱 .env는 gh가 자동으로 읽지 않으므로 GitHub 설정은 앱 .env에 넣지 않는다.

## 사용

- VS Code의 새 프로젝트 터미널: .vscode/settings.json이 GH_CONFIG_DIR를 지정하고 상속 토큰을 제거한다. 프로젝트 PowerShell 프로필의 gh 함수가 명시적 계정 래퍼를 사용한다.
- Codex·외부 PowerShell: ./scripts/gh-project.ps1 api user --jq .login 처럼 래퍼를 사용한다. 이 래퍼는 전용 환경을 설정하고 실행 후 기존 환경을 복원한다.
- Git push/fetch: 이 저장소의 로컬 credential helper를 같은 래퍼로 설정한다. 전역 Git credential manager는 바꾸지 않는다.
- 전용 폴더에 처음 인증할 경우 래퍼로 auth login --hostname github.com --git-protocol https --web을 실행하고 sirloinbh로 인증한다.
- 상속받은 토큰 환경변수는 프로젝트 프로세스에서만 제거하고, 필요한 명령에는 sirloinbh 인증을 메모리로 주입한다. 토큰 값을 문서·로그·테스트 출력에 기록하지 않는다.

## VSCode-계정B.cmd

바탕화면 실행 파일에는 scripts/open-vscode-account-b.cmd의 로컬 경로 적용 사본을 설치한다. 저장소 브랜치를 바꿔도 실행 파일 자체는 동작한다. 인자 없이 실행하면 이 프로젝트를 열며 계정B의 CODEX_HOME과 프로젝트 전용 VS Code 사용자 데이터 폴더 %LOCALAPPDATA%/VSCode-Account-B-workout-memo 및 GH_CONFIG_DIR를 적용한다. 다른 프로젝트의 계정B 창은 기존 VSCode-Account-B 폴더를 사용하므로 VS Code 프로세스 환경도 분리된다. sirloinbh 인증도 프로세스 메모리에 전달하므로 확장 프로그램의 gh 실행에 적용된다. 다른 폴더를 첫 인자로 주면 해당 폴더를 열고 프로젝트 전용 gh 환경을 새로 적용하지 않는다.

VSCode-계정B.cmd를 다시 실행해 프로젝트 전용 창에서 작업한다. 기존 계정B 창의 설정과 로그인 UI 상태는 별도 데이터에 남으며, 새 프로젝트 창의 에디터 개인 설정은 필요 시 다시 적용한다. Codex 인증 경로 CODEX_HOME은 계정B 그대로 유지한다. VS Code 통합 터미널은 새로 열어야 한다.

현재 로컬 .git/config의 helper는 %LOCALAPPDATA%/gh-workout-memo/gh-project.ps1의 설치본을 사용한다. 브랜치를 바꿔도 Git 인증 경로는 유지된다. 재클론 시 로컬 helper를 다시 설정하고, 래퍼를 수정하면 설치본도 갱신한다. 프로젝트를 옮기면 바탕화면 실행 파일의 WORKOUT_PROJECT_ROOT를 갱신한다. gh 전용 폴더 분리는 계정 선택을 분리하며 Windows 사용자 자체를 보안 격리하는 기능은 아니다.

## 검증

node --test scripts/test/project-github-auth.test.mjs

Windows 테스트는 가짜 gh·code 프로그램과 임시 LOCALAPPDATA를 사용하므로 실제 인증·VS Code 실행·기본 설정을 변경하지 않는다. 다른 운영체제에서는 Windows 전용 검사를 skip한다. 실사용 확인은 래퍼 api user와 실제 Git credential helper를 토큰 출력 없이 수행한다.

공식 참고: https://cli.github.com/manual/gh_help_environment , https://code.visualstudio.com/docs/terminal/profiles

Git credential helper가 표시하는 username은 x-access-token일 수 있다. 토큰을 출력하지 않고 API로 확인한 실제 소유자는 sirloinbh이다.
