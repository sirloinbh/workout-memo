# #101 운동 기록 목록을 공통 컴포넌트로 교체 (3단계)

- 이슈: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- 브랜치: `feat/101-workout-list`

## 목적

#101을 요소 하나씩 나눠 옮기는 세 번째 PR입니다. 대시보드와 운동 일지의 기록 목록을 `List`, `ListItem`, `Button`으로 바꾸고 해당 `style.css` 규칙을 지웁니다. 이 PR은 #101을 닫지 않습니다.

## 변경 — feat: 기록 목록 교체

- `frontend/src/app.tsx`: 목록이 `운동 기록`이라는 이름의 목록이 됩니다. "수정"과 삭제 버튼은 공통 `Button`입니다.
- `frontend/src/style.css`: `.workout-list`, `.date-tile`, `.row-volume` 규칙을 지웠습니다. `.workout-row`, `.workout-info`, `.text-button`, `.icon-button`은 머신·신체 기록 등 다른 화면이 아직 써서 남겼습니다.
- 제목, 설명, 볼륨 글자를 공통 토큰(`text-body-sm`, `text-meta`)으로 바꿔 9~13px에서 12~14px로 커집니다. 세트 기록 글자는 14px 그대로입니다. "수정" 버튼 글자는 주 색에서 전경색으로 바뀝니다.
- 날짜 칸은 45×50px에서 48×48px이 됩니다.

## 변경 — fix: 1차 리뷰 보완

- 좁은 화면 배치: 글자가 커져 360px에서 설명 칸이 43~63px로 좁아졌습니다. 768px 미만에서는 날짜와 설명을 첫 줄에, 볼륨과 버튼을 둘째 줄에 둡니다.
- 긴 글자: `.workout-info`를 벗어나며 잃은 `overflow-wrap: anywhere`를 설명 칸 전체에 다시 넣었습니다. 공백 없는 세트 메모가 칸을 넘어 잘리던 회귀를 막고, 전부터 넘치던 긴 제목과 종목 이름도 함께 줄을 바꿉니다.
- 리뷰가 잡은 넘침은 `.card`의 `overflow: hidden`에 가려 e2e 넘침 검사로 잡히지 않습니다. jsdom에서는 배치를 잴 수 없어 자동 테스트를 추가하지 않았습니다.

## 하지 않은 일

삭제 확인은 브라우저 `confirm()` 그대로입니다. 공통 `ConfirmDialog`로 바꾸면 동작과 포커스 흐름이 달라지고 목표·신체 기록의 삭제와 함께 봐야 해서 이 PR에 넣지 않았습니다.

## 테스트

- 추가: `frontend/src/period.test.tsx`의 목록 이름과 행의 수정·삭제 버튼 테스트
- 수정: `period.test.tsx`, `e2e/workout-crud.spec.ts`의 행 선택자를 지운 스타일과 분리해 `data-slot`으로 바꿨습니다. 검증 내용은 같습니다.
- `npm run typecheck`, `npm run lint`: 통과
- 시각 기준선 8장 갱신: 대시보드·일지 4개 폭입니다. CI 실행의 실패 8건이 모두 이 시각 회귀였고, axe를 포함한 나머지 70건은 통과했습니다. `journal-360`, `journal-768`, `dashboard-1280`을 직접 봤습니다.
- 리뷰 보완 뒤 긴 메모 넘침은 다시 재지 않았습니다. 기준선 화면에는 그런 데이터가 없어 `overflow-wrap` 적용으로만 판단했습니다.
- 로컬 전체 `npm run check`는 메모리 부족 이력이 있어 돌리지 않았습니다. e2e는 PR CI로 확인합니다.
