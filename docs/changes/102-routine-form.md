# #102 루틴짜기의 루틴 폼을 공통 컴포넌트로 교체 (3단계)

- 이슈: [#102](https://github.com/sirloinbh/workout-memo/issues/102)
- 브랜치: `feat/102-routine-form`
- 앞 단계: 1단계 나의 목표 [#227](https://github.com/sirloinbh/workout-memo/pull/227), 2단계 종목 분석 [#228](https://github.com/sirloinbh/workout-memo/pull/228)

## 목적

루틴짜기 화면의 머리 안내, 오류·저장 안내, 루틴 목록, 루틴 폼(일정 방식·분할·부위·운동·주차 목표)을 공통 컴포넌트로 바꾸고, 폼만 쓰던 `style.css` 규칙을 지웁니다. 12주 미리보기(`Preview`)와 계획 보기(`selected` 상세)는 4단계에서 옮깁니다. 단계별 입력 흐름은 범위 밖이며 #102 뒤에 따로 합니다(조율 창 결정).

## 변경 — feat: 루틴 폼 교체

- `frontend/src/routines.tsx`
  - 오류: `.error` 대신 #223의 `AlertBanner`입니다. 저장 완료와 불러오는 중은 `Notice`(`role="status"`)입니다.
  - "새 루틴 만들기"는 공통 `Button`(아이콘 포함), 목록의 "계획 보기"는 `outline`·`sm`입니다. 목록은 테두리 상자 안에 줄로 나눴습니다.
  - 폼은 `Card` 안에 둡니다. 이름표는 공통 `Label`, 글자·숫자·날짜 입력은 공통 `Input`(터치 768px 이상에서도 16px)입니다.
  - 선택 칸(주차 목표 방식·분할 방식·운동 일정 방식·머신·주차 목표 대상)은 브라우저 기본 `select`를 유지하고 공통 입력과 같은 모양의 유틸리티를 붙였습니다. #101의 머신 선택과 같은 예외입니다. 공통 `Select`(Radix)는 "자유 운동"의 빈 값을 항목으로 쓸 수 없고, 화면 테스트가 기본 `select`를 직접 조작합니다.
  - 휴식 요일: 기본 체크박스 대신 공통 `Checkbox`입니다. #231 머신 폼과 같은 className(`pointer-coarse:min-h-4 pointer-coarse:min-w-4 pointer-coarse:after:-inset-[15px]`)으로, 터치 화면에서 상자는 16px로 두고 누름 영역(`::after`)을 44px로 맞췄습니다. 공통 파일의 근본 수정은 project-standards#415입니다.
  - 분할 묶음·휴식 요일·주차 목표: `fieldset`은 유틸리티 테두리 상자, `legend`는 굵은 글자입니다.
  - 부위 추가 버튼은 `outline`·`sm`, 추가된 부위는 둥근 칩 안의 "삭제"(`ghost`)입니다. 버튼 이름("가슴 추가", "분할 1 부위 1 삭제")은 그대로입니다.
  - 운동 행은 2열(768px 이상 3열) 그리드이고 "운동 삭제"는 `outline`·`sm`, "운동 추가"는 `secondary`입니다.
  - "루틴 저장하기"·"취소"는 한 줄에 둡니다.
- `frontend/src/style.css`: `.routine-page fieldset`, `.routine-page button`, `.routine-page input[type='checkbox']`, `.routine-exercise`를 지웠습니다. `.routine-page li`는 4단계에서 옮길 미리보기·계획 보기 목록이 아직 써서 남겼습니다.

## 테스트

- 수정: `frontend/src/routines.test.tsx`의 입력 도우미 `change()`가 공통 `Checkbox`(`role="checkbox"`)를 눌러 휴식 요일을 고르도록 했습니다. 기존 테스트의 검증 내용은 같습니다.
- 추가: 같은 파일에서 저장 실패 오류가 `role="alert"`로, 저장 완료가 `role="status"`로 보이는지 확인합니다.
- `npm run test -w frontend -- src/routines.test.tsx src/routine-progress.test.tsx`: 17 pass
- `npm run typecheck -w frontend`, eslint·prettier(바꾼 파일): 통과
- 시각 기준선과 e2e(반응형·axe·터치)는 PR CI로 확인합니다. 세 워크트리가 동시에 돌아 메모리가 부족해 로컬 전체 `npm run check`와 e2e는 돌리지 않았습니다.

## 변경 — main 병합과 터치 검사

- #231(머신 폼, `7db58af`)이 병합된 뒤 `origin/main`을 병합했습니다. 충돌은 없었습니다. #231의 터치 검사는 `[role="checkbox"]`를 일반 버튼 검사에서 빼고, `::after` 누름 영역이 44px 이상인지와 상자가 24px보다 커지지 않는지 봅니다. 휴식 요일 `Checkbox`에 #231과 같은 className을 붙였습니다.
- `e2e/ui-touch.spec.ts`에 터치 360·390·768px에서 "새 루틴 만들기"를 열고 요일 방식·수동 목표로 바꾼 뒤(휴식 요일 체크박스와 12주 목표 묶음이 나오는 상태) 입력·버튼·체크박스 기준과 가로 넘침을 확인하는 검사를 추가했습니다. 고정 데이터의 루틴짜기 화면은 폼을 열지 않아 이전 검사에는 폼이 나오지 않았습니다.
- 병합 뒤: `npm run test -w frontend -- src/routines.test.tsx` 8 pass, eslint(바꾼 파일)·`npm run typecheck` 통과. 추가한 e2e는 CI로 확인합니다.

## 변경 — fix: 1차 리뷰 보완

- 768px 미만(2열)에서 총중량 칸만 두 칸을 차지해 세트·반복 칸 옆이 비었습니다. 총중량도 한 칸으로 두고 그리드를 `items-end`로 맞춰, 이름표가 두 줄인 칸과 한 줄인 칸의 입력이 같은 높이에 놓이게 했습니다. 리뷰가 제안한 `grid-flow-dense`는 화면 순서와 탭 순서가 달라져 쓰지 않았습니다.
- 휴식 요일 `Checkbox`에 `id`(`rest-day-0`~`6`)를 붙여 터치 검사 실패 메시지에서 어느 요일인지 알 수 있게 했습니다.
- 반영하지 않음: "17 pass를 확인하지 못했다"는 지적. 처음 커밋 때 두 파일을 함께 돌린 실제 결과입니다.
- 1차 보완 후: `npm run test -w frontend -- src/routines.test.tsx` 8 pass. 같은 명령을 세 번 돌린 중 한 번은 1건이 실패했고 다시 돌린 두 번은 모두 통과했습니다. PC 메모리가 부족한 상태여서 시간 초과로 봅니다. eslint(바꾼 파일) 통과.
