# #12 chore: 프로젝트 GitHub 인증을 개인 gh 설정으로 연결

- 이슈: https://github.com/sirloinbh/workout-memo/issues/12
- 브랜치: feat/12-agent-task

## 변경 및 검증

### 테스트 단계 (구현 전)

- `scripts/test/project-github-auth.test.mjs`에서 HOME/USERPROFILE을 임시 디렉터리로 분리하고 래퍼·계정 B 실행기·프로젝트 터미널의 인증 설정 경로를 `%USERPROFILE%/.config/gh-personal`로 검증한다. 설치 스크립트 위치는 `%LOCALAPPDATA%/gh-workout-memo`로 유지되는지 별도로 확인한다.
- 명시적 프로젝트 경로 선택, 다른 프로젝트의 미설정/개인 설정 보존, 명령 실패·계정 누락·부모 환경변수 미설정 시 호출자 환경 복원 테스트를 추가했다.
- 기존 명시적 sirloinbh 선택, 상속 토큰 차단, 인자·종료 코드·stdin 전달 테스트를 유지했다. 가짜 gh와 임시 환경만 사용하며 실제 사용자 인증·설치본은 접근하거나 변경하지 않았다.
- `node --test scripts/test/project-github-auth.test.mjs`: 종료 코드 1, 15개 중 10 통과 / 5 실패 / 0 건너뜀. 구현 전 예상 실패는 래퍼 경로, 기본 프로젝트 실행기 경로, 설치 래퍼를 통한 터미널 경로, VS Code 터미널 설정, 명시적 프로젝트 선택 경로다. 모두 기존 gh-workout-memo 경로와 새 gh-personal 경로의 차이로 실패했다.
- `npx --no-install prettier --write scripts/test/project-github-auth.test.mjs`: 종료 코드 0.
- `npm run check`: 종료 코드 0. 포맷·lint·타입 검사·프런트/백엔드 빌드 통과, 백엔드 테스트 4 통과(전용 테스트 DB 통합 테스트 포함, 건너뜀 0), 워커 테스트 34 통과(건너뜀 0). 현재 check에는 인증 테스트 명령이 포함되어 있지 않으므로 위 인증 테스트의 예상 실패 5개와 별개인 결과다.
- 구현 파일은 변경하지 않았다. 구현 담당자가 경로를 변경한 뒤 인증 테스트와 필수 전체 검사를 재실행해야 한다. 실제 설치본 갱신 및 최종 Git 인증 확인은 주 대화 담당 범위다.

### 구현 단계

- `scripts/gh-project.ps1`, `.vscode/settings.json`, `scripts/open-vscode-account-b.cmd`의 프로젝트 인증 경로를 `%USERPROFILE%/.config/gh-personal`로 변경했다. 래퍼는 USERPROFILE을 필수 입력으로 확인한다. 설치 스크립트 및 터미널 프로필 위치 `%LOCALAPPDATA%/gh-workout-memo`는 유지했다.
- 실행기의 다른 프로젝트 분기에서 기존 GH_CONFIG_DIR를 제거하던 코드를 삭제해 상속 환경을 보존한다. 명시적 sirloinbh 토큰 조회, 상속 토큰 차단, 호출자 환경 복원, 인자·종료 코드·stdin 전달 코드는 유지했다.
- `AGENTS.md`에 ghp 또는 프로젝트 래퍼 사용 원칙을 명시하고 `docs/project-github-auth.md`에 기존 개인 인증 재사용, 설치 위치와 인증 위치 구분, 실제 설치본 갱신 담당 범위를 기록했다. 최종 이슈 기록은 [12-personal-github-config.md](12-personal-github-config.md)에도 남겼다.
- `node --test scripts/test/project-github-auth.test.mjs`: Windows에서 종료 코드 0, 15 통과 / 0 실패 / 0 건너뜀. 이전 테스트 단계의 assertion과 테스트를 변경하지 않았다.
- `npm run check`: 종료 코드 0. 포맷·lint·타입 검사·프런트/백엔드 빌드 통과, 백엔드 4 통과(전용 테스트 DB 통합 테스트 포함, 건너뜀 0), 워커 34 통과(건너뜀 0). 인증 테스트는 별도 명령으로 검증했다.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/12 diff --check`: 종료 코드 0.
- 최종 기록 추가 후 `npx --no-install prettier --check AGENTS.md .vscode/settings.json docs/project-github-auth.md docs/changes/12-agent-task.md docs/changes/12-personal-github-config.md`: 종료 코드 0. Node fs로 두 이슈 문서의 상대 Markdown 링크 대상 존재를 확인했다(종료 코드 0). 테스트 파일 SHA-256은 테스트 단계의 `e4beb419e4129acec3ad4b9ba81b5a85c48e720276a7045af6c804e727e50fe9`와 동일하다.
- 실제 인증 파일·토큰·사용자 설치본은 접근하거나 변경하지 않았다. 원격 작업·커밋·푸시·PR은 수행하지 않았으며 독립 검토와 코디네이터의 후속 처리가 남아 있다.
