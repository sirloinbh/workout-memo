# #114 유산소 운동 데이터 모델·API·공유 계약

- 이슈: [#114](https://github.com/sirloinbh/workout-memo/issues/114)
- 브랜치: `feat/114-cardio-model`

## 목적

유산소 목표·루틴·기록 화면(#115)과 외부 기록 가져오기(#118)가 함께 쓸 데이터 기반을 만듭니다. 이 PR은 DB·API·공유 계약·백업·CSV까지이며 화면은 만들지 않습니다. 설계는 이슈의 2026-11-08 결정(A~H)을 따릅니다.

## 변경 — feat: 유산소 기록 모델과 API

- `database/migrations/015_cardio_sessions.sql`(새 파일, 재실행 안전)
  - `cardio_sessions`: 날짜, 시작 시각(`TIME`, 서울 시각), 종류 9가지, 시간(정수 초), 거리(`NUMERIC(8,3)` km), 평균·최대 심박, 칼로리, 누적 상승 고도, 케이던스, 체감 강도, 근력 일지 연결, 출처, 외부 ID, 메모.
  - API와 같은 범위를 CHECK로도 막습니다. "오늘 이후 날짜 금지"만은 CHECK가 현재 날짜에 기대면 안 되므로 API에서만 검사합니다.
  - `workout_id`는 `workouts`를 참조하고 일지를 지우면 연결만 풀립니다(`ON DELETE SET NULL`).
  - `(source, external_id)`는 `external_id`가 있을 때만 고유한 부분 고유 인덱스입니다. `manual`은 외부 ID를 가질 수 없습니다(CHECK).
  - 날짜·연결 일지 인덱스를 둡니다. 구간(랩)·GPS 경로는 만들지 않았습니다(결정 C·D).
- `shared/contract.ts` → `npm run contract:sync`로 `backend/src/contract.ts`·`frontend/src/contract.ts`에 복제
  - `cardioKinds`(9가지), `cardioSources`(`manual`·`garmin`·`nike`·`file`), `cardioSessionObject`(필드 규칙), `checkCardioSession`(교차 필드 규칙), `cardioSessionSchema`, `cardioSessionSchemaFor(today)`(오늘 이후 날짜 금지), `CardioSessionInput`.
  - 체감 강도는 #83의 `feedbackLevels`(`hard`·`medium`·`easy`)를 그대로 씁니다.
- `backend/src/routes/cardio.ts`(새 파일), `backend/src/app.ts`에 등록
  - `GET /api/cardio-sessions?from&to[&kind]`, `GET/PUT/DELETE /api/cardio-sessions/:id`, `POST /api/cardio-sessions`.
  - 수정은 트랜잭션입니다. `BEGIN` → `SELECT … FOR UPDATE`로 행을 잠그고 → 전체 교체 `UPDATE` → `COMMIT`. 대상이 없거나 오류가 나면 `ROLLBACK`합니다.
  - "오늘"은 `createApp(pool, { today })`로 주입한 값을 씁니다(루틴과 같음). 테스트가 날짜를 고정할 수 있습니다.
  - 경로 ID는 `parseId(req.params.id, '유산소 기록')`, 없는 기록은 `sendError(res, 404, '유산소 기록을 찾을 수 없습니다')`입니다(#172 방식).
  - 페이스 `pace_sec_per_km`(초/km, 소수 1자리)와 속도 `speed_kmh`(km/h, 소수 2자리)는 저장하지 않고 조회할 때 SQL로 계산합니다. 거리가 없으면 둘 다 `null`입니다(결정 B).
- `backend/src/routes/shared.ts`의 `appErrors`에 메시지 2개를 더했습니다.
  - 외부 ID 중복(`23505`, `cardio_sessions_source_external_id_key`): 409 "같은 출처와 외부 ID의 유산소 기록이 이미 있습니다"
  - 없는 일지 연결(`23503`, `cardio_sessions_workout_id_fkey`): 400 "연결할 근력 일지가 존재하지 않습니다"

## 변경 — feat: 백업 v2와 유산소 CSV

- `backend/src/backup.ts`
  - 백업 형식 버전을 2로 올리고 `data.cardio_sessions`를 넣었습니다. v2 파일에는 이 목록이 꼭 있어야 합니다(비어 있어도 됨). v1 파일은 유산소 없는 백업으로 그대로 복원합니다. 지원하지 않는 버전 메시지는 "지원 버전: v1, v2"입니다.
  - 복원 전 검증을 넓혔습니다: 유산소 값 범위(API와 같은 규칙, 오늘 이후 검사 제외), id 중복, 백업에 없는 일지 연결, 같은 출처·외부 ID 중복.
  - 추가만(`merge`): 외부 ID가 있으면 출처+외부 ID로 기존 행과 비교합니다. 내용이 같으면 건너뛰고, 다르면 기존 값을 유지하고 충돌로 보고합니다. 외부 ID가 없으면 일지처럼 같은 내용의 기존 행을 1개씩 건너뜁니다. 일지 연결은 비교에 쓰지 않고, 복원한 기록은 복원한(또는 같은 내용이라 건너뛴 기존) 일지에 연결합니다. 이를 위해 `Seen`이 흡수한 기존 행의 id를 돌려주도록 바꿨습니다.
  - 전체 교체(`replace`): 유산소 기록도 지우고 삭제 수를 셉니다. 잠금 목록과 요약 표(`tables.cardio_sessions`)에도 넣었습니다. 검증 후 복원, 한 트랜잭션의 전부 아니면 전무 동작은 그대로입니다.
  - `GET /api/export/cardio.csv`(새 엔드포인트): 근력 CSV는 그대로 두고 유산소를 따로 내보냅니다. 같은 `toCsv`를 써서 BOM·따옴표·수식 실행 방지(`=`·`+`·`-`·`@`·탭·CR 앞에 `'`)가 같습니다.
- `frontend/src/backup.tsx`: 복원 요약에 "유산소" 줄을 더했습니다. 요약에 그 표가 없으면(이전 서버) 줄을 건너뜁니다.
- `docs/api.md`(엔드포인트 6줄, 필드 규칙, 오류 표), `database/README.md`(마이그레이션, 유산소 CSV, 백업 v2 형식·복원 규칙), `backend/src/openapi.ts`(작업 6개, `cardioQuery`) → `npm run openapi`로 `docs/openapi.json` 재생성(27 paths).

## 결정 외에 정한 값

| 항목                       | 값                                                                 |
| -------------------------- | ------------------------------------------------------------------ |
| 시간 `duration_sec`        | 1~86400(24시간)의 정수 초                                          |
| 거리 `distance_km`         | 0 초과 1000 이하, 소수점 셋째 자리까지(넘으면 반올림하지 않고 400) |
| 심박 `avg_/max_heart_rate` | 30~250 bpm 정수, 둘 다 있으면 최대 ≥ 평균                          |
| `calories_kcal`            | 0~20000 정수                                                       |
| `elevation_gain_m`         | 0~10000 m 정수                                                     |
| `avg_cadence`              | 1~300 정수(걸음/분 또는 회전/분)                                   |
| `external_id`              | 공백 제거 후 1~200자. `file` 출처는 외부 ID 없이도 저장 가능       |
| `memo`                     | 2000자 이하(머신 메모와 같음)                                      |
| 목록 정렬                  | 날짜 → 시작 시각(없으면 뒤) → id, 모두 최근 순                     |
| PUT에서 생략한 선택 값     | `null`(메모 `""`, 출처 `manual`) — 신체 기록과 같은 전체 교체      |

## 테스트

- 추가: `backend/test/cardio.test.ts` 12개(DB 없음). 스키마 검증(0·음수·소수·24시간 초과 시간, 주입한 오늘 기준 미래 날짜, 9가지 종류·4가지 출처, 심박 범위와 최대 ≥ 평균, 거리 소수 자리, 시작 시각 형식, `manual`의 외부 ID 금지)과 가짜 pool 라우트 검사(검증 실패·잘못된 ID는 조회 전 400, 등록·종류 필터·조회·삭제·404, 409·400 메시지, 수정 트랜잭션의 `BEGIN`→`SELECT FOR UPDATE`→`UPDATE`→`COMMIT`과 404·오류 때 `ROLLBACK`, 연결 반환).
- 추가: `backend/test/cardio.integration.test.ts` 4개(PostgreSQL, 테스트마다 별도 스키마). 등록·계산값·기간/종류 필터·조회·삭제, 외부 ID 중복 409와 다른 출처·`manual` 중복 허용, DB CHECK·고유 인덱스 직접 검사, 전체 교체와 409 때 롤백, 일지 연결 400과 일지 삭제 시 `workout_id` NULL.
- 수정: `backend/test/backup.test.ts`(v2 형식, v1 호환, v2 목록 누락, 유산소 참조·중복·값 검증 2개 추가), `backend/test/backup.integration.test.ts`(시드에 유산소 2개, 왕복·재복원 건너뜀·일지 연결 확인, 테이블 목록, 3개 추가: v1 복원, 같은 외부 ID 충돌 유지와 전체 교체, 유산소 CSV), `frontend/src/backup.test.tsx`(요약 "유산소" 줄, 버전 메시지 예시).
- `cd backend && ../node_modules/.bin/tsx --test test/cardio.test.ts test/api-contract.test.ts test/openapi.test.ts test/backup.test.ts test/http-errors.test.ts test/contract.test.ts test/period-api.test.ts test/migrations.test.ts test/zod4-syntax.test.ts`: 54 pass, 0 fail
- `cd frontend && ../node_modules/.bin/vitest run src/backup.test.tsx`: 6 pass
- `npm run contract:sync`, `npm run contract:check`, `npm run openapi`, `npm run typecheck -w backend`, `npm run typecheck -w frontend`, 바뀐 파일의 eslint·prettier: 통과
- `cd backend && ../node_modules/.bin/tsx --test test/cardio.integration.test.ts test/backup.integration.test.ts`: 17 fail. 모두 `ECONNREFUSED 127.0.0.1:5432`입니다. 이 PC에 `TEST_DATABASE_URL`은 있지만 PostgreSQL이 떠 있지 않아 DB 통합 테스트를 로컬에서 돌리지 못했습니다. PostgreSQL 서비스가 있는 CI `verify`로 확인합니다.
- 로컬 전체 `npm test`·`npm run check`·e2e는 메모리 부족 이력이 있어 실행하지 않았습니다.

## 한계와 남은 일

- 화면(목록·입력·분석)은 #115, 외부 기록 가져오기는 #118입니다. 구간(랩)은 #118 조사 뒤에 정합니다.
- 유산소 기록에는 일지 같은 `version`(낙관적 잠금)과 재시도 키가 없습니다. 같은 기록을 두 기기에서 고치면 나중 저장이 이깁니다.
- 연결할 일지가 같은 날짜인지는 검사하지 않습니다(존재만 검사).
- 복원(전체 잠금) 중에 근력 일지를 연결한 유산소 기록을 저장하면 잠금 순서가 엇갈려 PostgreSQL이 교착을 감지하고 한쪽을 실패시킬 수 있습니다. 복원은 전체 취소되거나 저장이 500으로 끝나며 데이터는 깨지지 않습니다.
- 수정(`PUT`)은 전체 교체라 빠진 선택 항목은 기본값이 됩니다. `source`가 빠지면 `manual`로, `external_id`가 빠지면 `null`로 바뀝니다. 가져온 기록을 화면(#115)에서 고칠 때는 `source`·`external_id`를 그대로 다시 보내야 중복 판정 키가 남습니다.
- 마이그레이션 번호 015는 이 브랜치를 만든 시점의 다음 번호입니다. 병합 전에 다른 PR이 015를 먼저 쓰면 번호를 바꿔야 합니다(`readMigrations`가 번호 중복을 막습니다).
- 이 PR은 구현을 하위 에이전트에 맡기고, 주 에이전트가 diff를 읽은 뒤 대상 테스트(`cardio`·`api-contract`·`openapi`·`backup`·`http-errors`·`contract`·`migrations`: 44 pass), `contract:check`, prettier, eslint, `test:docs`를 다시 돌려 확인했습니다.
