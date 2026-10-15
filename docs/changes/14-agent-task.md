# #14 chore: ghp 명령 분리와 프로젝트 개인 Codex 프로필 연결

- 이슈: https://github.com/sirloinbh/workout-memo/issues/14
- 브랜치: feat/14-agent-task

## 변경 및 검증

작업 에이전트가 실제 변경·검증 결과를 기록한다.

## 테스트 단계 (구현 전)

- 기준 SHA: `6835a02ea9dd35dd84067a08d84aad27d838a4ea`.
- `AGENTS.md`, `skills/workout-implementation/SKILL.md`, `skills/workout-testing/SKILL.md`를 읽고 기존 이슈와 브랜치를 재사용했다. 테스트와 이 기록만 수정했으며 구현, 설치본, 로그인, 커밋 및 원격 작업은 수행하지 않았다.
- `scripts/test/project-github-auth.test.mjs`의 기존 기대값을 #14의 회사 `gh` / 개인 `ghp` 분리 기준으로 변경하고 총 14개 테스트로 보강했다.
- 모든 인증 검사는 임시 `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, 가짜 `gh.cmd` / `code.cmd`와 합성 토큰만 사용한다. 실제 인증 저장소나 설치본은 사용하지 않는다. 가짜 gh는 계정 조회 시 `sirloinbh` 지정과 상속 토큰 제거를 확인한다.
- 검증 범위: 개인 `gh-personal` 설정, 프로필 없는 터미널에서 회사 gh와 개인 ghp 동시 사용 및 호출 후 환경 복원, 초기화 CODEX_HOME, VS Code 설정, 실행기 회사 GitHub/개인 Codex 조합, 개인 로그인 없이 실행 및 code 종료 코드, 다른 프로젝트 환경 보존(기존 프로젝트 설정 경로 및 공백 경로 포함), 래퍼 인자/종료 코드/stdin 전달, 개인 계정 부재 시 거부, 성공/명령 실패/계정 조회 실패 후 부모 환경 복원.

### 실제 명령 및 결과

- `npx prettier --write scripts/test/project-github-auth.test.mjs`: 성공.
- `node --test scripts/test/project-github-auth.test.mjs`: 종료 코드 1, 14개 중 7 pass / 7 fail / 0 skip. 아래 실패는 모두 구현 전의 예상된 요구사항 차이다.
  - 개인 래퍼 설정이 아직 LOCALAPPDATA의 `gh-workout-memo`여서 USERPROFILE의 `.config/gh-personal` 기대값과 다르다.
  - 프로젝트 실행기가 아직 개인 GitHub 설정과 토큰을 code 프로세스에 주입한다.
  - 터미널 초기화가 아직 gh 함수를 정의하고 ghp를 제공하지 않는다.
  - VS Code 터미널 설정이 아직 개인 GitHub 경로를 사용한다.
  - 개인 계정 조회 실패 시 실행기가 code를 호출하지 않아 code 종료 코드 17 대신 1을 반환한다.
  - 다른 프로젝트를 열 때 기존 `gh-workout-memo` 환경값을 지워 보존 기준과 다르다.
  - ghp 인자/종료 코드/환경 복원 검사는 ghp 미정의로 실패한다.
- 기존 래퍼의 종료 코드, stdin 전달, 정상 및 실패 후 환경 복원, 개인 계정 부재 거부와 일반 다른 프로젝트 환경 보존은 통과했다.
- `npm run check`: 종료 코드 0. 포맷, lint, frontend/backend 타입 검사, backend 테스트 4 pass(전용 테스트 DB 통합 검사 포함, skip 0), 로컬 워커 테스트 34 pass, frontend/backend 빌드가 통과했다. 현재 이 명령에는 인증 테스트 파일이 포함되어 있지 않으므로 별도로 실행한 위 7개 실패를 전체 검사 성공으로 대체하지 않는다.

### 구현 단계 인계

- 실패한 기대값을 유지하고 구현 후 인증 테스트 및 전체 검사를 다시 실행해야 한다.
- 문서의 CODEX_HOME 설명, AGENTS.md의 인증 원칙, #12/#13을 대체하는 변경 기록은 구현 단계에서 작성·검토해야 한다. 이번 단계는 테스트 파일과 이 작업 기록만 변경했다.

## 구현 단계

- `workout-implementation`, `workout-testing`을 적용하고 기존 이슈·브랜치·테스트를 재사용했다. 테스트 파일 SHA-256은 인계값 `be0863d5fc92808db1f2d6440aea9bbac0f59275d2f27f483c2a4fcb1bbe0094`와 일치하며 assertion·skip을 변경하지 않았다. 이전 검토 지적은 전달되지 않았다.
- `project-terminal.ps1`은 회사 `gh`를 재정의하지 않고 개인 `ghp`만 제공한다. 회사 설정 경로, 상속 토큰 제거, 개인 CODEX_HOME을 초기화하여 이전 VS Code 설정에서도 설치본 적용 후 같은 환경을 사용한다.
- `gh-project.ps1`은 USERPROFILE의 `.config/gh-personal`을 사용한다. 기존 sirloinbh 명시 조회·상속 토큰 차단·부모 환경 복원·인자/종료 코드/stdin 전달 로직을 유지했다.
- VS Code 설정과 실행기는 회사 GitHub/개인 Codex 조합을 사용한다. 실행기의 개인 토큰 조회·프로세스 전체 주입, 다른 프로젝트의 기존 GitHub 설정 삭제, Codex 설정 파일 자동 생성을 제거했다.
- AGENTS.md와 인증 문서에 ghp 우선 및 비대화형 래퍼 사용 원칙과 기존 개인 Codex 홈 선택을 기록했다. `openai-docs` 스킬을 적용하여 공식 구성 문서의 CODEX_HOME 설명을 조회·열람하고 인증 문서에 출처를 연결했다. 실행 중인 회사 계정 대화의 자동 전환을 전제하지 않으며 ChatGPT 앱은 별도 계정 선택이 필요함을 명시했다.
- `docs/changes/14-personal-tools.md`에 #12 및 PR #13을 대체하는 변경과 후속 설치 작업을 기록했다.

### 실제 명령 및 결과

- `node --test scripts/test/project-github-auth.test.mjs`: 종료 코드 0, 14 pass / 0 fail / 0 skip. 임시 환경과 가짜 gh/code만 사용하여 회사 gh·개인 ghp 분리 및 실패 후 복원 등 인계된 전체 동작 검증이 통과했다.
- `npx prettier --write AGENTS.md .vscode/settings.json docs/project-github-auth.md docs/changes/14-personal-tools.md`: 종료 코드 0, 모두 포맷 변경 없이 통과했다.
- `npm run check`: 종료 코드 0. 포맷, lint, frontend/backend 타입 검사, backend 4 pass / 0 skip(제공된 전용 테스트 DB 통합 검사 포함), 로컬 워커 34 pass / 0 skip, frontend/backend 빌드가 통과했다. 인증 테스트는 이 명령에 포함되지 않아 위 명령으로 별도 검증했다. DB 연결값은 조회·출력하지 않았다.
- 읽기 전용 Git diff와 테스트 파일 해시를 확인했다. Git은 전역 ignore 경로 접근 경고를 표시했으나 worktree 상태·diff 검사는 완료했다. 전역 설정은 변경하지 않았다.
- 결과 기록 후 `npx prettier --check docs/changes/14-agent-task.md docs/changes/14-personal-tools.md` 및 `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/14 diff --check`: 모두 종료 코드 0.

### 인계 및 제한

- 변경은 이 worktree에 미커밋 상태로 남긴다. 이슈 생성, 브랜치 전환, 커밋·푸시·PR·승인·병합이나 추가 에이전트 실행은 수행하지 않았다.
- 실제 인증 저장소·설치본·바탕화면 실행기는 접근하거나 변경하지 않았다. 설치본과 실행기 갱신, 실제 계정 확인은 주 대화에서 진행해야 한다. 코디네이터가 독립 검토와 PR 설명에 #12/#13 대체 관계를 반영한다.

## CI failure repair

- The supplied windows-auth log shows the first test finishing after 20,362ms with status null; the other 13 tests passed. This matches the original 20,000ms subprocess timeout and suggests initial Windows process startup exceeded the allowance. The original log did not include the spawn error, so the exact cause of the delay remains unconfirmed.
- All subprocesses now use a shared, bounded 60,000ms timeout. All existing assertions, skip conditions and 14 scenarios remain intact; no retries were added.
- Added assert.ifError(r.error) before every subprocess status assertion to expose errors such as ETIMEDOUT directly. Authentication rejection must also be a real command result rather than a spawn error. Product scripts and installed copies are unchanged.

### Actual commands and results

- Before repair: `node --test scripts/test/project-github-auth.test.mjs`: exit 0, 14 pass / 0 fail / 0 skip, about 5.2 seconds. The CI timeout did not reproduce locally.
- After repair: `node --test scripts/test/project-github-auth.test.mjs`: exit 0, 14 pass / 0 fail / 0 skip, about 6.2 seconds, using temporary environments and fake gh/code only.
- `npm run check`: exit 0. Formatting, lint, type checks, backend 4 pass / 0 skip (including the provided dedicated test DB integration test), worker 34 pass / 0 skip, and frontend/backend builds passed. Authentication tests were run separately.
- `npx prettier --check scripts/test/project-github-auth.test.mjs docs/changes/14-agent-task.md docs/changes/14-personal-tools.md`: exit 0.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/14 diff --check`: exit 0.
- Changes remain uncommitted. No remote operations, installed-copy updates or additional agents were used. The coordinator must review and deliver the changes, then rerun Windows CI; remote CI success has not yet been verified.

