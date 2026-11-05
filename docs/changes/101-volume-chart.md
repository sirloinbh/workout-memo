# #101 대시보드 그래프 영역을 공통 Card로 교체 (7단계)

- 이슈: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- 브랜치: `feat/101-volume-chart`

## 목적

#101을 요소 하나씩 나눠 옮기는 일곱 번째 PR입니다. 대시보드의 그래프 영역(트레이닝 볼륨 카드와 옆의 안내 카드)을 공통 `Card`와 유틸리티 클래스로 바꾸고 해당 `style.css` 규칙을 지웁니다. 남은 범위는 운동 일지의 루틴 목표 카드이며, 이 PR은 #101을 닫지 않습니다.

## 변경 — feat: 그래프 영역 교체

- `frontend/src/app.tsx`
  - 트레이닝 볼륨 카드: `Card`, `CardHeader`, `CardTitle`(h2), `CardDescription`, `CardAction`(범례)으로 바꿨습니다.
  - 안내 카드(THE NEXT CHAPTER): `Card` 위에 `bg-muted`로 만들고, "나의 목표 확인하기"는 공통 `Button`(`link`)입니다. 장식 원은 `aria-hidden`입니다.
  - `Chart`: 막대 높이를 고정 145px 기준 픽셀에서 그래프 높이 대비 %로 바꿨습니다. 막대 색은 `bg-foreground/20`, 마지막 구간은 `bg-primary`, 모서리는 `rounded-t-sm`입니다. 축과 날짜 글자는 `text-meta`(12px)입니다.
  - 막대가 7개를 넘으면(12주, 8일 이상 직접 지정) 날짜 라벨을 걸러 보여 줍니다. 1주(요일 7개), 4주(4개), 1달(5개)은 모두 보여 줍니다. 기준은 아래 1차 리뷰 보완에서 바꿨습니다.
  - 카드 배치: 1열 → `md` 230px → `xl` 280px → `2xl` 340px 오른쪽 열입니다. 이전에는 761px·1101px·1500px에서 바뀌었습니다.
- `frontend/src/style.css`: `.overview-grid`, `.legend`, `.chart`, `.chart-y`, `.plot`, `.grid-lines`, `.bars`, `.bar-column`, `.bar`, `.chart-empty`, `.focus-card`, `.focus-top`, `.rings`와 반응형 규칙, 대비 규칙의 `.focus-card`를 지웠습니다. 비게 된 `@media (min-width: 1500px)`도 지웠습니다. `.card`, `.section-title`은 다른 화면이 써서 남겼습니다.
- 화면 차이: 제목 15→16px, 설명 10→14px, 범례·축·날짜 8~9px→12px로 커집니다. 그래프 높이는 215px→224px(`2xl` 256px)입니다. 모바일에서 안내 카드 설명이 오른쪽 위에 겹쳐 놓이지 않고 제목 아래로 갑니다. 대비 규칙에서 `.focus-card`를 지워 안내 카드의 "THE NEXT CHAPTER"와 설명이 `muted-foreground` 색으로 조금 흐려집니다. 다크 `muted` 바탕 위 대비는 약 5.8:1로 AA를 넘습니다.

## 변경 — fix: 1차 리뷰 보완

- 막대 열 넘침(must-fix): 열이 `flex-1`인데 `min-w-0`이 없어 열 최소 너비가 날짜 라벨 폭(약 30px)이 됐습니다. 사이드바와 오른쪽 열이 있는 768px에서 12주를 고르면 그래프 폭 약 130px에 300px 넘게 필요해 막대가 안내 카드를 덮습니다. 360px과 31일 직접 지정도 같습니다.
  - 열에 `min-w-0`을 넣고, 라벨은 열 가운데에 `absolute`로 놓아 열 너비 계산에서 뺐습니다. 막대 최소 너비는 6px에서 2px로 줄였습니다.
  - 라벨 거르기와 막대 간격을 화면 폭(`xl`)이 아니라 그래프 자체 폭(container query)으로 정합니다. 사이드바 때문에 두 폭이 따로 움직입니다. 라벨은 4개에 하나는 항상, 2개에 하나는 그래프 200px부터, 모두는 400px부터 보입니다. 간격은 1px → `@sm` 4px → `@lg` 10px입니다.
- 기록 수정: 라벨을 거르는 구간을 "4주·1달·12주·직접 지정"으로 잘못 적었습니다. 4주는 4개, 1달은 5개라 거르지 않습니다.
- 안내 카드 제목: 오른쪽 열이 230px인 `md`~`xl` 사이에서 24px 제목이 줄을 더 바꾸지 않게 `md:text-xl xl:text-2xl`로 했습니다(이전 22px).
- 테스트가 마크업 구조(`parentElement.nextElementSibling`)에 묶여 있던 것을 라벨의 `data-slot="volume-label"`로 찾게 바꿨습니다.
- 반영하지 않음: 768px에서 12주를 고른 시각 기준선 추가. 고정 데이터 e2e의 범위를 넓히는 일이라 이 PR에 넣지 않았습니다. 넘침은 위 구조 변경과 화면 테스트로 막습니다.

## 테스트

- 추가: `frontend/src/period.test.tsx`
  - 막대 높이가 가장 큰 구간 대비 %이고, 마지막 구간 하나만 강조되며, 기록이 있으면 빈 안내가 없는지 확인합니다.
  - 1주는 라벨 7개를 모두 보이고, 12주는 라벨 12개가 항상·200px·400px 단계로 나뉘는지 확인합니다(1차 리뷰 보완에서 바꿈).
- 추가: `frontend/src/custom-range.test.tsx` — 31일 직접 지정에서 3일마다 라벨이 붙고 같은 단계로 나뉘는지 확인합니다(1차 리뷰 보완).
- 첫 커밋: `npm run test -w frontend -- src/period.test.tsx src/custom-range.test.tsx` 29 pass
- 1차 보완 후: 같은 명령 30 pass, `npm run test -w frontend` 207 pass·4 skip, `npm run build -w frontend`로 container query 클래스(`@min-[200px]`, `@min-[400px]`, `@sm`, `@lg`)가 CSS에 생성됨을 확인
- `npm run test -w frontend`: 206 pass, 4 skip
- `npm run typecheck -w frontend`, `npm run lint`, prettier: 통과
- 시각 기준선과 e2e(반응형·axe)는 PR CI로 확인합니다. 로컬 전체 `npm run check`는 메모리 부족 이력이 있어 돌리지 않았습니다.
