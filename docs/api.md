# REST API 계약

Workout Memo API(`backend`)의 요청·응답 규칙입니다. 일지·세트·머신·목표·신체 기록의 입력 검증 원본은 [shared/contract.ts](../shared/contract.ts)의 Zod 스키마입니다. 서버(400 응답)와 화면(저장 전 항목별 오류)이 같은 스키마와 한국어 메시지를 사용합니다. 루틴 등 나머지 스키마는 [domain.ts](../backend/src/domain.ts)에 있습니다. 이 문서는 그 의미와 엔드포인트 목록을 정리합니다. 아래 엔드포인트 표는 `backend/test/api-contract.test.ts`가 실제 등록된 Express 라우트와 비교하므로, 라우트를 추가·삭제하면 이 표도 함께 고쳐야 `npm test`가 통과합니다.

## 공통 규칙

- 기본 경로는 `/api`입니다. 웹(8088)의 nginx가 `/api`를 API 컨테이너(3001)로 전달합니다. 로그인은 없고, 사용자 본인만 접근할 수 있는 로컬 주소에서 사용합니다.
- 요청·응답 본문은 JSON(UTF-8)이며 기본 요청 크기 한도는 256KB입니다. 백업 복원 요청만 10MB(+64KB)까지 받습니다.
- 날짜는 `YYYY-MM-DD` 문자열이며 실제 존재하는 날짜만 허용합니다. "오늘"은 서비스 시간대 `Asia/Seoul` 기준입니다.
- 중량(`weight`, `target_weight`, `base_weight`)은 머신 기본중량을 포함한 총중량 kg입니다. 0 이상 99999 이하이며, 확인하지 못한 기본중량은 `null`입니다. 반복 수는 1~1000의 정수입니다.
- 경로의 `:id`는 양의 정수입니다. 형식이 맞지 않으면 400입니다.
- 운동 이름은 앞뒤 공백과 대소문자를 무시한 `lower(trim(name))` 기준으로 같은 운동으로 판정합니다. 목표 달성과 종목 분석이 같은 규칙을 씁니다.
- 완료하지 않은 세트(`completed=false`)는 계획으로 보관만 합니다. 목표 달성, 볼륨, PR 계산에는 반영하지 않습니다.

## 오류 형식

모든 오류 응답은 `{ "error": "<한국어 메시지>" }` 형식입니다.

| 상태 | 의미                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| 400  | 입력 검증 실패(Zod 메시지를 `, `로 연결), JSON 형식 오류, 존재하지 않는 머신·브랜드·공식 참고값 참조, 백업 형식 오류      |
| 404  | 대상 일지·머신·루틴·신체 기록이 없음                                                                                      |
| 409  | 고유값 중복(같은 이름·날짜), 일지 버전 충돌, 같은 재시도 키에 다른 내용 또는 만료된 키, 루틴 휴식의 날짜·상태 조건 불일치 |
| 413  | 요청 크기 한도 초과                                                                                                       |
| 500  | DB 연결 오류 등 서버 오류. 상세 내용은 서버 로그(`request_error`)에만 남기고 응답에는 넣지 않습니다                       |

예외: `DELETE /api/goals/:id`는 대상이 없을 때 404와 함께 `{ "ok": false }`를 반환합니다.

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

### 신체 기록 `POST /api/body-measurements`, `PUT /api/body-measurements/:id`

`{ "date": "2026-10-20", "body_weight_kg": 72.4, "body_fat_percent": null, "skeletal_muscle_kg": 33.1 }`

- 세 값 중 하나 이상이 필요하고 소수점 둘째 자리까지만 받습니다. 셋째 자리 이상은 반올림하지 않고 400으로 거부합니다.

### 루틴, 백업

루틴 계획 형식은 [domain.ts](../backend/src/domain.ts)의 `routineSchema`를 따릅니다. 수동 진행에서는 12주 변화량이 필수이며, `progression: "auto"`에서는 반복 범위가 필수입니다. 운동마다 선택 필드 `machine_id`로 머신을 지정할 수 있고(#82), 존재하지 않는 머신이면 400입니다. 오늘 목표(`today_plan.target.exercises`)는 `machine_id`(없으면 `null`)를 함께 돌려주며, 새 일지는 이 값으로 세트를 채웁니다. 백업 파일 형식과 복원 규칙은 [database/README.md의 앱 내보내기·백업](../database/README.md#앱-내보내기백업-33)을 따릅니다.

## 변경 절차

1. 공유 입력 스키마는 `shared/contract.ts`에서 바꾸고 `npm run contract:sync`로 `backend/src/contract.ts`·`frontend/src/contract.ts`에 복제합니다(복제본 직접 수정 금지, `npm run check`가 불일치를 실패 처리). 그 밖의 스키마는 `domain.ts`(또는 기능 모듈)에서 바꾸고, 해당 기능의 단위·DB 통합 테스트를 함께 고칩니다.
2. 라우트는 `backend/src/routes/<기능>.ts`에 둡니다. 백업 라우트는 별도 요청 크기 한도 때문에 `backup.ts`에서 JSON 파서보다 먼저 등록합니다.
3. 이 문서의 엔드포인트 표와 해당 요청 규칙을 갱신합니다. 표가 실제 라우트와 다르면 `api-contract.test.ts`가 실패합니다.
4. `backend/src/openapi.ts`의 `operations`(요청 스키마·상태 코드)를 맞추고 `npm run openapi`로 [openapi.json](openapi.json)을 다시 생성해 커밋합니다. 오래된 파일은 `openapi.test.ts`가 실패로 처리합니다.
5. 기존 클라이언트를 깨는 변경(필드 삭제, 의미 변경)은 이슈에 영향과 이전 방법을 적은 뒤 진행합니다.

프론트엔드·백엔드 공유 Zod 계약은 #64에서 복제 방식으로 도입했습니다. 각 영역이 Docker와 subtree 저장소에서 따로 빌드되므로 workspace 패키지 대신 복제본을 둡니다.

## OpenAPI

[openapi.json](openapi.json)(OpenAPI 3.1)은 등록된 라우트, 이 문서의 엔드포인트 설명, 서버 Zod 스키마에서 생성합니다(#68, `npm run openapi`). 요청 본문·조회 매개변수·경로 변수와 필드 제약(필수, 범위, 길이, 정수, 날짜 형식, null 허용, 기본값)을 담습니다. 응답 본문 스키마와 교차 필드 규칙(종료일 ≥ 시작일, RPE 0.5 단위, 루틴 주차 규칙 등)은 JSON Schema로 옮기지 않았으므로 이 문서의 설명을 따릅니다.
