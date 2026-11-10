# #173 유산소 통계·개인 기록의 불러오는 중 표시를 공통 Skeleton으로

#250·#270에 이어 유산소 화면 중 다른 작업과 겹치지 않는 두 곳을 바꿉니다.

## 변경

- 유산소 통계(`cardio/cardio-stats.tsx`): 처음 불러오는 동안 "통계를 불러오는 중…" 글자 대신 `SkeletonCard`를 보여 줍니다. `aria-busy` 영역 "유산소 통계" 안에 두고, 상태 줄은 `sr-only`로 남깁니다.
- 개인 기록(`cardio/cardio-records.tsx`): 불러오는 동안 `SkeletonList`를 보여 줍니다(영역 이름 "개인 기록"). 불러오기에 실패하면 원래대로 오류 배너만 보입니다.
- 유산소 목표(`cardio-goals.tsx`)는 이미 공통 Skeleton·Spinner를 쓰고 있어 바꾸지 않았습니다.

## 범위 밖

- 유산소 기록 목록(`cardio/cardio-panel.tsx`)과 기록 저장 버튼(`cardio/cardio-form.tsx`)은 agent2의 #266(활동 파일 가져오기)이 같은 파일을 고치고 있어, 그 PR이 병합된 뒤에 바꿉니다.

## 검사

- `npm run test -w frontend -- src/cardio`: 통과
- 통계·개인 기록의 불러오는 중 화면 검사를 더했습니다. 영역 이름, 자리 표시, `sr-only` 상태 줄, 불러온 뒤 사라지는지를 봅니다.
- ESLint, Prettier: 통과
