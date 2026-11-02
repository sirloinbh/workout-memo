# #101 운동 기록 목록을 공통 컴포넌트로 교체 (3단계)

- 이슈: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- 브랜치: `feat/101-workout-list`

## 목적

#101을 요소 하나씩 나눠 옮기는 세 번째 PR입니다. 대시보드와 운동 일지의 기록 목록을 `List`, `ListItem`, `Button`으로 바꾸고 해당 `style.css` 규칙을 지웁니다. 이 PR은 #101을 닫지 않습니다.

## 변경 — feat: 기록 목록 교체

- `frontend/src/app.tsx`: 목록이 `운동 기록`이라는 이름의 목록이 됩니다. "수정"과 삭제 버튼은 공통 `Button`입니다.
- `frontend/src/style.css`: `.workout-list`, `.date-tile`, `.row-volume` 규칙을 지웠습니다. `.workout-row`, `.workout-info`, `.text-button`, `.icon-button`은 머신·신체 기록 등 다른 화면이 아직 써서 남겼습니다.
- 글자를 공통 토큰(`text-body-sm`, `text-meta`)으로 바꿔 9~12px이던 글자가 12~14px로 커집니다. "수정" 버튼 글자는 주 색에서 전경색으로 바뀝니다.
- 날짜 칸은 45×50px에서 48×48px이 됩니다.

## 하지 않은 일

삭제 확인은 브라우저 `confirm()` 그대로입니다. 공통 `ConfirmDialog`로 바꾸면 동작과 포커스 흐름이 달라지고 목표·신체 기록의 삭제와 함께 봐야 해서 이 PR에 넣지 않았습니다.

## 테스트

- 추가: `frontend/src/period.test.tsx`의 목록 이름과 행의 수정·삭제 버튼 테스트
- 수정: `period.test.tsx`, `e2e/workout-crud.spec.ts`의 행 선택자를 지운 스타일과 분리해 `data-slot`으로 바꿨습니다. 검증 내용은 같습니다.
- `npm run typecheck`, `npm run lint`: 통과
- 시각 기준선과 e2e는 PR CI에서 확인합니다. 로컬 전체 `npm run check`는 메모리 부족 이력이 있어 돌리지 않았습니다.
