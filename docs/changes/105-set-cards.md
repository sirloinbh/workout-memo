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
  - 총중량과 횟수를 앱 고유 `NumberInput`(#99, − / + 버튼)으로 바꿨습니다. 총중량은 2.5 kg씩(소수 키패드 `inputmode="decimal"`), 횟수는 1회씩(숫자 키패드 `numeric`) 움직입니다. 0~99999 kg, 1~1000회 한도에서 버튼이 멈춥니다. 직접 입력은 이전처럼 0.25 kg 단위 등 자유롭고 검증은 공통 스키마가 합니다.
  - 세트 완료 버튼을 카드 너비 전체, 높이 48px 이상(`min-h-12`), 16px 글자로 키웠습니다. 접근 이름 "N세트 완료"와 `aria-pressed`는 그대로입니다.
  - 증감 단위 2.5 kg은 한 쌍의 가장 흔한 원판(1.25 kg × 2) 기준으로 정했습니다. 바꾸려면 `weightStep` 하나만 고칩니다.
- `frontend/src/components/number-input.tsx`
  - 새 `NumberValueInput`: 편집 상태가 숫자인 칸(세트의 중량·횟수)용 `NumberInput`입니다. 입력한 글자가 저장된 숫자와 같게 읽히는 동안은 그대로 두어 "12."이나 지운 칸이 입력 중에 바뀌지 않습니다. 버튼이나 초안 복구처럼 밖에서 바뀐 숫자는 바로 보입니다.
  - `NumberInput`의 묶음(`role="group"`)에 붙어 있던 같은 이름(`aria-label`)을 뺐습니다. 이름이 입력과 묶음 두 곳에 있어 라벨로 찾을 때 두 요소가 잡혔습니다. 버튼 이름("총중량 kg 늘리기")에 칸 이름이 들어 있습니다. 이 부품은 지금까지 쓰는 화면이 없었습니다(main과 진행 중인 원격 브랜치 확인).
- 화면 차이: 세트가 카드로 나뉘고 카드마다 "N세트" 머리줄이 생깁니다. 중량·횟수 칸 양옆에 − / + 버튼이 생기고 칸이 넓어집니다. 완료 버튼이 카드 너비로 커집니다. 편집 창이 전체적으로 길어집니다.

## 테스트

- 추가: `frontend/src/components/number-input.test.tsx` 3개. 숫자 칸이 "12."과 빈 칸을 입력한 그대로 두는지, 밖에서 바뀐 값을 보여 주고 그 값에서 증감하는지, 칸 이름으로 찾으면 입력 하나만 잡히는지 확인합니다.
- 추가: `frontend/src/workout-draft.test.tsx` 1개. 세트 카드의 총중량이 "늘리기"로 2.5 kg 오르고 횟수가 "줄이기"로 1 내려가는지, 키패드 종류, "1세트" 머리줄, 증감한 값이 로컬 초안에 남는지 확인합니다.
- 고친 것(같은 의미): 입력이 `type="number"`에서 `type="text"`+`inputmode`로 바뀌어 `input[step="0.25"]`·`input[type="number"]`로 찾던 `workout-draft`·`set-completion`·`period` 테스트를 역할과 이름(`textbox` "총중량 kg")으로 찾게 바꿨고, 값 비교를 문자열로 바꿨습니다. `routine-progress` 테스트의 칸 찾기는 `label` 안에 입력이 없으면 `htmlFor`로 찾습니다. e2e `workout-crud`·`new-workout-defaults`는 버튼 이름("총중량 kg 늘리기")과 겹치지 않게 `getByLabel(..., { exact: true })`로 바꿨습니다.
- `npm run test -w frontend -- --maxWorkers=1`: 227 pass, 4 skip (메모리 부족으로 워커 1개)
- `npm run typecheck -w frontend`, 바뀐 파일 eslint(`--max-warnings 0`)·prettier: 통과
- 실행하지 않은 것: e2e와 로컬 `npm run check`는 메모리 부족으로 돌리지 않았습니다. 시각 기준선·axe·반응형·터치 44px는 PR CI로 확인합니다.
