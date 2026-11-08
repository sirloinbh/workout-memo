# #172 백엔드 오류 응답을 중앙 공통 HTTP 파일로 맞추기

- 이슈: [#172](https://github.com/sirloinbh/workout-memo/issues/172)
- 브랜치: `fix/172-http-errors`

## 목적

다른 7개 앱과 같은 중앙 관리 파일 `backend/src/standard/http.ts`(sirloinbh/project-standards#309, 이미 동기화됨)로 오류 응답을 맞춥니다. 그동안 세 가지가 달랐습니다.

- 없는 `/api` 경로에 Express 기본 HTML 404가 나갔습니다.
- 경로 ID를 `z.coerce.number()`로 읽어 `"1e3"`, `" 7 "`도 ID로 받았습니다.
- 목표 삭제 대상이 없으면 `404 { ok: false }`였습니다. 다른 오류는 `{ error }` 형식입니다.

## 변경 — fix: 중앙 오류 처리로 교체

- `backend/src/routes/shared.ts`: 앱 자체 `errorHandler`와 `id()`를 지웠습니다. 이 앱만의 메시지를 담당하는 `appErrors`만 남기고, 나머지는 `next(err)`로 중앙 `errorHandler`에 넘깁니다. 남긴 메시지는 세 가지입니다.
  - `23503`(공식 참고값 FK): "선택한 공식 참고값이 존재하지 않습니다"
  - `23503`(그 밖): "선택한 머신 또는 브랜드가 존재하지 않습니다"
  - `413`(백업 경로만): "요청 크기 제한을 초과했습니다 (백업 파일은 최대 10MB)."
- `backend/src/app.ts`: 모든 기능 라우트 뒤에 `app.use('/api', notFound)`, `appErrors`, 중앙 `errorHandler`를 차례로 둡니다.
- `routes/body-measurements.ts`·`goals.ts`·`machines.ts`·`routines.ts`·`workouts.ts`: `id(req.params.id)` 9곳을 `parseId(req.params.id, '<대상>')`로 바꿨습니다. 대상은 신체 기록·목표·머신·루틴·일지입니다. 잘못된 ID는 DB 조회 전에 400 "<대상> ID가 올바르지 않습니다"가 됩니다.
- `routes/goals.ts`: 삭제 대상이 없으면 404 `{ error: '목표를 찾을 수 없습니다' }`입니다. 성공은 그대로 200 `{ ok: true }`입니다.
- `backend/src/openapi.ts`, `docs/openapi.json`: 경로 ID를 받는 작업 중 400이 빠져 있던 6곳에 400을 넣고 `npm run openapi`로 다시 만들었습니다. 6곳은 `DELETE` workouts·goals·body-measurements, `GET /api/routines/:id`, 루틴 휴식 두 작업입니다. 예전 `z.coerce`도 400을 냈지만 문서에 없었습니다.
- `docs/api.md`: ID 규칙, 없는 `/api` 경로의 404, 500 메시지, 중앙 파일과 `appErrors`의 역할을 적고, `DELETE /api/goals/:id`의 `{ ok: false }` 예외 문단을 지웠습니다.

## 바뀌는 응답

| 경우                                            | 이전                                                       | 이후                                               |
| ----------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| 없는 `/api` 경로                                | 404 HTML                                                   | 404 `{ "error": "요청한 API를 찾을 수 없습니다" }` |
| `1e3`, 앞뒤 공백이 붙은 `%207%20`, `07` 같은 ID | 통과(숫자로 바뀜) 또는 Zod 메시지                          | 400 `{ "error": "<대상> ID가 올바르지 않습니다" }` |
| 없는 목표 삭제                                  | 404 `{ "ok": false }`                                      | 404 `{ "error": "목표를 찾을 수 없습니다" }`       |
| 깨진 JSON 본문                                  | 400 "요청 형식을 확인하세요"                               | 400 "요청 본문의 JSON 형식이 올바르지 않습니다"    |
| 서버 오류(DB 연결 등)                           | 500 "저장소에 연결할 수 없습니다. 서버 상태를 확인하세요." | 500 "서버 오류가 발생했습니다"                     |

## 화면 영향

- `shared/` 계약은 바꾸지 않았습니다. 화면 코드도 고치지 않았습니다.
- 화면의 `api()`(`frontend/src/app.tsx`)는 실패하면 응답의 `error`를 그대로 보여 줍니다. 그래서 바뀌는 곳은 두 군데입니다.
  - 나의 목표 화면: 이미 지워진 목표를 삭제하면 "요청에 실패했습니다" 대신 "목표를 찾을 수 없습니다"가 보입니다.
  - 모든 화면: 서버 오류 때 보이는 문구가 "서버 오류가 발생했습니다"가 됩니다.
- 이 문구들을 확인하는 화면 테스트는 없었습니다.

## 테스트

- 추가: `backend/test/http-errors.test.ts`에 5개를 넣었습니다. DB 대신 가짜 pool을 써서 테스트 DB 없이도 돕니다.
  - 없는 `/api` 경로가 JSON 404입니다.
  - `1e3`·앞뒤 공백이 붙은 `%207%20`·`0`·`-1`·`1.5`·`abc`·`07` ID가 DB 조회 없이 대상 이름이 든 400입니다.
  - 없는 목표 삭제는 404 `{ error }`이고, 있으면 200 `{ ok: true }`입니다.
  - `23503` 두 메시지와 500 메시지가 나오고, 내부 메시지는 응답에 넣지 않습니다.
  - 깨진 JSON 본문은 400입니다.
- `tsx --test test/http-errors.test.ts`: 5 pass
- 관련 파일 묶음(`http-errors`, `api-contract`, `openapi`, `period-api`, `workout-validation`, `machines`, `body-measurements`, `goals`, `backup`): 86개 중 82 pass, 4 fail. 실패 4개는 `goals.test.ts`의 DB 통합 테스트입니다. 이 PC에 `TEST_DATABASE_URL`은 있지만 PostgreSQL이 떠 있지 않아 `ECONNREFUSED 127.0.0.1:5432`로 실패했습니다. 이 묶음에 넣지 않은 `backup.integration.test.ts`에는 바뀐 동작을 확인하는 단언이 있었습니다(아래 1차 리뷰 보완). DB 통합 테스트는 PostgreSQL 서비스가 있는 CI `verify`로 확인합니다.
- `npm run typecheck -w backend`, eslint, prettier, `npm run standards:check`(통과, 경고 없음): 통과
- 로컬 전체 `npm test`·`npm run check`는 메모리 부족 이력이 있어 끝까지 돌리지 않았습니다. 백엔드 전체 테스트를 한 번 시작했지만 10분이 넘어 멈췄습니다. 전체 검사는 CI로 확인합니다.

## 변경 — fix: 1차 리뷰 보완

- (필수) `backend/test/backup.integration.test.ts`의 깨진 JSON 사례가 예전 문구(`/요청 형식/`)를 기대해, PostgreSQL이 있는 CI `verify`에서 실패할 상태였습니다. 이 PC에서는 DB가 꺼져 있어 놓쳤습니다. 중앙 문구 "요청 본문의 JSON 형식이 올바르지 않습니다"로 바꿨습니다. 위 테스트 절의 "바뀐 동작을 확인하는 단언이 없다"는 처음 기록도 바로잡았습니다. 다른 테스트·화면·e2e에서 예전 문구를 기대하는 곳은 없습니다.
- (선택) 413: 예전에는 256kb 일반 요청에도 "백업 파일은 최대 10MB" 문구가 나갔습니다. 이제 `/api/backup/` 경로에만 앱 문구를 쓰고, 나머지는 중앙 "요청 본문이 너무 큽니다"로 넘깁니다. `docs/api.md`의 413 줄에도 적었습니다.
- (선택) 문서의 ID 예시: 마크다운에서 앞뒤 공백이 사라져 `7`이 정상 ID인 `7`로 보였습니다. "앞뒤 공백이 붙은 `%207%20`"으로 풀어 썼습니다. "1로 시작하는"도 "0으로 시작하지 않는"으로 바로잡았습니다.
- (선택) `http-errors.test.ts`에 2개를 더했습니다.
  - 먼저 등록된 `/api/health`와 백업 라우트가 JSON 404에 가려지지 않는지 확인합니다. 백업 라우트는 깨진 본문이 와도 처리기까지 가야 합니다. 그 밖에 없는 백업 경로가 404인지, 루틴 휴식의 잘못된 ID가 400인지도 봅니다.
  - 256kb를 넘는 일반 요청은 중앙 413 문구로 답하는지 확인합니다.
- `tsx --test test/http-errors.test.ts test/api-contract.test.ts test/openapi.test.ts`: 13 pass. eslint, prettier 통과
