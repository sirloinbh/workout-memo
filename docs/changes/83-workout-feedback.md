# #83 일지 체감 피드백(힘듦·중간·쉬움)

- 이슈: [#83](https://github.com/sirloinbh/workout-memo/issues/83)
- 브랜치: `feat/83-workout-feedback` (main `cc6f510`에서 시작, #82 PR과 독립)

## 결정 — 2026-10-21

이슈의 "확인 필요" 항목은 사용자 답변으로 정했다([이슈 댓글](https://github.com/sirloinbh/workout-memo/issues/83#issuecomment-6306323774)).

- 피드백은 세트마다가 아니라 일지(운동 1회)마다 하나를 남긴다.
- RPE 입력은 피드백으로 대체한다. 화면에서 RPE 입력을 없애고, 이미 저장된 RPE 데이터와 API 필드는 보존한다.
- 자동 이중 진행에 반영한다. 목표를 달성한 세션이라도, 그 세션 기간 안에 해당 운동이 든 일지가 '힘듦'이면 다음 세션은 같은 목표를 유지한다. 중간·쉬움·미입력은 기존처럼 한 단계 진행한다.

## 변경

- DB: `010_workout_feedback.sql`
  - `workouts.feedback text`를 추가했다. 값은 NULL 또는 `hard|medium|easy`이고, `workouts_feedback_check`로 검증한다.
  - `ADD COLUMN IF NOT EXISTS`라 재실행해도 안전하다. 기존 일지는 NULL로 남는다.
- 공유 계약 `shared/contract.ts`
  - `feedbackLevels`와 `workoutSchema.feedback`(nullable, 기본 null)을 추가했다. 오류 메시지는 `체감 피드백은 힘듦·중간·쉬움 중에서 선택하세요`이다.
  - `npm run contract:sync`로 복제본을 갱신했다.
- 일지 API `POST/PUT /api/workouts`
  - `feedback`을 저장·수정한다. 조회(`w.*`)에도 포함된다.
  - 피드백을 보내지 않는 기존 클라이언트의 PUT은 NULL로 저장한다. 계약 기본값과 같다.
  - 재시도 키 지문: `feedback`이 null이면 #83 이전과 같은 지문을 쓴다. 그래서 배포 전에 저장된 재시도 키(7일)의 재전송이 "요청 내용이 다릅니다"(409)로 바뀌지 않는다.
- 자동 이중 진행 (`backend/src/progress.ts`, `routes/routines.ts`)
  - `WorkoutRecord`에 일지의 `feedback`을 싣는다.
  - 세션 기간 안의 해당 운동 기록 중 하나라도 `hard`이면, 달성했더라도 다음 단계 대신 유지(`hold`)한다. 판정 결과(`result`)는 그대로 `achieved`이다.
- 백업·CSV
  - 백업의 일지에 `feedback`을 포함한다. 이 필드가 없는 기존 v1 백업은 null로 검증·복원한다.
  - 일지 중복 판정에는 `feedback`을 넣지 않았다. 피드백만 다른 같은 일지가 중복 생성되지 않게 하기 위해서다.
  - CSV 마지막에 `workout_feedback` 열을 추가했다. 기존 열 위치는 그대로다.
- 화면 `frontend/src/app.tsx`
  - 일지 편집에 "체감 피드백 (선택)" 3단계 버튼 그룹을 둔다. `.tabs` 스타일을 재사용하고 `aria-pressed`를 쓴다.
  - 선택한 단계를 다시 누르면 미입력(null)으로 돌아간다.
  - 세트별 RPE 입력과 안내 문구를 없앴다. 기록 목록에는 `체감 힘듦`처럼 표시한다. 기존 RPE 표시는 유지한다.
  - 초안 검증이 잘못된 피드백 값을 거부한다.
- 문서: `docs/api.md`, `database/README.md`(마이그레이션·CSV 열·백업 형식), `docs/openapi.json` 재생성

## 테스트

- `backend/test/workout-feedback.test.ts` (신규)
  - 계약: 미입력은 null이다. 세 값만 허용하고 잘못된 값은 거부한다.
  - API: 잘못된 값은 쓰기 전에 400을 돌려준다.
  - DB 통합: 저장 → 변경 → 피드백 없는 PUT으로 null
- `backend/test/routine-progression.test.ts`
  - 달성했는데 `hard`이면 유지하고, `medium`·`easy`·null이면 진행한다.
  - 세션 기간 밖의 `hard`는 영향이 없다.
- `backend/test/routine-progression.integration.test.ts`: 실제 DB의 일지를 `hard`로 수정하면 이후 세션 목표가 한 단계 낮게 예상된다. 라우트 쿼리가 `w.feedback`을 읽는지 확인한다.
- `backend/test/migrations.integration.test.ts`: 기존 일지는 NULL이며 잘못된 값은 DB CHECK가 거부한다.
- `backend/test/backup.test.ts`, `backup.integration.test.ts`
  - 피드백이 없는 백업은 null로 검증하고, 잘못된 값은 거부한다.
  - 내보내기 → 복원 왕복에서 `feedback`이 보존된다.
  - CSV `workout_feedback` 열을 확인한다.
- `frontend/src/set-completion.test.tsx`: 기존 RPE 입력 시나리오를 피드백으로 바꿨다.
  - 초안을 복구하면 선택한 피드백이 유지된다.
  - 다시 누르면 null로 돌아가고, RPE 입력란은 없다.
  - 기존 RPE가 있는 일지를 수정해도 RPE를 보존한다. 목록에 피드백을 표시한다.

## 검증 — 2026-10-21

- `npm run check`(Node 24.21.0, `TEST_DATABASE_URL`=로컬 전용 테스트 DB) 통과
  - 백엔드 284 pass, 0 skip(DB 통합 포함)
  - 프론트 90 pass
  - 워커 162, skills 4, docs 3, build 통과
  - 첫 실행은 새 테스트 파일의 타입 단언 오류(TS2352)로 typecheck에서 실패했다. 수정 후 다시 실행해 통과했다.
- `npm run test:e2e`(`E2E_DATABASE_URL`=같은 테스트 DB): 4 passed. 이번 변경에 e2e를 추가하지 않았다. 기존 일지 CRUD 흐름이 피드백 미입력으로 그대로 동작하는지 확인했다.

## 제한·후속

- 기존 문제(이번 범위 밖): 백업의 세트에는 `completed`·`rpe`가 들어 있지 않다. 그래서 복원하면 미완료(계획) 세트가 완료로 저장되고 RPE가 사라진다. 별도 이슈로 고치는 것이 좋다.
- 로컬 개인 DB(55432)에는 마이그레이션을 적용하지 않았다. 병합 후 `npm run db:migrate`로 적용한다. 운영은 배포 스크립트가 자동으로 마이그레이션한다.
