# #101 운동 일지의 루틴 목표 카드를 공통 Card로 교체 (8단계)

- 이슈: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- 브랜치: `feat/101-routine-card`

## 목적

#101을 요소 하나씩 나눠 옮기는 마지막 PR입니다. 운동 일지의 루틴 목표 카드를 공통 `Card`, `Button`과 유틸리티 클래스로 바꾸고 해당 `style.css` 규칙을 지웁니다. 이 PR로 #101의 범위가 모두 끝나며, 병합 후 완료 기준을 대조하고 이슈를 닫습니다.

## 변경 — feat: 루틴 목표 카드 교체

- `frontend/src/progress.tsx`
  - 카드: `Card`(`role="region"`, 이름 "루틴 목표"), `CardHeader`, `CardTitle`(h2), `CardDescription`, `CardContent`. 이전 `<section aria-label>`과 같은 영역 이름입니다.
  - 버튼: "오늘 루틴으로 기록하기"는 `secondary`, "오늘 하루 휴식하기"는 `ghost`, "휴식 확정"은 기본, "돌아가기"와 "휴식 취소"는 `outline`, "루틴 목표 다시 불러오기"는 `link`입니다.
  - 오류: `.error` 대신 `destructive` 토큰 유틸리티(`border-destructive/30`, `bg-destructive/10`, `text-destructive`)를 씁니다.
  - 자동 목표 안내: `.form-hint` 대신 `bg-muted`와 `text-meta`입니다.
  - 12주 표: 셀 테두리·여백을 유틸리티로 옮겼습니다. 좁은 화면에서는 이전처럼 표만 가로로 스크롤합니다. 이전에는 표 자체를 `display: block`으로 바꿨고, 지금은 표를 `overflow-x-auto` 상자로 감쌉니다.
  - 테스트가 쓰는 표시: 목표 목록은 `data-slot="target-list"`, 제외된 목표는 `data-excluded`입니다.
- `frontend/src/style.css`: `.routine-progress`, `.progress-body`, `.target-list`, `.progress-actions`, `.rest-preview`, `.week-table`과 반응형 규칙, 대비 규칙의 `.rest-preview`를 지웠습니다. 비게 된 `@media (max-width: 760px)` 하나도 지웠습니다.
- 화면 차이: 버튼이 공통 `Button` 모양(높이 36px, 터치 기기 44px)이 됩니다. 본문은 12~13px에서 14px로, 제목은 15px에서 16px로 커집니다. 휴식 확정·돌아가기 버튼은 한 줄에 간격을 두고 놓입니다.

## 테스트

- 수정: `frontend/src/routine-progress.test.tsx`의 목록 선택자(`className === 'target-list'`, `className === 'excluded'`)를 `data-slot`과 `data-excluded`로 바꿨습니다. 검증 내용은 같습니다.
- 추가: 같은 파일에 2개
  - 불러오기 실패 시 카드 안에 오류가 보이고, "루틴 목표 다시 불러오기"로 다시 요청해 카드가 정상으로 돌아오는지 확인합니다.
  - 휴식 미리보기에서 "돌아가기"를 누르면 요청 없이 미리보기가 닫히고 "오늘 하루 휴식하기"가 다시 보이는지 확인합니다.
- `npm run test -w frontend -- src/routine-progress.test.tsx`: 9 pass
- `npm run test -w frontend`: 209 pass, 4 skip
- `npm run typecheck -w frontend`, `npm run lint`, prettier: 통과
- 시각 기준선과 e2e(반응형·axe)는 PR CI로 확인합니다. 로컬 전체 `npm run check`는 메모리 부족 이력이 있어 돌리지 않았습니다.
