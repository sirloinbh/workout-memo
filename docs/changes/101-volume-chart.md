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
  - 7개가 넘는 구간(4주·1달·12주·직접 지정)은 `xl`(1280px) 미만에서 날짜 라벨을 하나 걸러 보여 줍니다. 글자가 9px에서 12px로 커져 좁은 화면에서 라벨이 겹치지 않게 하려는 것입니다. 1주(요일 7개)는 모두 보여 줍니다.
  - 카드 배치: 1열 → `md` 230px → `xl` 280px → `2xl` 340px 오른쪽 열입니다. 이전에는 761px·1101px·1500px에서 바뀌었습니다.
- `frontend/src/style.css`: `.overview-grid`, `.legend`, `.chart`, `.chart-y`, `.plot`, `.grid-lines`, `.bars`, `.bar-column`, `.bar`, `.chart-empty`, `.focus-card`, `.focus-top`, `.rings`와 반응형 규칙, 대비 규칙의 `.focus-card`를 지웠습니다. 비게 된 `@media (min-width: 1500px)`도 지웠습니다. `.card`, `.section-title`은 다른 화면이 써서 남겼습니다.
- 화면 차이: 제목 15→16px, 설명 10→14px, 범례·축·날짜 8~9px→12px로 커집니다. 그래프 높이는 215px→224px(`2xl` 256px)입니다. 모바일에서 안내 카드 설명이 오른쪽 위에 겹쳐 놓이지 않고 제목 아래로 갑니다.

## 테스트

- 추가: `frontend/src/period.test.tsx`
  - 막대 높이가 가장 큰 구간 대비 %이고, 마지막 구간 하나만 강조되며, 기록이 있으면 빈 안내가 없는지 확인합니다.
  - 12주에서 라벨 12개가 모두 있고 홀수 번째만 좁은 화면에서 숨기는지 확인합니다.
- `npm run test -w frontend -- src/period.test.tsx src/custom-range.test.tsx`: 29 pass
- `npm run test -w frontend`: 206 pass, 4 skip
- `npm run typecheck -w frontend`, `npm run lint`, prettier: 통과
- 시각 기준선과 e2e(반응형·axe)는 PR CI로 확인합니다. 로컬 전체 `npm run check`는 메모리 부족 이력이 있어 돌리지 않았습니다.
