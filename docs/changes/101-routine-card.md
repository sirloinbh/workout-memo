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

## 변경 — fix: 1차 리뷰 보완

- 12주 표의 가로 스크롤 상자에 키보드로 들어갈 수 없었습니다. 360px에서 표가 넘치면 키보드 사용자는 스크롤할 수 없고, axe `scrollable-region-focusable`에도 걸릴 수 있습니다. 이전 `display: block` 표도 같았습니다. 상자에 `role="region"`, 이름 "12주 전체 목표 표", `tabIndex={0}`, 포커스 테두리(`ring-ring`)를 넣었습니다. lint 규칙 `no-noninteractive-tabindex`는 이 한 줄만 이유를 적고 끕니다.
- 불러오기 실패 테스트가 페이지 이동 때마다 몇 번 불러오는지(`failProgress: 2`)에 묶여 있었습니다. "복구할 때까지 실패"하는 플래그와 `recoverProgress()`로 바꿨습니다. 같은 테스트에서 표 상자가 포커스 가능(`tabindex="0"`)하고 12주가 모두 있는지도 확인합니다.
- 반영하지 않음: "회색 바탕 위 흐린 글자 대비가 4.35:1로 AA 미달"이라는 지적. 이 수치는 라이트 모드 기준입니다. 이 앱은 다크 전용이고, 다크 `muted` 바탕 위 `muted-foreground` 대비는 약 5.8:1입니다. CI의 axe 검사로 확인합니다.
- 1차 보완 후: `npm run test -w frontend -- src/routine-progress.test.tsx` 9 pass, `npm run lint`, `npm run typecheck -w frontend` 통과

## 변경 — test: 시각 기준선 갱신

- 2차 리뷰는 보완점이 없었습니다. 선택 사항인 위 기록 문구("포커스를 받고" → "포커스 가능")만 고쳤습니다. 리뷰 2회를 마쳐 3차 리뷰는 하지 않습니다.
- `3faa074`의 CI `e2e-visual`에서 `journal-360·390·768·1280` 4장만 실패했고 axe·반응형 포함 나머지 74건은 통과했습니다. 360px과 1280px 이미지를 직접 보고 설명·본문 글자가 커진 것 외에 차이가 없음을 확인한 뒤 `visual-baselines` 아티팩트로 4장을 갱신했습니다.
- 한계: e2e 고정 데이터의 오늘(2026-10-15)은 계획된 운동일이 아니어서 "오늘 루틴으로 기록하기", "오늘 하루 휴식하기", 휴식 미리보기 버튼은 기준선 이미지에 나오지 않습니다. 이 버튼들은 화면 테스트로만 확인했습니다.
