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
- 화면 차이: 모서리가 `Card` 기준으로 바뀝니다. 아이콘 색이 전경색으로, 카드 안쪽 여백이 16px(`xl`부터 20px)로 바뀝니다. 큰 간격과 큰 숫자는 1101px이 아니라 `xl`(1280px)부터 적용합니다.

## 변경 — fix: 1차 리뷰 보완

- 사이드바가 있는 768px에서 4열이면 카드가 약 112px로 좁아져 긴 값(`1,234,567kg`)이 옆 카드와 겹칩니다. 공통 Tailwind 열은 `minmax(0, 1fr)`이라 이전처럼 열이 늘어나지 않습니다.
- 4열 전환을 761px에서 `lg`(1024px)로 올렸습니다. 768px 태블릿은 이제 2열입니다. 값에는 `break-words`를 넣어 더 긴 값은 카드 안에서 줄을 바꿉니다.
- 자동 테스트는 추가하지 않았습니다. e2e 넘침 검사는 `scrollWidth`만 봐서 이 겹침을 잡지 못하고, 긴 값을 만드는 e2e 데이터가 없습니다. 확인은 리뷰의 정적 HTML 측정과 시각 기준선입니다.

## 테스트

- 추가: `frontend/src/components/stat-card.test.tsx`
- 수정: 통계 값을 찾는 화면 테스트 4개와 `e2e/workout-crud.spec.ts`의 선택자를 지운 클래스에서 `data-slot`으로 바꿨습니다. 검증 내용은 같습니다.
- `npm run test -w frontend -- src/components/stat-card.test.tsx src/custom-range.test.tsx src/period.test.tsx src/set-completion.test.tsx src/workout-draft.test.tsx`: 54 pass
- `npm run typecheck`, `npm run lint`: 통과
- e2e와 시각 기준선은 PR CI에서 확인합니다. 로컬 전체 `npm run check`는 메모리 부족 이력이 있어 돌리지 않았습니다.
