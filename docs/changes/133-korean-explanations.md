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

문서·스킬만 변경해 앱 테스트(`npm run check`의 빌드·단위·e2e)는 실행하지 않았다.

- skill-creator `quick_validate.py`(`PYTHONUTF8=1`, 4개 스킬): 모두 `Skill is valid!`
- `npm run test:skills` 4 pass, `npm run test:docs` 3 pass
- `prettier --check AGENTS.md skills .claude/skills docs/changes/133-korean-explanations.md`: 통과

## 자동 리뷰 1차 — 2026-10-22

별도 읽기 전용 리뷰 에이전트가 PR #134 전체 diff를 검토했다. 완료 기준은 모두 충족했고 major 문제는 없었다. 복제본 일치(`.claude/skills matches skills/.`)도 확인했다.

1. **minor**: 커밋·PR 제목이 "원문 그대로 두는 것"에 들어 있어 영어로 쓰라는 뜻으로 읽힐 수 있었다. → "저장소 산출물" 절로 옮기고, 형식은 workout-implementation을 따르되 설명부는 한국어로 쓴다고 명시했다.
2. **minor**: 이슈·PR 본문, 리뷰 코멘트, 새 docs의 언어가 정해지지 않았다. → 같은 절에 "저장소 관례대로 한국어"를 추가했다.
3. **nit**: docs의 "직전 main(`b3e03ad`) CI 통과" 문장은 이 작업에서 확인한 근거가 없었다. → 삭제했다.
4. **nit**: AGENTS.md 요약에 원문 유지 예외가 빠져 있었다. → "명령·경로·식별자·오류 원문은 그대로 둔다"를 덧붙였다.

### 1차 보완 검증

- `npm run skills:sync` 후 `npm run test:skills` 4 pass, `npm run test:docs` 3 pass
- `quick_validate.py skills/workout-communication`(`PYTHONUTF8=1`): `Skill is valid!`
- `prettier --check`(변경 파일): 통과
