# #116 유산소 목표(주간·월간 누적, 기록 목표)와 달성 판정

- 이슈: [#116](https://github.com/sirloinbh/workout-memo/issues/116)
- 브랜치: `feat/116-cardio-goals`
- 선행: #114(유산소 기록 모델·API, 9ecca13)
- 설계: 2026-11-08 사용자 결정 D1~D6([#116 댓글](https://github.com/sirloinbh/workout-memo/issues/116#issuecomment-6720061395))

## 목적

유산소 운동 목표를 세우고 서버가 달성을 판정하게 합니다. 나의 목표 화면에 근력 목표와 함께 보여 줍니다.

## 변경 — feat: 저장과 서버 판정

- `database/migrations/016_cardio_goals.sql`(새 파일, 재실행 안전): `cardio_goals`(목표 종류·운동 종류·기간 단위·목표 거리/시간/횟수·시작일·종료일). 종류마다 필요한 목표값만 있도록 CHECK(`cardio_goals_shape`)로 막습니다. 근력 `goals`는 바꾸지 않았습니다.
- `shared/contract.ts` → `npm run contract:sync`: `cardioGoalTypes`, `cardioGoalPeriods`, `cardioGoalSchema`. 범위: 거리 0 초과 10000 km 이하·소수점 셋째 자리, 시간 1~2678400초(31일), 횟수 1~1000, 목표 기간 5년(1826일) 이하(DB CHECK도 같음). 종류에 쓰지 않는 목표값은 `null`이어야 합니다.
- `backend/src/cardio-goals.ts`(새 파일): DB 없이 시험할 수 있는 판정 함수 `judgeCardioGoal`.
  - 기간 누적(D2·D3): 주(월~일)·달력 월마다 그 주기 안, 목표 기간 안, 오늘(서울) 이전의 기록만 셉니다. 걸친 주기도 목표값은 그대로입니다. `achieved`는 오늘이 든 주기의 달성 여부이고, 시작 전·종료 후에는 그 주기가 없어 `false`입니다.
  - 기록 목표(D5): `record_time`은 한 기록이 목표 거리 이상이고 그 기록의 전체 시간이 목표 시간 이하일 때, `longest_distance`는 가장 긴 한 기록이 목표 거리 이상일 때 달성입니다. 페이스로 추정하지 않습니다.
  - 운동 종류(D4): 목표의 `kind`가 있으면 그 종류만, `null`이면 모두 셉니다. 거리 없는 기록은 거리 목표에서만 빠집니다.
- `backend/src/routes/cardio-goals.ts`(새 파일): `GET /api/cardio-goals`(판정 포함, 종료일 순), `POST`(201), `DELETE /:id`(없으면 404 "유산소 목표를 찾을 수 없습니다"). 목록은 가장 이른 시작일부터 오늘까지의 기록을 한 번만 읽어 모든 목표를 판정합니다.
- `docs/api.md`(엔드포인트 3줄, 목표 종류 표와 판정 규칙), `backend/src/openapi.ts` → `npm run openapi`.

## 변경 — feat: 나의 목표 화면

- `frontend/src/cardio-goals.tsx`(새 파일): 근력 목표 아래 "유산소 목표" 영역.
  - 카드: 상태(달성 완료·도전 중·시작 전·기간 종료), 제목(예: "주간 러닝 15 km", "러닝 5 km 30:00 이내"), 기간 누적은 이번 주(달) 값/목표값과 진행 막대, "달성한 주 n / 전체 m주". 기록 목표는 가장 빠른 기록·가장 긴 거리.
  - "유산소 목표 추가" 창: 목표 종류·운동 종류·기간 단위와 그 종류의 목표값만 보입니다. 시간은 분·초 두 칸입니다. 저장 전에 공유 스키마로 검사해 칸마다 오류를 보여 줍니다.
  - 처음 불러오는 동안 #173과 같은 자리 표시(`aria-busy` 영역), 불러오기 실패는 "다시 연결" 배너입니다.
- `frontend/src/app.tsx`: 나의 목표 화면에 `CardioGoals`를 붙이고 머리글 설명에 유산소를 넣었습니다(두 곳).
- 운동 종류 이름과 시간 형식(`28:30`)은 #115의 `frontend/src/cardio/format.ts`(agent2, 아직 병합 전)와 같은 값을 이 파일 안에 따로 두었습니다. #115가 병합되면 그쪽으로 합칩니다. `frontend/src/cardio/*`와 운동 일지 화면은 건드리지 않았습니다.
- 운동 종류·목표 종류 선택은 루틴 폼과 같은 이유로 브라우저 기본 `select`입니다.

## 1차 리뷰

- 필수 지적 없음. 판정(주·월 경계, 걸친 주기, 오늘·종료일), 스키마와 DB CHECK 일치, 응답 형태를 확인했습니다.
- 반영(선택):
  - 분·초가 음수·소수·60초 이상이어도 초로 합쳐져 저장됐습니다. 분은 0 이상 정수, 초는 0~59 정수인지 먼저 검사합니다. 오류 표시(`aria-invalid`)는 초 칸에도 붙입니다.
  - 목표 종류를 바꾸면 숨겨진 칸의 이전 오류가 남았습니다. 종류를 바꿀 때 오류를 지웁니다.
  - 종료일 상한이 없어 9999년 주간 목표면 조회마다 주기 약 41만 개를 만들었습니다. 목표 기간을 5년 이하로 막았습니다(스키마·DB).
  - `docs/api.md`의 "종료일은 시작일 이후"를 "같거나 이후"로 고쳤습니다.
- 테스트: 5년 경계(스키마), 초 90 입력 막기와 초 칸 `aria-invalid`(화면)를 더했습니다.

## 범위 밖

- 다음 목표 제안(D6): #251로 나눴습니다.
- 백업·복원에 유산소 목표 넣기: [#253](https://github.com/sirloinbh/workout-memo/issues/253)으로 나눴습니다. 지금 백업 파일에는 유산소 목표가 없습니다.
- 심박존 2 누적 시간(D1): 세션 평균 심박만 있어 계산할 수 없습니다.

## 테스트

- 추가: `backend/test/cardio-goals.test.ts` 9개(DB 없음): 주·월 주기, 미달·정확히 달성·초과(소수 합 1 m 단위), 일요일/월요일 경계, 기록 없음, 걸친 주와 종료 후, 미래·다른 종류·거리 없는 기록 제외, 기록 시간(D5)·최장 거리, 스키마의 종류별 목표값 규칙과 한국어 조사.
- 추가: `backend/test/cardio-goals.integration.test.ts` 2개(PostgreSQL): 등록·저장 값·저장된 기록으로 판정·종료일 순·삭제·404·잘못된 ID 400, 잘못된 모양 400과 DB CHECK.
- 추가: `frontend/src/cardio-goals.test.tsx` 3개: 카드의 상태·진행률·달성 주기·기록, 종류별 목표값만 보내기(종류 없는 기록 목표는 화면에서 막음, 분·초 → 초), 삭제.
- `e2e/support/ui-fixtures.ts`(공통 e2e 도우미): `/api/cardio-goals` 고정 데이터를 실제 판정 함수로 만들어 더했습니다. 없으면 나의 목표 화면이 404 오류를 보입니다.
- 통과: 판정 단위 테스트 9건, api-contract·openapi·contract·migrations 테스트, frontend 관련 6개 파일, `typecheck`(backend·frontend·e2e), eslint·prettier(바꾼 파일). 통합 테스트는 이 PC에 PostgreSQL이 없어 CI에서 확인합니다. 로컬 전체 `npm run check`·e2e는 메모리 부족으로 돌리지 않았습니다.
- 시각 기준선: 나의 목표(goals) 4장이 바뀝니다. CI 이미지를 확인한 뒤 갱신합니다.

## 변경 — test: 시각 기준선 갱신

- `b5146de`의 CI `e2e-visual`에서 goals 4장과 goal-editor 4장만 실패했고 나머지 82건(터치·반응형·axe 포함)은 통과했습니다.
- 390px·1280px 이미지를 확인했습니다. 근력 목표 아래 "유산소 목표" 영역에 진행 중 주간 거리(이번 주 5.2 km / 15 km, 진행 막대, 달성한 주 1 / 전체 3주), 달성한 5 km 기록(가장 빠른 기록 29:10), 기간이 끝난 주간 횟수 목표가 보이고 넘침은 없습니다. goal-editor는 뒤 배경의 머리글 설명 문구만 바뀌었습니다. `visual-baselines` 아티팩트로 8장을 갱신했습니다.

## 변경 — refactor: #115 표시 함수로 합치기 (병합 후 후속)

- #115(#252)가 병합되어 `frontend/src/cardio/format.ts`가 main에 들어왔습니다. `cardio-goals.tsx`에 따로 두었던 운동 종류 이름과 시간 형식(`28:30`)을 지우고 `cardioKindLabels`, `formatDuration`을 씁니다.
- 거리도 `formatDistance`를 써서, 운동 종류가 정해진 목표는 유산소 기록 화면과 같이 표시합니다(수영은 m). 종류가 "전체"인 목표는 km 그대로입니다.
- `cardio/*` 파일은 바꾸지 않았습니다.
- 리뷰 반영: 수영은 m로 보이지만 입력은 km라, 수영을 고르면 거리 칸 이름이 "목표 거리 (km, 1,500 m는 1.5)"가 됩니다.
- 테스트: 수영 목표가 "수영 한 번에 1,500 m", "가장 긴 거리 1,200 m"로 보이는지 확인하는 화면 테스트 1개를 더했습니다(`cardio-goals.test.tsx` 4건 통과). 고정 데이터는 러닝·전체 목표라 시각 기준선은 바뀌지 않을 것으로 봅니다.
