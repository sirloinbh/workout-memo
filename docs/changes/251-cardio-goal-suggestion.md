# #251 유산소 목표 달성 시 다음 목표 제안

- 이슈: [#251](https://github.com/sirloinbh/workout-memo/issues/251)
- 브랜치: `feat/251-cardio-goal-suggestion`
- 선행: #116(유산소 목표와 판정)
- 설계: 2026-11-08 사용자 결정 N1~N4([#251 댓글](https://github.com/sirloinbh/workout-memo/issues/251#issuecomment-6721368187))

## 목적

유산소 목표를 달성하면 다음 목표를 바로 세울 수 있게 서버가 다음 목표를 제안합니다. 근력 목표의 다음 목표 제안(#86)처럼 저장하지 않고 폼만 채웁니다.

## 변경 — feat: 서버 제안 계산

- `backend/src/cardio-goals.ts`: `suggestCardioGoal(goal, today)`(DB 없이 시험).
  - N1·N2: 달성한 목표의 목표값에서 올립니다(실제 기록 기준 아님).
    - 누적 거리·최장 거리: +10%, 0.1 km 단위(수영은 0.05 km = 50 m)
    - 누적 시간: +10%, 1분 단위
    - 횟수: +1회
    - 기록 시간: 목표 시간 -3%, 5초 단위. 거리는 그대로입니다.
  - 반올림해서 그대로이거나 덜 바뀌면 다음 단위로 옮깁니다(예: 0.3 km → 0.4 km, 61초 → 2분, 5 km 30:00 → 29:05).
  - N4: 종류·운동 종류·기간 단위는 같고, 시작일은 오늘(서울), 종료일은 원래 목표와 같은 길이입니다.
  - 허용 범위(거리 10000 km, 시간 31일, 횟수 1000회, 기록 시간 1초 이상)를 넘으면 `null`입니다.
- `backend/src/routes/cardio-goals.ts`: `GET /api/cardio-goals/:id/suggestion` → `{ goal_id, suggestion }`. 없는 목표 404, 잘못된 ID 400. 달성 여부와 관계없이 계산합니다(근력 제안과 같음).
- `docs/api.md`(엔드포인트 표, 규칙), `backend/src/openapi.ts` → `npm run openapi`.

## 변경 — feat: 나의 목표 화면

- `frontend/src/cardio-goals.tsx`
  - N3: "달성 완료" 카드에서만 제안을 불러와 "다음 목표: 러닝 5 km 29:05 이내" 버튼을 보여 줍니다. 제안이 없거나 불러오지 못하면 버튼을 두지 않습니다.
  - 버튼을 누르면 유산소 목표 추가 창이 제안 값으로 채워집니다(수영 거리는 m, 시간은 분·초). 저장은 사용자가 확인한 뒤에 합니다.
- `frontend/src/cardio/*` 파일은 바꾸지 않았습니다.

## 테스트

- 추가: `backend/test/cardio-goals.test.ts` 2개(DB 없음). 종류별 증가와 반올림·최소 한 단위, 수영 50 m, 날짜 길이, 제안이 API 스키마를 통과하는지, 범위를 넘으면 `null`인지 봅니다. 11 pass.
- 추가: `backend/test/cardio-goals.integration.test.ts`(PostgreSQL). 저장된 목표의 제안 값과 날짜, 404·400을 확인합니다.
- 추가: `frontend/src/cardio-goals.test.tsx` 1개. 달성 카드에만 제안 버튼이 있고(미달성 목표는 요청도 하지 않음), 누르면 폼이 채워지며, 저장 전에는 보내지 않고 저장하면 제안 값 그대로 보내는지 봅니다. 6 pass.
- api-contract·openapi 테스트, `typecheck`(backend·frontend), eslint·prettier(바꾼 파일): 통과.
- 통합 테스트는 이 PC에 PostgreSQL이 없어 CI에서 확인합니다. 로컬 전체 `npm run check`·e2e는 메모리 부족으로 돌리지 않았습니다.
- `e2e/support/ui-fixtures.ts`(공통 e2e 도우미): `/api/cardio-goals/:id/suggestion`을 실제 `suggestCardioGoal`로 답하게 더했습니다. 없으면 404라 버튼이 보이지 않습니다.
- 시각 기준선: 고정 데이터의 달성한 5 km 기록 목표에 "다음 목표" 버튼이 생겨 goals 4장이 바뀔 것으로 봅니다. CI 이미지를 확인한 뒤 갱신합니다.

## 1차 리뷰

- 필수 지적 없음. 넓은 입력 범위(거리 1 m 간격 0.001~20 km, 기록 1~4000초, 누적 시간 전 범위)에서 제안이 단위에 맞고 스키마를 통과함을 확인했습니다.
- 반영(선택):
  - 기록 시간이 5초 단위가 아니면 덜 줄었습니다(102초 → 100초). 결정 N1의 "최소 5초 단축"대로 한 단위 이상 줄입니다(102초 → 95초). 시험을 더했습니다. 올리는 값은 다음 단위 경계 이상이라는 문서 표현도 고쳤습니다.
  - 화면을 연 채 날짜가 바뀌면 어제 날짜로 시작하는 제안이 남았습니다. 날짜가 바뀌면 다시 불러옵니다.

## 변경 — test: 시각 기준선 갱신

- `876b0e6`의 CI `e2e-visual`에서 goals 4장과 goal-editor 768px 1장만 실패했고 나머지 86건은 통과했습니다.
- 390px·768px 이미지를 확인했습니다. 달성한 "러닝 5 km 30:00 이내" 카드에 "다음 목표: 러닝 5 km 29:05 이내" 버튼이 생겼고(768px 두 칸 배치에서는 두 줄로 줄바꿈), 다른 카드에는 없으며 넘침은 없습니다. goal-editor 768px은 모달 뒤 배경에 그 버튼이 보여 바뀌었습니다. `visual-baselines` 아티팩트로 5장을 갱신했습니다.
