# REST API 계약

Workout Memo API(`backend`)의 요청·응답 규칙입니다. 일지·세트·머신·목표·신체 기록·유산소 기록의 입력 검증 원본은 [shared/contract.ts](../shared/contract.ts)의 Zod 스키마입니다. 서버(400 응답)와 화면(저장 전 항목별 오류)이 같은 스키마와 한국어 메시지를 사용합니다. 루틴 등 나머지 스키마는 [domain.ts](../backend/src/domain.ts)에 있습니다. 이 문서는 그 의미와 엔드포인트 목록을 정리합니다. 아래 엔드포인트 표는 `backend/test/api-contract.test.ts`가 실제 등록된 Express 라우트와 비교하므로, 라우트를 추가·삭제하면 이 표도 함께 고쳐야 `npm test`가 통과합니다.

## 공통 규칙

- 기본 경로는 `/api`입니다. 웹(8101)의 nginx가 `/api`를 API 컨테이너(3101)로 전달합니다. 로그인은 없고, 사용자 본인만 접근할 수 있는 로컬 주소에서 사용합니다.
- 요청·응답 본문은 JSON(UTF-8)이며 기본 요청 크기 한도는 256KB입니다. 백업 복원 요청만 10MB(+64KB)까지 받습니다.
- 날짜는 `YYYY-MM-DD` 문자열이며 실제 존재하는 날짜만 허용합니다. "오늘"은 서비스 시간대 `Asia/Seoul` 기준입니다.
- 중량(`weight`, `target_weight`, `base_weight`)은 머신 기본중량을 포함한 총중량 kg입니다. 0 이상 99999 이하이며, 확인하지 못한 기본중량은 `null`입니다. 반복 수는 1~1000의 정수입니다.
- 경로의 `:id`는 0으로 시작하지 않고 숫자만으로 된 양의 정수(최대 15자리)입니다. `1e3`, 앞뒤 공백이 붙은 `%207%20`, `07`처럼 숫자만이 아니거나 0으로 시작하면 400 `{ "error": "<대상> ID가 올바르지 않습니다" }`입니다(중앙 `standard/http.ts`의 `parseId`, #172).
- 운동 이름은 앞뒤 공백과 대소문자를 무시한 `lower(trim(name))` 기준으로 같은 운동으로 판정합니다. 목표 달성과 종목 분석이 같은 규칙을 씁니다.
- 완료하지 않은 세트(`completed=false`)는 계획으로 보관만 합니다. 목표 달성, 볼륨, PR 계산에는 반영하지 않습니다.

## 오류 형식

모든 오류 응답은 `{ "error": "<한국어 메시지>" }` 형식입니다.

| 상태 | 의미                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | 입력 검증 실패(Zod 메시지를 `, `로 연결, 최대 10개), JSON 형식 오류, 잘못된 경로 ID, 존재하지 않는 머신·브랜드·공식 참고값·근력 일지 참조, 백업 형식 오류 |
| 404  | 대상 일지·머신·루틴·신체 기록·목표·유산소 기록이 없음. 없는 `/api` 경로는 `{ "error": "요청한 API를 찾을 수 없습니다" }`                                  |
| 409  | 고유값 중복(같은 이름·날짜, 유산소의 같은 출처·외부 ID), 일지 버전 충돌, 같은 재시도 키에 다른 내용 또는 만료된 키, 루틴 휴식의 날짜·상태 조건 불일치     |
| 413  | 요청 크기 한도 초과. 백업 경로는 10MB 한도를 알려 주는 메시지, 나머지는 "요청 본문이 너무 큽니다"                                                         |
| 500  | DB 연결 오류 등 서버 오류. 응답은 `{ "error": "서버 오류가 발생했습니다" }`이고, 상세 내용은 서버 로그(`request_error`)에만 남깁니다                      |

오류 처리는 다른 앱과 같은 중앙 관리 파일 `backend/src/standard/http.ts`(sirloinbh/project-standards#309)가 맡습니다. 이 앱만의 메시지(머신·브랜드·공식 참고값·근력 일지 참조 오류, 유산소 외부 ID 중복, 백업 10MB 한도)는 `routes/shared.ts`의 `appErrors`가 먼저 처리합니다(#172).

## 엔드포인트

| 메서드 | 경로                            | 설명                                                                      |
| ------ | ------------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/health`                   | DB 연결 확인. `{ "status": "ok" }`                                        |
| GET    | `/api/brands`                   | 브랜드 목록(id 순)                                                        |
| GET    | `/api/official-machine-weights` | 제조사 공식 시작 저항 참고값. `?brand=` 선택                              |
| GET    | `/api/machines`                 | 머신 목록과 연결된 공식 참고값(최근 등록 순)                              |
| POST   | `/api/machines`                 | 머신 등록 → 201                                                           |
| PUT    | `/api/machines/:id`             | 머신 수정                                                                 |
| GET    | `/api/workouts`                 | `?from&to` 기간의 일지와 세트(최근 날짜 순)                               |
| POST   | `/api/workouts`                 | 일지 저장 → 201 `{ id, version }`. `Idempotency-Key` 선택                 |
| PUT    | `/api/workouts/:id`             | 일지 전체 교체 → `{ id, version }`. `version` 필수                        |
| DELETE | `/api/workouts/:id`             | 일지와 세트 삭제 → `{ ok: true }`                                         |
| GET    | `/api/goals`                    | 목표 목록과 서버 판정 `achieved`                                          |
| POST   | `/api/goals`                    | 목표 등록 → 201                                                           |
| DELETE | `/api/goals/:id`                | 목표 삭제 → `{ ok }`                                                      |
| GET    | `/api/routines`                 | 저장된 루틴과 84일 일정(`schedule`)                                       |
| POST   | `/api/routines`                 | 루틴 저장 → 201 `{ id }`                                                  |
| GET    | `/api/routines/:id`             | 루틴 1개와 일정                                                           |
| GET    | `/api/routine-progress`         | 진행 중 루틴의 오늘 목표·주간/12주 진행·이전 기록. 없으면 `routine: null` |
| POST   | `/api/routines/:id/rests`       | 오늘 휴식 선택 `{ date }` → 201(적용) 또는 200(이미 적용)                 |
| DELETE | `/api/routines/:id/rests/:date` | 당일 휴식 취소                                                            |
| GET    | `/api/body-measurements`        | `?from&to` 기간의 신체 기록(날짜 순)                                      |
| POST   | `/api/body-measurements`        | 신체 기록 등록 → 201. 같은 날짜는 409                                     |
| PUT    | `/api/body-measurements/:id`    | 신체 기록 전체 교체. 생략한 값은 `null`                                   |
| DELETE | `/api/body-measurements/:id`    | 신체 기록 삭제 → `{ ok: true }`                                           |
| GET    | `/api/analysis`                 | `?from&to`(최대 371일) 종목별 PR·추정 1RM·부위별 주간 운동량              |
| GET    | `/api/exercise-body-parts`      | 운동별 부위 매핑                                                          |
| PUT    | `/api/exercise-body-parts`      | 운동 1개의 부위 매핑 교체. 빈 배열은 매핑 삭제                            |
| GET    | `/api/exercise-weight-steps`    | 운동별 증량 단위(#86). 지정한 운동만                                      |
| PUT    | `/api/exercise-weight-steps`    | 운동 1개의 증량 단위 저장. `null`은 기본 5 kg으로 되돌림                  |
| GET    | `/api/goal-suggestion`          | `?exercise=`의 다음 목표 제안(저장하지 않음)                              |
| GET    | `/api/cardio-sessions`          | `?from&to` 기간의 유산소 기록(최근 순). `kind` 선택                       |
| GET    | `/api/cardio-sessions/records`  | 유산소 개인 기록(전체 기간): 종류별 최장 거리, 러닝 5km·10km 최고 기록    |
| GET    | `/api/cardio-sessions/:id`      | 유산소 기록 1개                                                           |
| POST   | `/api/cardio-sessions`          | 유산소 기록 등록 → 201. 같은 출처·외부 ID는 409                           |
| POST   | `/api/cardio-sessions/import`   | 가져온 유산소 기록 일괄 저장(전부 또는 없음) → 201. 거절 행은 `rows`로    |
| PUT    | `/api/cardio-sessions/:id`      | 유산소 기록 전체 교체(트랜잭션). 생략한 선택 값은 `null`                  |
| DELETE | `/api/cardio-sessions/:id`      | 유산소 기록 삭제 → `{ ok: true }`                                         |
| GET    | `/api/export/cardio.csv`        | 유산소 분석용 CSV(`?from&to` 선택). 복원에 사용할 수 없음                 |
| GET    | `/api/cardio-goals`             | 유산소 목표 목록과 서버 판정 `achieved`·`progress`                        |
| POST   | `/api/cardio-goals`             | 유산소 목표 등록 → 201                                                    |
| DELETE | `/api/cardio-goals/:id`         | 유산소 목표 삭제 → `{ ok: true }`                                         |
| GET    | `/api/export/workouts.csv`      | 분석용 CSV(`?from&to` 선택). 복원에 사용할 수 없음                        |
| GET    | `/api/backup`                   | 복원용 JSON 백업 파일                                                     |
| POST   | `/api/backup/preview`           | 복원 미리보기(같은 절차 후 ROLLBACK)                                      |
| POST   | `/api/backup/restore`           | 복원 실행. `mode: "replace"`는 `confirm: "전체 교체"` 필수                |

## 주요 요청 본문

### 일지 `POST /api/workouts`, `PUT /api/workouts/:id`

```json
{
  "version": 3,
  "date": "2026-10-20",
  "title": "하체",
  "notes": "",
  "feedback": "medium",
  "sets": [
    {
      "exercise": "스쿼트",
      "machine_id": null,
      "weight": 100.25,
      "reps": 5,
      "notes": "",
      "completed": true,
      "rpe": 8.5
    }
  ]
}
```

- `title`과 `exercise`는 공백을 제거한 뒤 1~120자, `notes`는 4000자 이하입니다. 세트는 1~200개이며 배열 순서대로 저장합니다.
- `completed`를 생략하면 `true`(기존 클라이언트 호환)입니다. `rpe`는 `null` 또는 1~10의 0.5 단위입니다. 화면은 #83부터 RPE를 입력받지 않으며, 저장된 값은 수정 시 그대로 다시 보냅니다.
- `feedback`(#83)은 일지 전체의 체감으로 `hard`(힘듦)·`medium`(중간)·`easy`(쉬움) 또는 `null`(미입력)입니다. 생략하면 `null`로 저장합니다. 자동 이중 진행 루틴은 목표를 달성한 세션이라도 그 세션 기간 안에 해당 운동이 든 일지가 `hard`이면 다음 세션 목표를 유지합니다.
- `version`은 PUT에서만 필수입니다. 조회한 값과 다르면 409이며 성공하면 1 증가합니다.
- `Idempotency-Key`(UUID) 헤더를 보내면 첫 성공 커밋부터 7일 동안 같은 요청에 같은 응답을 재전송합니다. 저장 형식은 [database/README.md](../database/README.md)를 참고하세요.

### 머신 `POST /api/machines`, `PUT /api/machines/:id`

`{ "brand_id": 1, "name": "레그 프레스", "base_weight": null, "notes": "", "official_weight_id": 12 }`

- `official_weight_id`는 공식 참고값 연결입니다. `base_weight`를 바꾸지 않습니다. 수정 요청에서 생략하면 기존 연결을 유지하고, `null`을 보내면 연결을 해제합니다.
- `single_joint`(#84, boolean)는 단관절 운동 머신 여부입니다. 등록 시 생략하면 `false`, 수정 시 생략하면 기존 값을 유지합니다. 화면의 휴식 타이머가 세트 완료 시 단관절 기본 휴식을 고르는 데 씁니다.

### 목표 `POST /api/goals`

`{ "exercise": "벤치프레스", "target_weight": 80, "target_reps": 5, "start_date": "2026-10-01", "deadline": "2026-12-31" }`

- `deadline`은 `start_date`보다 앞설 수 없습니다. `achieved`는 기간 안에(오늘 이후 날짜 제외) 같은 운동의 완료 세트 1개가 중량과 반복 수를 모두 충족하면 `true`입니다.

### 증량 단위 `PUT /api/exercise-weight-steps`, 목표 제안 `GET /api/goal-suggestion` (#86)

`{ "exercise": "벤치프레스", "weight_step": 2.5 }`

- 운동 식별은 목표 판정과 같은 정규화 이름(대소문자·앞뒤 공백 무시)입니다. `weight_step`은 0 초과 100 kg 이하, 소수점 둘째 자리까지이며 `null`이면 설정을 지워 기본 5 kg으로 돌아갑니다.
- 자동 이중 진행 루틴(이미 저장된 루틴 포함)은 반복 상한을 넘으면 총중량을 이 값만큼 올립니다. 0 kg(맨몸) 운동은 반복 수만 늘립니다.
- `GET /api/goal-suggestion?exercise=벤치프레스` → `{ exercise, weight_step, custom, base, target_weight }`. `base`는 그 운동의 가장 최근 목표(`source: "goal"`), 없으면 가장 최근 일지의 가장 무거운 완료 세트(`source: "record"`)이며 둘 다 없으면 `null`(`target_weight`도 `null`)입니다.

### 신체 기록 `POST /api/body-measurements`, `PUT /api/body-measurements/:id`

`{ "date": "2026-10-20", "body_weight_kg": 72.4, "body_fat_percent": null, "skeletal_muscle_kg": 33.1 }`

- 세 값 중 하나 이상이 필요하고 소수점 둘째 자리까지만 받습니다. 셋째 자리 이상은 반올림하지 않고 400으로 거부합니다.

### 유산소 기록 `POST /api/cardio-sessions`, `PUT /api/cardio-sessions/:id` (#114)

```json
{
  "date": "2026-11-08",
  "start_time": "07:30",
  "kind": "running",
  "duration_sec": 1800,
  "distance_km": 5.25,
  "avg_heart_rate": 152,
  "max_heart_rate": 171,
  "calories_kcal": 380,
  "elevation_gain_m": 35,
  "avg_cadence": 168,
  "effort": "medium",
  "workout_id": null,
  "source": "manual",
  "external_id": null,
  "memo": ""
}
```

- 필수는 `date`, `kind`, `duration_sec`입니다. 나머지는 생략하면 `null`(메모는 `""`, 출처는 `manual`)이며 0으로 채우지 않습니다. PUT은 전체 교체라 생략한 선택 값이 `null`이 됩니다.
- `date`는 실제 날짜이고 오늘(`Asia/Seoul`) 이후면 400 "유산소 기록 날짜는 오늘 이후로 입력할 수 없습니다"입니다. 근력 일지는 계획 기록 때문에 미래 날짜를 허용하므로 둘이 다르게 동작합니다. 이 규칙은 오늘 날짜가 필요해 OpenAPI 스키마에는 없습니다.
- `start_time`은 서울 시각 `HH:MM`(00:00~23:59)입니다.
- `kind`: `running`(러닝)·`walking`(걷기)·`outdoor_cycling`(실외 사이클)·`indoor_cycling`(실내 자전거)·`rowing`(로잉)·`stairs`(계단)·`elliptical`(일립티컬)·`swimming`(수영)·`other`(기타).
- `duration_sec`는 1~86400(24시간)의 정수 초입니다. `distance_km`는 모든 종류에서 km이며 0 초과 1000 이하, 소수점 셋째 자리(1 m)까지입니다. 수영은 화면에서만 m로 보여 줍니다.
- 심박 `avg_heart_rate`·`max_heart_rate`는 30~250 bpm 정수이고 둘 다 있으면 최대가 평균 이상이어야 합니다. `calories_kcal` 0~20000, `elevation_gain_m`(누적 상승 고도) 0~10000 m, `avg_cadence` 1~300(걸음/분 또는 회전/분)의 정수입니다. `memo`는 2000자 이하입니다.
- `effort`(체감 강도)는 일지 피드백(#83)과 같은 `hard`·`medium`·`easy` 또는 `null`입니다.
- `workout_id`는 같은 날 근력 일지와의 선택 연결입니다. 없는 일지면 400 "연결할 근력 일지가 존재하지 않습니다"이고, 일지를 지우면 연결만 `null`이 됩니다.
- `source`는 `manual`·`garmin`·`nike`·`file`이고 `external_id`는 가져온 기록의 원본 ID(공백 제거 후 1~200자)입니다. `manual`에는 `external_id`를 넣을 수 없습니다(400). 같은 `source`와 `external_id`가 이미 있으면 409 "같은 출처와 외부 ID의 유산소 기록이 이미 있습니다"이며, `external_id`가 `null`인 기록끼리는 중복으로 보지 않습니다.
- 응답은 저장한 필드와 `id`, `created_at`, `updated_at`, 계산값 `pace_sec_per_km`(초/km, 소수 1자리)·`speed_kmh`(km/h, 소수 2자리)입니다. 계산값은 저장하지 않고 조회할 때 SQL로 계산하며 거리가 없으면 둘 다 `null`입니다.
- 목록 `GET /api/cardio-sessions?from&to[&kind]`는 날짜·시작 시각 최근 순입니다. 없는 기록은 404 "유산소 기록을 찾을 수 없습니다", 잘못된 경로 ID는 400 "유산소 기록 ID가 올바르지 않습니다"입니다.
- 구간(랩·인터벌)과 GPS 경로는 저장하지 않습니다(요약값만).

### 유산소 기록 가져오기 `POST /api/cardio-sessions/import` (#119)

```json
{
  "sessions": [
    {
      "date": "2026-11-02",
      "start_time": "07:10",
      "kind": "running",
      "duration_sec": 1210,
      "distance_km": 4.006,
      "source": "file",
      "external_id": "2026-11-01T22:10:05Z"
    }
  ]
}
```

- 활동 파일(TCX·GPX)에서 읽은 기록을 한 번에 저장합니다. 파일은 브라우저에서 읽고 요약값만 보내며 원본 파일은 서버로 보내지 않습니다.
- 행마다 `POST /api/cardio-sessions`와 같은 규칙으로 검증하고, 출처는 `manual`이 아니어야 하며 `external_id`가 있어야 합니다. 한 번에 1~200건입니다.
- 한 트랜잭션으로 모두 저장하거나 하나도 저장하지 않습니다(2026-11-08 사용자 결정 3). 성공은 201 `{ "sessions": [저장한 기록…] }`입니다.
- 거절하면 아무것도 저장하지 않고 행 번호(`index`, 0부터)별 이유를 함께 돌려줍니다. 검증 실패와 요청 안의 같은 활동(같은 `source`·`external_id`)은 400, 이미 저장된 같은 출처·외부 ID는 409입니다.

```json
{
  "error": "1건에 문제가 있어 아무것도 저장하지 않았습니다",
  "rows": [{ "index": 0, "message": "이미 가져온 활동입니다" }]
}
```

- 출처가 다른 중복 후보(같은 날짜·시작 ±2분·거리 ±1%)는 거절하지 않습니다. 화면이 미리보기에서 기본 해제로 묻고, 사용자가 고르면 저장합니다.

### 유산소 개인 기록 `GET /api/cardio-sessions/records` (#115)

```json
{
  "longest": [
    { "kind": "running", "id": 12, "date": "2026-10-26", "distance_km": 21.1, "duration_sec": 7380 }
  ],
  "best5k": { "id": 9, "date": "2026-11-02", "distance_km": 5.02, "duration_sec": 1470 },
  "best10k": null
}
```

- 기간과 상관없이 저장된 모든 기록에서 찾습니다. 받는 입력이 없어 400이 없습니다.
- `longest`: 거리가 있는 종류마다 가장 긴 기록 1개입니다. 순서는 `kind` 목록 순(러닝 먼저)이고 거리가 없는 종류는 빠집니다. 같은 거리면 날짜가 이른 기록입니다.
- `best5k`·`best10k`: 러닝 중 거리가 5km·10km의 ±2%(4.9~5.1 km, 9.8~10.2 km, 경계 포함)인 기록에서 전체 시간이 가장 짧은 기록입니다. 더 긴 기록의 시간을 페이스로 줄여 추정하지 않습니다(2026-11-08 사용자 결정 4). 해당 기록이 없으면 `null`이고, 같은 시간이면 날짜가 이른 기록입니다.
- 이 경로는 `/api/cardio-sessions/:id`보다 먼저 등록해 `records`가 ID로 읽히지 않습니다.

### 유산소 목표 `GET`·`POST /api/cardio-goals`, `DELETE /api/cardio-goals/:id` (#116)

- 근력 목표(`/api/goals`)와 따로 저장합니다. 판정 기준은 2026-11-08 사용자 결정입니다(#116 댓글).
- `goal_type`과 필요한 목표값:

| `goal_type`        | 뜻                                | `period`            | 목표값                                      | `kind`                |
| ------------------ | --------------------------------- | ------------------- | ------------------------------------------- | --------------------- |
| `distance`         | 기간마다 거리 합계                | `week`·`month` 필수 | `target_distance_km`                        | 선택(`null`이면 전체) |
| `duration`         | 기간마다 시간 합계                | 필수                | `target_duration_sec`                       | 선택                  |
| `count`            | 기간마다 기록 횟수                | 필수                | `target_count`                              | 선택                  |
| `record_time`      | 한 기록이 거리 이상을 시간 이내에 | `null`              | `target_distance_km`, `target_duration_sec` | 필수                  |
| `longest_distance` | 한 기록의 최장 거리               | `null`              | `target_distance_km`                        | 필수                  |

- 그 종류에 쓰지 않는 목표값은 `null`이어야 합니다(400). 범위: 거리 0 초과 10000 km 이하·소수점 셋째 자리, 시간 1~2678400초(31일), 횟수 1~1000. 종료일은 시작일과 같거나 이후이고, 목표 기간은 5년(1826일) 이하입니다.
- 판정(조회할 때마다 서버가 계산, 저장하지 않음):
  - 시작일~종료일과 오늘(서울) 사이의 유산소 기록만 셉니다. `kind`가 있으면 그 종류만 셉니다. 거리 없는 기록은 거리 목표에서만 빠집니다.
  - 기간 누적: 주(월~일)·달력 월마다 판정합니다. 시작·종료일에 걸친 주기도 목표 기간 안의 기록만 세고 목표값은 그대로입니다. `progress`는 `{ kind: "period", current, periods, periods_achieved }`이고, `periods`의 각 주기는 `{ start, end, value, achieved }`(`start`·`end`는 달력 주기, `value`는 km·초·횟수)입니다. `current`는 오늘이 든 주기이며 시작 전·종료 후에는 `null`입니다. `achieved`는 `current`의 달성 여부입니다.
  - 기록 목표: `record_time`은 거리 ≥ 목표 거리인 한 기록의 전체 시간이 목표 시간 이하일 때 달성입니다(페이스로 추정하지 않음). `longest_distance`는 가장 긴 한 기록이 목표 거리 이상일 때 달성입니다. `progress`는 `{ kind: "record", best }`(가장 빠른 시간 초 또는 가장 긴 거리 km, 없으면 `null`)입니다.
- 없는 목표는 404 "유산소 목표를 찾을 수 없습니다", 잘못된 경로 ID는 400입니다.

### 루틴, 백업

루틴 계획 형식은 [domain.ts](../backend/src/domain.ts)의 `routineSchema`를 따릅니다. 수동 진행에서는 12주 변화량이 필수이며, `progression: "auto"`에서는 반복 범위가 필수입니다. 일정은 `schedule_mode`로 고릅니다(#88). `cycle`이면 `cycle: { train_days, rest_days }`(운동일 1~7, 휴식일 0~7)를 시작일부터 반복하고 `rest_days`(요일)는 빈 배열이어야 합니다. 생략하거나 `weekday`이면 기존처럼 휴식 요일과 주당 운동 횟수의 합이 7입니다. 운동마다 선택 필드 `machine_id`로 머신을 지정할 수 있고(#82), 존재하지 않는 머신이면 400입니다. 오늘 목표(`today_plan.target.exercises`)는 `machine_id`(없으면 `null`)를 함께 돌려주며, 새 일지는 이 값으로 세트를 채웁니다. 부위는 가슴·등·어깨·이두·삼두·하체-앞·하체-뒤·복근이며, 이전에 저장한 `팔`도 계속 허용합니다. 백업 파일 형식과 복원 규칙은 [database/README.md의 앱 내보내기·백업](../database/README.md#앱-내보내기백업-33)을 따릅니다.

## 변경 절차

1. 공유 입력 스키마는 `shared/contract.ts`에서 바꾸고 `npm run contract:sync`로 `backend/src/contract.ts`·`frontend/src/contract.ts`에 복제합니다(복제본 직접 수정 금지, `npm run check`가 불일치를 실패 처리). 그 밖의 스키마는 `domain.ts`(또는 기능 모듈)에서 바꾸고, 해당 기능의 단위·DB 통합 테스트를 함께 고칩니다.
2. 라우트는 `backend/src/routes/<기능>.ts`에 둡니다. 백업 라우트는 별도 요청 크기 한도 때문에 `backup.ts`에서 JSON 파서보다 먼저 등록합니다.
3. 이 문서의 엔드포인트 표와 해당 요청 규칙을 갱신합니다. 표가 실제 라우트와 다르면 `api-contract.test.ts`가 실패합니다.
4. `backend/src/openapi.ts`의 `operations`(요청 스키마·상태 코드)를 맞추고 `npm run openapi`로 [openapi.json](openapi.json)을 다시 생성해 커밋합니다. 오래된 파일은 `openapi.test.ts`가 실패로 처리합니다.
5. 기존 클라이언트를 깨는 변경(필드 삭제, 의미 변경)은 이슈에 영향과 이전 방법을 적은 뒤 진행합니다.

프론트엔드·백엔드 공유 Zod 계약은 #64에서 복제 방식으로 도입했습니다. 각 영역이 Docker와 subtree 저장소에서 따로 빌드되므로 workspace 패키지 대신 복제본을 둡니다.

## OpenAPI

[openapi.json](openapi.json)(OpenAPI 3.1)은 등록된 라우트, 이 문서의 엔드포인트 설명, 서버 Zod 스키마에서 생성합니다(#68, `npm run openapi`). 요청 본문·조회 매개변수·경로 변수와 필드 제약(필수, 범위, 길이, 정수, 날짜 형식, null 허용, 기본값)을 담습니다. 응답 본문 스키마와 교차 필드 규칙(종료일 ≥ 시작일, RPE 0.5 단위, 루틴 주차 규칙 등)은 JSON Schema로 옮기지 않았으므로 이 문서의 설명을 따릅니다.
