# #44 Codex 프로젝트 스킬을 Claude Code 스킬로 복제·동기화

- 이슈: [#44](https://github.com/sirloinbh/workout-memo/issues/44)
- 브랜치: `chore/44-claude-skills`

## 변경

- 저장소 원본 `skills/workout-foundation`(참조 `references/stack.md` 포함), `skills/workout-implementation`, `skills/workout-testing`을 Claude Code 프로젝트 스킬 위치 `.claude/skills/`에 그대로 복제했다. 스킬 본문에는 저장소 상대 링크가 없어 위치가 바뀌어도 링크가 깨지지 않는다.
- 원본은 계속 `skills/`다. Codex 계정B 설치본(`%LOCALAPPDATA%/Codex-Account-B/skills`)은 `workout-foundation/references/stack.md`가 저장소보다 오래된 상태였으나, 이번 작업 범위가 아니므로 변경하지 않았다.
- `scripts/claude-skills.mjs`: `sync`는 `.claude/skills/`를 원본과 동일하게 다시 만든다(원본에서 삭제된 파일도 제거). 인자 없이 실행하면 누락·변경·초과 파일을 출력하고 exit 1. 줄바꿈(CRLF/LF) 차이만 있는 경우는 같은 내용으로 본다. 심볼릭 링크가 있으면 중단한다.
- `package.json`: `skills:sync`, `skills:check`, `test:skills` 추가. `check`에 `test:skills`를 연결해 로컬 전체 검사와 CI에서 복제본 불일치를 실패로 처리한다.
- AGENTS.md·README.md에 복제본 위치와 동기화 절차를 적었다.
- `.gitignore`·`.prettierignore`에 Claude Code 플러그인/도구가 만드는 로컬 산출물 `.bkit/`, `.playwright-mcp/`를 추가했다. 처음 전체 검사에서 `.bkit/*.json`이 Prettier 검사 대상에 잡혀 실패했다.

## 검증

- `node --test scripts/test/claude-skills.test.mjs`: **4 pass / 0 fail / 0 skip** (동기화, 변경·초과 감지와 정리, 줄바꿈 무시, 실제 저장소 일치).
- skill-creator `quick_validate.py`(PYTHONUTF8=1)를 `.claude/skills/` 세 스킬에 실행: 모두 `Skill is valid!`. UTF-8 모드가 아니면 Windows cp949 기본 인코딩으로 읽기 오류가 난다.
- 호스트 Node 24.21.0 / npm 11.19.0, 전용 테스트 DB로 `npm run check`: **exit 0**. 앱·DB 118 pass, 워커 86 pass, 스킬 4 pass, 모두 fail/skip 0, frontend/backend 빌드 통과. (ignore 추가 후 재실행 결과는 PR에 기록한다.)

## main 병합 충돌 해소 — 2026-10-19

- PR #42(#26) 병합으로 main의 `test:agents` 목록이 늘어나 `package.json`이 충돌했다. main의 전체 `test:agents` 목록을 유지하고 이 작업의 `test:skills`·`skills:sync`·`skills:check`와 `check` 연결을 함께 남겼다.
- 병합 결과로 호스트 `npm run check`: **exit 0** — 앱·DB 118 pass, 워커 162 pass, 스킬 4 pass, 모두 fail/skip 0, 빌드 통과.
