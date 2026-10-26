# #149 에이전트 워커를 중앙 실행기로 바꾸고 리포 안 사본 지우기

- 이슈: [#149](https://github.com/sirloinbh/workout-memo/issues/149) (중앙 추적: sirloinbh/project-standards#167)
- 브랜치: `chore/149-central-agent-worker`

## 변경

- 삭제
  - `scripts/agents.ps1`, `scripts/agents/*.mjs` 9개
  - `scripts/test/agent-*.test.mjs` 10개
  - `.github/workflows/local-agent-workflow.yml`
  - `package.json`의 `test:agents`와 `check` 안의 호출
- 추가: `.agents.json`
  - DB 사전검사 테이블 5개와 컬럼. 지운 `scripts/agents/optimization.mjs`의 `requiredColumns`와 같은 값이다.
  - `autoMerge`는 적지 않는다. 기본값 `true`다(#128, 중앙 #184 표).
- 문서
  - `docs/local-agent-workflow.md`: 중앙 `docs/tools.md` 링크와 이 리포 고유 설정(`.agents.json`, 테스트 DB, `.local/agent-workflow/`)만 남겼다.
  - `AGENTS.project.md`, `README.md`, `docs/development-baseline.md`, `docs/ai-agent-project-setup.md`: 실행 경로를 중앙 실행기(`agents.ps1 -Root .`)로, 워커 테스트를 중앙 리포로 고쳤다.
  - `docs/next-steps/blocked-issues-recovery.md`, `docs/changes/`의 과거 기록은 당시 상태 기록이라 그대로 둔다.

## 확인

- 등록 전 큐 상태(중앙 `cli.mjs --root <workout-memo> status`): queued·running 0건. done 9, blocked 4(#26, #27, #34, #43, 예전 작업), cancelled 1. 기록은 `.local/agent-workflow/`에 그대로 남는다.
- `node tools/agents/cli.mjs --root <이 worktree> doctor`(중앙 리포 main): 통과
  - `Repository sirloinbh/workout-memo: npm run check; database probe configured; autoMerge true`
- `node --test scripts/test/docs-commands.test.mjs scripts/test/claude-skills.test.mjs`: 7개 통과
- 바꾼 파일 Prettier 검사(공유 설정 `@sirloinbh/prettier-config`): 통과
- 전체 `npm run check`는 이 worktree에 의존성을 설치하지 않아 로컬에서 돌리지 않았다. CI `verify`로 확인한다.
- 설치본 실행기(`%LOCALAPPDATA%\sirloinbh-tools\agents.ps1`)는 이 PC에 아직 없어(중앙 #183) 중앙 리포의 `tools/agents/cli.mjs`로 확인했다.
