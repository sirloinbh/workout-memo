# #101 통계 카드를 공통 Card로 교체 (2단계)

- 이슈: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- 브랜치: `feat/101-stat-cards`

## 목적

#101을 요소 하나씩 나눠 옮기는 두 번째 PR입니다. 대시보드와 운동 일지의 통계 카드를 공통 `Card` 기준으로 바꾸고 해당 `style.css` 규칙을 지웁니다. 이 PR은 #101을 닫지 않습니다.

## 변경 — feat: 통계 카드 교체

- `frontend/src/components/stat-card.tsx`: `Card` 위에 만든 `StatCard`를 추가하고 `app.tsx`의 `Stat`을 대체했습니다.
- `frontend/src/app.tsx`: 카드 묶음의 배치를 유틸리티 클래스로 옮겼습니다.
- `frontend/src/style.css`: `.stats`, `.stat`, `.stat-top`, `.stat-value`, `.stat-foot` 규칙과 반응형 규칙, 대비 규칙의 `.stat-top span`을 지웠습니다.
- 글자 크기를 공통 토큰(`text-caption`, `text-meta`, `text-2xl`, `text-3xl`)으로 바꿔 라벨과 설명이 조금 커지고 큰 숫자는 좁은 화면에서 조금 작아집니다.
- 화면 차이: 모서리가 `Card` 기준으로 바뀝니다. 4열 전환 폭이 761px에서 `md`(768px)로 바뀌어 761~767px은 2열입니다. 큰 간격과 큰 숫자는 1101px이 아니라 `xl`(1280px)부터 적용합니다.

## 테스트

- 추가: `frontend/src/components/stat-card.test.tsx`
- 수정: 통계 값을 찾는 화면 테스트 4개와 `e2e/workout-crud.spec.ts`의 선택자를 지운 클래스에서 `data-slot`으로 바꿨습니다. 검증 내용은 같습니다.
- `npm run test -w frontend -- src/components/stat-card.test.tsx src/custom-range.test.tsx src/period.test.tsx src/set-completion.test.tsx src/workout-draft.test.tsx`: 54 pass
- `npm run typecheck`, `npm run lint`: 통과
- e2e와 시각 기준선은 PR CI에서 확인합니다. 로컬 전체 `npm run check`는 메모리 부족 이력이 있어 돌리지 않았습니다.
