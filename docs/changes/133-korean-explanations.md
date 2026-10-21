# #133 사용자 대상 설명을 항상 한국어로 작성하는 스킬

- 이슈: [#133](https://github.com/sirloinbh/workout-memo/issues/133)
- 브랜치: `docs/133-korean-explanations`

## 목적

에이전트가 작업 보고를 영어로 한 일이 있었다(2026-10-22, #130·#127 처리 보고). 사용자는 설명을 항상 한국어로 받기를 요청했고, 이 기준을 스킬로 남기기를 원했다.

## 변경 — 2026-10-22

- 새 스킬 `skills/workout-communication/SKILL.md`
  - 한국어로 쓰는 대상: 최종 보고, 진행 안내, 질문, 오류·차단 설명, 영어 자료(하위 에이전트 리뷰, 도구 출력 요약, 조사 결과)의 번역 전달
  - 원문 유지: 명령, 경로, 식별자, 오류·로그 원문(한국어 의미를 덧붙임), 형식이 정해진 커밋·PR 제목
  - 범위 밖: 하위 에이전트 지시문 언어, 코드 주석·기존 문서 언어
- `AGENTS.md`의 "스킬과 문서" 첫 항목에 이 스킬을 연결했다. 스킬 description만으로는 매 대화에 적용된다는 보장이 없어서, 항상 읽히는 프로젝트 지침에서 가리키도록 했다.
- `npm run skills:sync`로 `.claude/skills/workout-communication/`을 생성했다.

## 검증

문서·스킬만 변경해 앱 테스트(`npm run check`의 빌드·단위·e2e)는 실행하지 않았다. 직전 main(`b3e03ad`) CI가 모두 통과한 상태다.

- skill-creator `quick_validate.py`(`PYTHONUTF8=1`, 4개 스킬): 모두 `Skill is valid!`
- `npm run test:skills` 4 pass, `npm run test:docs` 3 pass
- `prettier --check AGENTS.md skills .claude/skills docs/changes/133-korean-explanations.md`: 통과
