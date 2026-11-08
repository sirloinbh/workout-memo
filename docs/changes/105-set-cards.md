# #105 모바일 입력 흐름 최적화 1단계: 세트 카드·증감 버튼·큰 완료 버튼

- 이슈: [#105](https://github.com/sirloinbh/workout-memo/issues/105)
- 브랜치: `feat/105-set-cards`

## 목적

운동 중 한 손으로 빠르게 기록하도록 일지 편집의 세트 입력을 바꿉니다. #105는 범위가 커서 요소마다 PR을 나눕니다.

1. 이번 PR: 세트 카드, 중량·횟수 증감 버튼과 숫자 키패드(`inputmode`), 큰 세트 완료 버튼
2. 저장 버튼 하단 고정, 모바일 하단 시트·전체 화면 모달, 키보드 가림
3. 휴식 타이머 상단 고정, 진동 알림
4. 390px e2e 흐름("새 일지 → 세트 3개 입력·완료 → 저장")과 탭 수·소요 시간 비교 기록

루틴짜기 단계별 입력은 #102 ③단계가 루틴 폼을 교체 중이라 이번 묶음에서 뺐습니다.

## 변경 — feat: 세트 카드와 증감 버튼

- `frontend/src/app.tsx`
  - 세트 한 줄(`data-slot="set-row"`)을 모든 폭에서 테두리 카드로 바꿨습니다. 맨 위에 "N세트"와 삭제 버튼이 있고, 운동명·머신(`md`부터 2열), 총중량·횟수(2열), 세트 메모, 참고 기록, 완료 버튼 순서입니다. 완료한 세트는 카드 테두리가 진해집니다.
  - 총중량과 횟수를 앱 고유 `NumberInput`(#99, − / + 버튼)으로 바꿨습니다. 총중량은 5 kg씩(소수 키패드 `inputmode="decimal"`), 횟수는 1회씩(숫자 키패드 `numeric`) 움직입니다. 0~99999 kg, 1~1000회 한도에서 버튼이 멈춥니다. 검증은 공통 스키마가 합니다. 이전 `step="0.25"`처럼 브라우저가 0.25 kg 단위를 막지는 않습니다(1차 리뷰 보완 참고).
  - 세트 완료 버튼을 카드 너비 전체, 높이 48px 이상(`min-h-12`), 16px 글자로 키웠습니다. 접근 이름 "N세트 완료"와 `aria-pressed`는 그대로입니다.
  - 증감 단위는 사용자 결정으로 5 kg입니다(처음에는 원판 한 쌍 1.25 kg × 2 기준 2.5 kg). 바꾸려면 `weightStep` 하나만 고칩니다. 직접 입력은 그대로 0.25 kg 단위까지 됩니다.
- `frontend/src/components/number-input.tsx`
  - 새 `NumberValueInput`: 편집 상태가 숫자인 칸(세트의 중량·횟수)용 `NumberInput`입니다. 입력한 글자가 저장된 숫자와 같게 읽히는 동안은 그대로 두어 "12."이나 지운 칸이 입력 중에 바뀌지 않습니다. 버튼이나 초안 복구처럼 밖에서 바뀐 숫자는 바로 보입니다.
  - `NumberInput`의 묶음(`role="group"`)에 붙어 있던 같은 이름(`aria-label`)을 뺐습니다. 이름이 입력과 묶음 두 곳에 있어 라벨로 찾을 때 두 요소가 잡혔습니다. 버튼 이름("총중량 kg 늘리기")에 칸 이름이 들어 있습니다. 이 부품은 지금까지 쓰는 화면이 없었습니다(main과 진행 중인 원격 브랜치 확인).
- 화면 차이: 세트가 카드로 나뉘고 카드마다 "N세트" 머리줄이 생깁니다. 중량·횟수 칸 양옆에 − / + 버튼이 생기고 칸이 넓어집니다. 완료 버튼이 카드 너비로 커집니다. 편집 창이 전체적으로 길어집니다.

## 테스트

- 추가: `frontend/src/components/number-input.test.tsx` 3개. 숫자 칸이 "12."과 빈 칸을 입력한 그대로 두는지, 밖에서 바뀐 값을 보여 주고 그 값에서 증감하는지, 칸 이름으로 찾으면 입력 하나만 잡히는지 확인합니다.
- 추가: `frontend/src/workout-draft.test.tsx` 1개. 세트 카드의 총중량이 "늘리기"로 5 kg 오르고 횟수가 "줄이기"로 1 내려가는지, 키패드 종류, "1세트" 머리줄, 증감한 값이 로컬 초안에 남는지 확인합니다.
- 고친 것(같은 의미): 입력이 `type="number"`에서 `type="text"`+`inputmode`로 바뀌어 `input[step="0.25"]`·`input[type="number"]`로 찾던 `workout-draft`·`set-completion`·`period` 테스트를 역할과 이름(`textbox` "총중량 kg")으로 찾게 바꿨고, 값 비교를 문자열로 바꿨습니다. `routine-progress` 테스트의 칸 찾기는 `label` 안에 입력이 없으면 `htmlFor`로 찾습니다. e2e `workout-crud`·`new-workout-defaults`는 버튼 이름("총중량 kg 늘리기")과 겹치지 않게 `getByLabel(..., { exact: true })`로 바꿨습니다.
- `npm run test -w frontend -- --maxWorkers=1`: 227 pass, 4 skip (메모리 부족으로 워커 1개)
- `npm run typecheck -w frontend`, 바뀐 파일 eslint(`--max-warnings 0`)·prettier: 통과
- 실행하지 않은 것: e2e와 로컬 `npm run check`는 메모리 부족으로 돌리지 않았습니다. 시각 기준선·axe·반응형·터치 44px는 PR CI로 확인합니다.

## 변경 — fix: 1차 리뷰 보완

1차 리뷰는 필수 3건, 권장 4건이었습니다.

- 필수 1: 360·390px 터치 화면에서 총중량·횟수를 나란히 두면 44px 버튼 두 개를 빼고 입력칸이 약 25~40px만 남아 숫자가 보이지 않았습니다. 480px 미만에서는 두 칸을 위아래로 쌓습니다(`grid min-[480px]:grid-cols-2`).
- 필수 2: 새 `Label`에 legacy `.modal label` 규칙(아래 17px 여백, 세로 flex)이 남아 라벨과 입력 사이가 벌어지고 글자가 가운데로 갔습니다. 같은 카드의 다른 칸처럼 `<label htmlFor … className="mb-0 text-meta">`로 바꿨습니다.
- 필수 3: 텍스트 칸이라 "1..", "-", 영문 같은 입력이 `Number()`에서 NaN이 되어 상태에 들어갔습니다. NaN은 초안 JSON에 `null`로 저장되고, 다음에 열 때 손상된 초안으로 판정되어 초안 전체가 버려질 수 있었습니다. `NumberValueInput`은 쉼표 소수점을 점으로 읽고, 숫자로 읽히지 않는 글자는 받지 않습니다. 그래서 상태는 항상 유한한 숫자입니다.
- 권장 4: 0.25 kg 단위는 이전에는 브라우저 `step`만 막고 있었고, 이제는 막지 않습니다. 위 기록을 고쳤습니다. 공통 스키마에 단위 검사를 넣는 일은 계약 변경이라 [#234](https://github.com/sirloinbh/workout-memo/issues/234)로 분리했습니다.
- 권장 5(남김): 세트 `key`가 순번이라, 세트를 지운 뒤 같은 숫자로 읽히는 다른 글자(예: 빈 칸과 0)가 남을 수 있습니다. 저장 값에는 영향이 없고 보이는 모양만 다르므로 그대로 둡니다.
- 권장 6: 낡은 테스트 주석을 고쳤습니다.
- 권장 7(변경 없음): md 2열에서 오류가 반 칸만 차지한다는 지적은 `.field-error`에 `grid-column: 1 / -1`이 있어 해당하지 않았습니다.
- 추가 테스트: `number-input.test.tsx`에 쉼표·읽을 수 없는 글자 1개, `workout-draft.test.tsx`에 잘못된 중량 글자가 초안에 들어가지 않는지 1개
- 보완 후: `npm run test -w frontend -- --maxWorkers=1 src/components/number-input.test.tsx src/workout-draft.test.tsx src/routine-progress.test.tsx src/forms.test.tsx src/new-workout-defaults.test.tsx` 49 pass, typecheck·eslint·prettier 통과

## 변경 — fix: 2차 리뷰 보완

2차 리뷰는 필수 지적 없이 권장 2건이었고 둘 다 반영했습니다. 리뷰 2회를 마쳐 3차 리뷰는 하지 않습니다.

- 총중량·횟수의 라벨과 입력 사이가 4px로 운동명·머신(`.modal label`의 8px)과 달랐습니다. `gap-2`로 맞췄습니다.
- 숫자 칸이 `Number()`로 읽히는 글자를 모두 받아 붙여 넣은 "0x10"이 16, "1e3"이 1000이 되고, "."으로 시작하는 ".5"는 칠 수 없었습니다. 이제 숫자와 소수점 하나만 받고(`/^\d*\.?\d*$/`), "."만 친 동안은 0으로 봅니다. 쉼표를 소수점으로 읽으므로 붙여 넣은 "1,000"은 1이 됩니다. 쉼표 소수점 키패드를 받기 위한 선택입니다.
- 추가 테스트: `number-input.test.tsx`에 "."으로 시작하는 입력 1개, 거절 목록에 "0x10"·"1e3"·" 5" 추가
- 보완 후: `npm run test -w frontend -- --maxWorkers=1 src/components/number-input.test.tsx src/workout-draft.test.tsx src/routine-progress.test.tsx src/set-completion.test.tsx src/period.test.tsx` 78 pass, typecheck·eslint·prettier 통과

## 변경 — fix: 중량 증감 단위 5 kg

- 사용자 결정으로 `weightStep`을 2.5에서 5로 바꿨습니다. − / + 버튼만 5 kg씩 움직이고, 직접 입력은 0.25 kg 단위까지 그대로 받습니다.
- 고친 테스트: `workout-draft.test.tsx`의 세트 카드 테스트가 "늘리기"로 100.25 → 105.25 kg을 기대합니다.
- 사용자 결정 반영이라 3차 리뷰는 하지 않습니다.
- `NumberInput`은 단위가 정수면 숫자 키패드(`numeric`)를 고릅니다. 5 kg로 바꾸면 중량 칸에서 소수점을 칠 수 없게 되어, 중량 칸에 `inputMode="decimal"`을 직접 줬습니다. 기존 테스트의 `inputmode="decimal"` 확인이 이를 잡았습니다.
- 보완 후: `npm run test -w frontend -- --maxWorkers=1 src/workout-draft.test.tsx src/components/number-input.test.tsx src/set-completion.test.tsx` 44 pass, typecheck·eslint·prettier 통과