## 테스트 단계 재확인 (CI 실패 후)

- 시작 시 기존 미커밋 변경으로 테스트의 60초 제한 시간, subprocess 오류 진단 및 위 CI 수정 기록이 이미 있었다. 해당 변경과 기존 14개 동작 검증을 보존했으며 이번 단계에서 구현 파일을 수정하지 않았다.
- 제공된 CI 로그의 첫 검사 실패는 20,362ms 후 `status=null`로, 기존 20,000ms 제한 시간 초과와 부합한다. 원래 로그에는 subprocess 오류가 없어 지연 원인은 확정하지 않았으며 로컬에서는 재현되지 않았다. 요구사항에 대한 구현 전 7개 예상 실패 기록은 위 최초 테스트 단계에 보존했다.
- `node --test scripts/test/project-github-auth.test.mjs`: 종료 코드 0, 14 pass / 0 fail / 0 skip, 약 5.5초. 임시 환경과 가짜 gh/code만 사용했다.
- `npm run check`: 종료 코드 0. 포맷, lint, 타입 검사, backend 3 pass / 1 skip, 워커 34 pass / 0 skip, frontend/backend 빌드 통과. 이번 실행에는 전용 `TEST_DATABASE_URL`이 제공되지 않아 DB 통합 검사는 건너뛰었으며 DB 검증 완료로 보고하지 않는다. 인증 테스트는 별도 명령으로 검증했다.
- 원격 CI 재실행과 성공 확인은 코디네이터 후속 작업이다. 이 단계에서는 커밋·원격 작업·설치본 변경·추가 에이전트 실행을 수행하지 않았다.
- `npx prettier --check scripts/test/project-github-auth.test.mjs docs/changes/14-agent-task.md docs/changes/14-personal-tools.md` 및 `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/14 diff --check`: 모두 종료 코드 0.

