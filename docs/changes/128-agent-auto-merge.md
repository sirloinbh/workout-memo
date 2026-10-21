# #128 에이전트 PR 자동 병합과 연속 PR 충돌 해결

- 이슈: [#128](https://github.com/sirloinbh/workout-memo/issues/128)
- 브랜치: `chore/128-agent-auto-merge`

## 목적

사용자가 PR 병합 정책을 바꿨다(2026-10-21). 필수 CI가 통과하면 주 에이전트와 로컬 워커가 사용자 확인 없이 병합한다. 연속 PR은 순서대로 병합하며, 앞 PR 병합 뒤 생기는 충돌을 해결하고 CI를 다시 통과시켜 병합한다. main 병합은 곧 운영 배포다(#75).

## 변경 — 2026-10-21

- 정책 문서: `AGENTS.md`, `README.md`, `docs/ai-agent-project-setup.md`, `docs/development-baseline.md`, `docs/next-steps/README.md`, `docs/next-steps/blocked-issues-recovery.md`, `docs/local-agent-workflow.md`의 "사용자만 병합" 문장을 CI 통과 후 병합으로 바꿨다. 과거 작업 기록(`docs/changes`, `docs/daily`)은 그대로 두었다.
- 스킬: `workout-implementation` 5단계를 "CI 통과 후 병합"과 "연속 PR 병합"으로 바꾸고 description도 갱신했다. `workout-testing`, `workout-foundation`(SKILL·stack·procedures)의 병합 문장을 맞췄다. `npm run skills:sync`로 `.claude/skills/`를 갱신했다.
- 계속 금지: 실패·진행 중 검사 상태 병합, `--admin` 등 보호 규칙 우회, 자기 PR 승인, main 직접 푸시, force push.
- 워커 `ci` 단계(`scripts/agents/cli.mjs`)
  - CI 통과 후 `mergeable`·`mergeStateStatus`를 조회한다. `MERGEABLE`이면 `pr merge --merge --match-head-commit <job.commit>`으로 병합하고 job을 완료한다. 판정 전(`UNKNOWN`)이면 기다린다.
  - `BEHIND`·`CONFLICTING`이면 worktree에서 `origin/main`을 merge해 push하고, 새 커밋으로 재검증·CI를 기다린다.
  - 자동 merge가 충돌하면 `merge --abort` 후 `merge-conflict`로 blocked 처리한다. 주 에이전트가 worktree에서 merge 커밋으로 해결하고 `retry`하면, `delivery`가 그 커밋이 이전 커밋의 후손인지 확인한 뒤 게시 대상으로 채택한다.
  - PR 본문 문구를 "CI 통과 후 워커가 병합합니다"로 바꿨다.
- 테스트: `scripts/test/agent-publication-resume.test.mjs`에 병합 경계 5건을 추가했다.
  - 검증한 head로 병합
  - mergeability 미정 시 대기
  - main보다 뒤처지면 merge·push 후 대기
  - 충돌 시 abort와 blocked
  - 충돌 해결 커밋 채택

## 검증

로컬(Windows, Node 24.21.0). 단계별로 실행했다.

- `node --test scripts/test/agent-publication-resume.test.mjs`: 11 pass, 0 fail(신규 5건 포함)
- `prettier --check`(이 PR 변경 파일), `lint`, `contract:check`, `typecheck`, `test:skills`(4 pass), `test:docs`(3 pass), `build`: 통과
- `npm test`: 백엔드 241건 중 206 pass, 35 skip(`TEST_DATABASE_URL` 미설정으로 DB 통합 테스트 건너뜀), 0 fail. 화면 121건 중 120 pass, 1 fail.
  - 실패한 1건은 `routines.test.tsx`의 5초 시간 초과다. 같은 파일만 단독으로 실행하면 8/8 통과했다.
  - 이 PR은 `frontend/`를 바꾸지 않았다. 병렬 작업으로 머신 부하가 높았던 때의 타이밍 문제로 본다.
- `test:agents`: 167건 중 165 pass, 2 fail. 실패는 `agent-runtime.test.mjs` #24의 PowerShell 경계 2건이다.
  - 로컬 실행 정책(`UnauthorizedAccess`)이 `.ps1` 실행을 막았다.
  - `origin/main` worktree에서도 같은 2건이 똑같이 실패해 이 변경과 무관함을 확인했다.
- 전체 `npm run check`는 로컬 미커밋 사용자 변경(`scripts/test/project-github-auth.test.mjs`)의 서식 경고 때문에 `format:check`에서 멈춰서 단계별로 실행했다. 그 파일은 이 PR에 포함하지 않았다.
- DB 통합 테스트·전체 검사는 CI `verify` 결과로 확인한다.

## 제한·후속

- 실제 GitHub 병합 동작은 이 PR이 병합된 뒤 다음 워커 job에서 처음 확인된다. 테스트는 가짜 GitHub 응답으로 경계만 검증했다.
- 같은 정책을 다른 개인 프로젝트에도 각 저장소의 PR로 반영했다.
