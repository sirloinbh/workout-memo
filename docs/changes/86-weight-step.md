# #86 점진적 과부하 증량 단위 기본 5kg과 사용자 지정 값

- 이슈: [#86](https://github.com/sirloinbh/workout-memo/issues/86)
- 브랜치: `feat/86-weight-step`
  - `feat/84-rest-by-exercise` 위에서 시작했다. 마이그레이션 번호(010 → 011 → 012) 순서를 지키기 위해서다.
  - #91(#83) → #92(#84) → 이 PR 순서로 병합해야 한다.

## 결정 — 2026-10-21

- 목표 제안과 자동 이중 진행 루틴 모두에 적용한다.
- 사용자 지정 값은 운동별로 둔다.
- 이미 저장된 자동 루틴에도 새 규칙을 적용한다. 그래서 진행 중 루틴의 예상 목표가 바뀔 수 있다.

## 설계

- "운동별"과 "기존 루틴에도 적용"을 함께 만족하도록, 증량 단위를 루틴 계획(jsonb)이 아니라 운동별 설정 테이블에 둔다.
  - 키는 #32 부위 지정·목표 판정과 같은 정규화 운동명이다.
  - 그래서 모든 루틴·목표가 같은 값을 쓰고, 계획을 다시 저장하지 않아도 반영된다.
- 서버는 계산 직전에 계획의 운동마다 `weight_step`을 붙인다(`withWeightSteps`). 이 값은 계획에 저장하지 않는다.
- 편집 위치
  - 나의 목표 → 목표 추가에서 운동명을 입력하면 "이 운동의 증량 단위"를 바꾸고 바로 저장한다.
  - 루틴짜기는 운동별 값을 표시만 한다.

## 변경

- DB `012_exercise_weight_steps.sql`: `exercise_weight_steps(exercise PK, weight_step numeric(6,2) 0 초과 100 이하)`. 재실행해도 안전하다.
- 계약 `weightStepSchema`, `defaultWeightStep = 5`
  - 0 초과, 100 kg 이하, 소수점 둘째 자리까지 허용한다.
  - `null`이면 기본값으로 되돌린다.
- API (`backend/src/routes/weight-steps.ts`)
  - `GET /api/exercise-weight-steps`: 지정한 운동별 증량 단위
  - `PUT /api/exercise-weight-steps`: 저장하거나, `null`이면 삭제한다.
  - `GET /api/goal-suggestion?exercise=`
    - 그 운동의 가장 최근 목표를 기준으로 하고, 없으면 가장 최근 일지의 가장 무거운 완료 세트를 기준으로 한다.
    - 기준에 증량 단위를 더해 제안한다. 둘 다 없으면 `base: null`이다. 아무것도 저장하지 않는다.
- 자동 이중 진행 (`backend/src/progress.ts`, `frontend/src/progression.ts`)
  - 반복 상한을 넘으면 `weight_step`(기본 5 kg)만큼 올린다.
  - 이전 "약 5%(2.5 kg 단위, 최소 2.5 kg)" 규칙(`incrementFor`)은 제거했다.
  - 맨몸(0 kg)은 기존처럼 반복 수만 늘리고, 디로딩(직전 목표의 90%, 2.5 kg 단위)도 그대로다.
  - `/api/routine-progress`(휴식 선택·취소 응답 포함)는 저장된 증량 단위를 적용한 계획으로 계산한다.
- 화면
  - 목표 추가 폼에 "다음 목표 제안"을 추가했다.
    - 제안 표시와 "제안 적용"(목표 총중량 채우기)
    - 이 운동의 증량 단위 입력·저장(계약으로 먼저 검증), 기본값으로 되돌리기
  - 루틴짜기: 미리보기가 운동별 증량 단위를 쓴다. 저장된 계획 보기에 `증량 단위 N kg`를 표시하고, 규칙 설명을 바꿨다.
- 문서: `docs/api.md`, `database/README.md`, `README.md`, `docs/openapi.json`

## 테스트

- `backend/test/weight-steps.test.ts` (신규)
  - 계약 경계(0, 100.01, 소수 셋째 자리, 문자열)
  - DB 통합
    - 기록이 없으면 제안하지 않는다. 미완료 세트를 제외하고 최근 일지의 가장 무거운 세트를 기준으로 한다.
    - 증량 단위를 저장하면 제안에 반영된다. 목표가 있으면 목표를 우선한다.
    - 이미 저장된 자동 루틴의 다음 세션이 2.5 kg 증량을 쓴다. 기본값으로 되돌리면 5 kg로 돌아간다.
- `backend/test/routine-progression.test.ts`
  - 5% 규칙 테스트를 "기본 5 kg, 운동별 단위(2.5·1.25·10 kg), 맨몸 유지"로 바꿨다.
  - 덤벨 컬·2분할 스쿼트의 기대 순서를 5 kg 기준으로 갱신했다. 2.5 kg로 지정하면 이전 순서가 나오는 것도 확인한다.
  - 화면 미리보기 동등성 테스트가 계약의 기본값을 받도록 `require` 대역을 넘긴다.
- `frontend/src/goal-suggestion.test.tsx` (신규)
  - 제안 표시와 적용
  - 증량 단위 저장 후 제안 갱신, 잘못된 값은 보내지 않음, 기본값으로 되돌리기
  - 기준이 없을 때 안내
- `frontend/src/routines.test.tsx`: 미리보기 기대값(40 kg → 45 kg, +5 kg)을 갱신했다.

## 검증 — 2026-10-21

- `npm run check`(Node 24.21.0, `TEST_DATABASE_URL`=로컬 전용 테스트 DB) 통과
  - 백엔드 293 pass, 0 skip(DB 통합 포함)
  - 프론트 99 pass
  - 워커 162, skills 4, docs 3, build 통과
  - 첫 실행은 `routine-progression.integration.test.ts`의 덤벨 컬 5주차 기대값(5% 규칙 기준 45x9)에서 실패했다. 5 kg 규칙의 값(50x9)으로 고쳐 다시 실행해 통과했다.
- `npm run test:e2e`(같은 테스트 DB): 4 passed. 이번 변경에 e2e를 추가하지 않았다.

## 제한·후속

- 증량 단위는 앱 백업(JSON)에 포함하지 않는다. #32 부위 지정과 같은 기존 범위다.
- 증량 단위를 바꾸는 곳은 목표 추가 폼뿐이다. 루틴짜기·종목 분석에서 바로 바꾸는 기능은 필요하면 따로 추가한다.
- 기존 자동 루틴은 사용자 결정에 따라 5 kg 기준으로 다시 계산되므로, 진행 중 루틴의 이후 예상 목표가 이전 표시와 다를 수 있다.
