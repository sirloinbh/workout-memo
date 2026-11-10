# #173 남은 곳의 불러오는 중 표시를 공통 Skeleton·Spinner로

#250에서 종목 분석, 신체 기록, 루틴 목록, 저장 버튼 일부를 바꿨습니다. 이번에는 남은 곳을 바꿉니다.

## 변경

- 대시보드·운동 일지 운동 기록 목록(`app.tsx`)
  - 불러오는 동안 "기록을 불러오는 중…" 글자 대신 `SkeletonList`를 보여 줍니다.
  - `aria-busy`와 이름 "운동 기록 목록"이 있는 영역 안에 둡니다. 화면 낭독기용 상태 줄은 `sr-only`로 남깁니다.
- 루틴 목표 카드(`progress.tsx`): 불러오는 동안 `SkeletonText`를 보여 줍니다. 영역 이름은 "루틴 목표 내용"이고, 상태 줄은 위와 같이 둡니다.
- 휴식 확정 버튼(`progress.tsx`): 처리를 기다리는 동안 `Spinner size="sm"`을 보여 줍니다. 버튼은 원래대로 비활성화됩니다.
- 운동 기록 편집 창(`app.tsx`)
  - 저장 버튼에 `Spinner`를 보여 줍니다.
  - "저장 중…" 상태 줄 앞에도 같은 `Spinner`를 둡니다. 상태 줄은 원래 `Notice`(role="status") 그대로입니다.
- 스피너는 모두 `aria-hidden`입니다. 낭독기는 버튼 이름과 상태 줄로 알립니다.

## 범위 밖

- 루틴짜기 화면 폼(`routines.tsx` 저장 버튼)은 agent3 작업과 겹쳐 손대지 않았습니다.
- 유산소 화면(`cardio/*`, `cardio-goals.tsx`)은 다른 작업 범위라 손대지 않았습니다.

## 검사

- `npm run test -w frontend -- src/loading-placeholders src/routine-progress src/set-completion src/forms src/new-workout-defaults src/period`: 통과(6파일 59개)
  - 불러오는 중 검사에 운동 일지 목록과 루틴 목표 카드를 더했습니다.
  - 일지 저장 버튼과 상태 줄의 스피너 검사를 더했습니다.
  - 휴식 확정 버튼의 스피너 검사를 더했습니다.
- `npm run test -w frontend` 전체: 57/58 파일 통과. `routines.test.tsx`의 긴 테스트 1개가 전체 실행 중 15초 제한에 걸렸습니다. 따로 실행하면 통과합니다(10/10). 이번 변경과 관계없는 파일입니다.
- 타입 검사, ESLint, Prettier: 통과
