# #14 회사 gh와 개인 ghp·Codex 분리

- 이슈: https://github.com/sirloinbh/workout-memo/issues/14
- 상세 작업·명령·결과: [14-agent-task.md](14-agent-task.md)

## 변경

`project-terminal.ps1`은 회사 `gh`를 유지하고 개인 `ghp`만 정의한다. 래퍼는 `%USERPROFILE%/.config/gh-personal`에서 `sirloinbh`를 명시하며 상속 토큰 차단과 부모 환경 복원, 인자·종료 코드·stdin 전달을 유지한다. 스크립트 설치 경로 `%LOCALAPPDATA%/gh-workout-memo`는 그대로다.

VS Code 터미널 설정과 초기화, 프로젝트 실행기는 회사 `GH_CONFIG_DIR=%APPDATA%/GitHub CLI`와 개인 `CODEX_HOME=%LOCALAPPDATA%/Codex-Account-B`를 선택하고 상속 토큰을 제거한다. 실행기의 개인 GitHub 토큰 조회·프로세스 전체 주입과 Codex 설정 파일 자동 생성을 제거했다. 다른 프로젝트의 기존 GitHub 환경은 보존한다.

이 변경은 #12 및 PR #13의 gh 재정의와 프로세스 전체 개인 GitHub 환경 주입을 대체한다. 코디네이터가 PR 설명에도 이 관계를 명시해야 한다. 기존 PR 병합·종료는 수행하지 않는다.

## 검증 및 후속 작업

`node --test scripts/test/project-github-auth.test.mjs`는 14 pass / 0 fail / 0 skip, `npm run check`는 종료 코드 0으로 통과했다. 최초 구현 검증에서는 제공된 전용 DB 통합 검사까지 통과했다. 최신 CI 보완 재검증에서는 전용 DB 환경이 없어 backend 3 pass / 1 skip이며 워커 34개 테스트 및 빌드가 통과했다. 최신 실행을 DB 검증 완료로 보고하지 않는다. 상세 명령은 작업 기록에 남겼다. 테스트 단계가 준비한 assertion을 유지했다.

실제 설치본·바탕화면 실행기 갱신과 계정 확인은 주 대화에서 진행하며 워커는 로그인·토큰 저장소·전역 명령·회사 Codex 홈을 변경하지 않는다. ChatGPT 앱은 별도 계정 선택이 필요하고 실행 중인 회사 계정 대화는 자동 전환되지 않는다.

## CI startup allowance

The first Windows CI test appears to have exceeded the previous 20-second subprocess timeout. The timeout is now 60 seconds, with existing behavior assertions preserved and direct spawn-error diagnostics added. All 14 local authentication tests and the full check passed again. The hosted delay was not reproduced locally; remote CI must still be rerun. See the linked work notes for evidence and commands.

## PR #15 충돌 해결 (2026-10-15)

최신 `origin/main`의 #12 변경을 기존 `feat/14-agent-task` 브랜치에 통합했다. `.vscode/settings.json`, `scripts/open-vscode-account-b.cmd`, `docs/project-github-auth.md`, `scripts/test/project-github-auth.test.mjs`의 충돌은 #14의 회사 `gh`·개인 `ghp` 분리와 개인 Codex 프로필 선택을 유지하도록 해결했다. main의 인증 안내와 #12 작업 기록도 보존했다.

인증 테스트는 main의 임시 HOME/USERPROFILE 격리, 부모 인증 환경변수가 없는 경우의 복원, 다른 프로젝트의 GH_CONFIG_DIR 미설정/개인 설정 보존 검사를 함께 유지했다. 기존 PR의 실패 경로·인자 전달·회사/개인 계정 분리 검사를 유지하여 총 17개를 실행했다.

- `node --test scripts/test/project-github-auth.test.mjs`: 17 pass, 0 fail, 0 skip.
- `npm run check`: 통과. 포맷·lint·타입 검사·빌드 통과, backend 3 pass / 1 skip, 워커 34 pass / 0 fail.
- DB 통합 검사 1개는 `TEST_DATABASE_URL` 미설정으로 skip했으며 로컬 DB 검증 완료로 계산하지 않는다.
- 충돌 표시 잔존 검사 및 `git diff --check`: 통과.
- 앱 기능이나 UI 변경은 없으며 PR 병합은 사용자가 수행한다.
