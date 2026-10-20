# #68 라우트·Zod 스키마 기반 OpenAPI 문서 생성

- 이슈: [#68](https://github.com/sirloinbh/workout-memo/issues/68) (로드맵 [#3](https://github.com/sirloinbh/workout-memo/issues/3) 2단계 잔여)
- 브랜치: `docs/68-openapi`. #66(PR #67) 위에 쌓았다. 병합 순서는 #59 → #61 → #63 → #65 → #67 → 이 PR이다.

## 목적

REST 계약은 사람용 표(`docs/api.md`)와 공유 Zod 계약에만 있었다. 도구가 읽을 수 있는 OpenAPI 문서가 없었다.

## 변경 — 2026-10-20

- `backend/src/openapi.ts`
  - `jsonSchema`: API가 쓰는 Zod v3 형식만 JSON Schema로 바꾼다.
    - 지원 형식: object, string, number, boolean, array, enum, nullable, optional, default, effects, unknown.
    - 지원하지 않는 형식이나 검사 조건을 만나면 오류로 중단한다.
    - 새 패키지는 없다. Zod v4의 `toJSONSchema`는 v3 스키마와 섞을 수 없고 오류 처리(`instanceof ZodError`)도 바꿔야 해서 쓰지 않았다.
  - `operations`: 30개 라우트마다 요청 본문 스키마·조회 매개변수·상태 코드·응답 형식·재시도 키 헤더를 정의한 표.
  - `buildOpenApi`
    - 실제 등록된 Express 라우트를 읽는다. 표와 다르면 오류로 중단한다.
    - 경로 변수(`{id}`는 정수 1 이상, `{date}`는 날짜 형식), 조회 매개변수, 요청 본문(`components.schemas`), 공통 오류 `Error { error }`를 만든다.
  - `routeDescriptions`: `docs/api.md` 표의 설명을 각 오퍼레이션의 summary로 쓴다.
- `backend/src/openapi-cli.ts`, `npm run openapi`
  - `docs/openapi.json`을 생성한다. 경로 22개, 오퍼레이션 30개, 스키마 9개다.
  - 생성 파일은 `.prettierignore`에 넣어 생성기 출력을 그대로 비교한다.
- 오퍼레이션 표에서 쓰려고 기존 인라인 조회 스키마에 이름을 붙여 export했다: `analysisQuery`(routes/analysis.ts), `exportQuery`·`restoreRequest`(backup.ts). 검증 동작은 바뀌지 않았다.
- `docs/api.md`(변경 절차 4번, OpenAPI 절)와 AGENTS.md(API 라우트 변경 규칙)를 갱신했다.

## 테스트

`backend/test/openapi.test.ts` (4개):

- 커밋된 `docs/openapi.json`이 현재 라우트·스키마·설명으로 생성한 결과와 같다. 다르면 `npm run openapi`를 안내하며 실패한다.
- 등록 라우트 수와 오퍼레이션 수가 같고, 모든 오퍼레이션에 summary가 있다. 경로 변수 `id`·`date`와 날짜 pattern도 확인한다.
- 일지·목표 스키마가 서버 제약을 유지한다.
  - 일지: 필수 필드, 세트 1~200개, 총중량 0~99999, 반복 수 1~1000 정수, RPE null 허용·기본값, 완료 기본값 true
  - 목표: 필수 필드
- 지원하지 않는 Zod 형식(`z.date()`)과 표에 없는 라우트는 오류로 중단한다.

실행 결과(Node 24.21.0, 전용 테스트 DB):

| 검사                       | 결과                           |
| -------------------------- | ------------------------------ |
| `npm run check`            | **EXIT=0**                     |
| 백엔드 node:test (DB 포함) | **279 pass / 0 fail / 0 skip** |
| 프론트 Vitest              | 89 pass / 0 fail               |
| `docker build ./backend`   | 성공                           |

화면 변경이 없어 e2e는 다시 실행하지 않았다(이전 PR #67 기준 2 passed).

## 제한·후속

- 응답 본문 스키마는 없다. 응답 Zod 스키마가 정의되어 있지 않아서다. 응답 형식은 `docs/api.md` 설명을 따른다.
- refine 규칙(종료일 ≥ 시작일, RPE 0.5 단위, 루틴 주차·분할 규칙, 신체 기록 소수점 둘째 자리)은 JSON Schema에 나타나지 않는다.
- Swagger UI처럼 문서를 보여주는 화면은 제공하지 않는다.