## 구현 단계 재확인 (CI 실패 후)

- 기존 미커밋 CI 보완을 검토하고 유지했다. 모든 subprocess에 60초 제한 시간과 `assert.ifError(r.error)`가 적용되어 있으며 기존 동작 assertion과 14개 시나리오는 그대로다. 추가 제품 코드 변경은 필요하지 않았다. 이전 독립 검토에서 수정 요청은 없었다.
- 회사 gh / 개인 ghp 분리, 래퍼의 개인 설정 및 부모 환경 복원, 실행기와 VS Code 설정을 다시 확인했다. 설치본이나 실제 인증 정보는 접근하지 않았다.
- `node --test scripts/test/project-github-auth.test.mjs`: 종료 코드 0, 14 pass / 0 fail / 0 skip, 약 5.5초. 임시 환경과 가짜 gh/code만 사용했으며 원격의 20초 지연은 로컬에서 재현되지 않았다.
- `npm run check`: 종료 코드 0. 포맷, lint, 타입 검사, backend 3 pass / 1 skip, 워커 34 pass / 0 skip, frontend/backend 빌드 통과. 전용 `TEST_DATABASE_URL`이 제공되지 않아 DB 통합 검사는 건너뛰었다. 이번 변경은 인증 테스트 실행 제한 시간과 진단 보완으로 DB 검증을 요구하지 않는다.
- 변경은 미커밋 상태로 남겼다. 커밋·푸시·PR·승인·병합 및 추가 에이전트 실행은 수행하지 않았다. 코디네이터의 독립 검토와 Windows CI 재실행이 남아 있으며 원격 CI 통과로 보고하지 않는다.
- 기록 갱신 후 `npx prettier --check scripts/test/project-github-auth.test.mjs docs/changes/14-agent-task.md docs/changes/14-personal-tools.md`와 `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/14 diff --check`: 모두 종료 코드 0.
