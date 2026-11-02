# #101 세트 행을 공통 컴포넌트로 교체 (6단계)

- 이슈: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- 브랜치: `feat/101-set-rows`

## 목적

#101을 요소 하나씩 나눠 옮기는 여섯 번째 PR입니다. 일지 편집의 세트 행을 공통 `Input`, `Button`과 유틸리티로 바꾸고 `.set-editor` 규칙을 지웁니다.

이 PR은 #101을 닫지 않습니다. 이슈 범위의 대시보드 그래프 영역과 운동 일지의 루틴 목표 카드가 남았습니다.

## 변경 — feat: 세트 행 교체

- `frontend/src/app.tsx`: 운동명, 총중량, 횟수는 공통 `Input`, 완료와 삭제는 공통 `Button`입니다.
- 머신 선택은 브라우저 기본 `select`로 둡니다. 공통 `Select`(Radix)는 "자유 운동"의 빈 값을 항목으로 쓸 수 없고, 값을 고르는 방식이 달라 화면 테스트와 e2e까지 바꾸는 별도 작업이 필요합니다.
- 입력 칸은 `NumberInput`으로 바꾸지 않았습니다. − + 버튼을 넣는 입력 흐름은 #105 범위입니다.
- `frontend/src/style.css`: `.set-editor`, `.set-number`, `.set-actions`, `.set-done`, `.set-reference`, `.set-notes`와 반응형, 터치 규칙을 지웠습니다.
- 화면 차이: 입력 라벨이 9px에서 12px로, 입력 글자가 12px에서 14px로 커집니다. 터치 기기는 16px입니다. 완료한 세트 버튼은 주 색 바탕입니다. 2열로 바뀌는 폭은 761px에서 `md`(768px)입니다.

## 테스트

- 수정: `routine-progress.test.tsx`, `e2e/new-workout-defaults.spec.ts`, `e2e/workout-crud.spec.ts`의 세트 행 선택자를 `data-slot`으로 바꿨습니다. 검증 내용은 같습니다.
- `npm run test -w frontend -- src/routine-progress.test.tsx src/set-completion.test.tsx src/forms.test.tsx src/workout-draft.test.tsx src/new-workout-defaults.test.tsx`: 40 pass
- 로컬 전체 `npm run check`는 메모리 부족 이력이 있어 돌리지 않았습니다. e2e와 시각 기준선은 PR CI로 확인합니다.
