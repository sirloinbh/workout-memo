# #70 표준화 과정에서 검증한 반복 절차를 지침·스킬에 반영

- 이슈: [#70](https://github.com/sirloinbh/workout-memo/issues/70) (로드맵 [#3](https://github.com/sirloinbh/workout-memo/issues/3) 6단계)
- 브랜치: `docs/70-repeatable-procedures`. #68(PR #69) 위에 쌓았다.

## 목적

2~4단계(#58·#60·#62·#64·#66·#68)에서 실제로 실행하고 확인한 절차가 각 PR 기록에만 흩어져 있었다. 다음 작업자와 로컬 워커가 같은 방식으로 반복할 수 있게 지침과 스킬로 옮긴다.

## 변경 — 2026-10-20

- `skills/workout-foundation/references/procedures.md`(신규): 검증된 반복 절차
  1. npm 패키지 도입: `npm view` 확인 → 사용자 확인 → 고정 버전·`--ignore-scripts` 설치 → install 스크립트·IOC 점검 → subtree lockfile을 `--before`로 다시 생성 → 영역별 Docker 빌드
  2. 영역별 독립 빌드: 복제와 검사로 공유, 빌드 tsconfig에서 테스트 제외
  3. 화면 리팩터링: RTL 행동 테스트 먼저, 실제 Chrome 전후 픽셀 비교, 발견한 기존 결함은 별도 이슈로
  4. 연속 PR: 병합 순서 명시, 아래 브랜치 수정은 force push 대신 merge로 위 브랜치에 전달
  5. 생성 산출물과 검사 명령 표
- `skills/workout-foundation/SKILL.md`: 위 문서 링크
- `skills/workout-foundation/references/stack.md`: 추천 적용 순서 1~6에 진행 상태를 표시(PR 생성 기준). 5단계는 사용자 결정 대기다.
- `skills/workout-testing/SKILL.md`: Playwright 시나리오 갱신 기준, 화면 동일성 픽셀 비교 기준, 목업 대신 테스트 데이터를 실제 계약에 맞추는 규칙
- AGENTS.md: npm 패키지 도입 절차 링크
- `docs/daily/2026-10-20.md`(신규)와 `docs/daily/README.md` 목록, `docs/next-steps/README.md`(우선 처리·후속 기능 갱신)
- `npm run skills:sync`로 `.claude/skills/` 갱신

## 검증

- 문서 링크와 절차를 검토했다. 절차는 모두 이번 작업일에 실제로 실행한 내용이며, 근거는 각 `docs/changes/<번호>-*.md`에 있다.
- `npm run check`: 결과는 아래 표와 같다. 문서·스킬만 바꿨지만 스킬 미러 검사(`test:skills`)를 포함해 전체를 실행했다.
- skill-creator `quick_validate.py`는 실행하지 못했다. Python에 PyYAML이 없고(#58과 같은 사유), 패키지는 설치하지 않았다. SKILL.md frontmatter는 바꾸지 않았다.

| 검사                       | 결과                       |
| -------------------------- | -------------------------- |
| `npm run check`            | **EXIT=0**                 |
| 백엔드 node:test (DB 포함) | 279 pass / 0 fail / 0 skip |
| 프론트 Vitest              | 89 pass / 0 fail           |
| 스킬 미러                  | 4 pass                     |
