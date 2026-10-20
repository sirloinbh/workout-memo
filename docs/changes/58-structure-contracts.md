# #58 마이그레이션 이력·기능별 백엔드 구조·REST 계약 문서

- 이슈: [#58](https://github.com/sirloinbh/workout-memo/issues/58) (로드맵 [#3](https://github.com/sirloinbh/workout-memo/issues/3) 2단계 구조·계약)
- 브랜치: `chore/58-structure-contracts`

## 목적

- 마이그레이션 적용 이력이 없어 기존 볼륨에 어떤 파일이 적용됐는지 알 수 없었다. 사용자는 파일마다 psql 명령을 직접 실행했고, Windows PowerShell 파이프는 한글을 손상시켰다(#55).
- API 라우트 대부분이 `backend/src/app.ts` 한 파일(590줄)에 있었다. 요청·응답 계약은 README와 database/README에 흩어져 있었다.

## 변경 — 2026-10-20

### 마이그레이션 이력

- `backend/src/migrations.ts`
  - 파일명 형식(`NNN_name.sql`)과 번호 중복을 검사한다.
  - 체크섬은 SHA-256으로 계산하며, CRLF·UTF-8 BOM 차이는 무시한다.
  - 계획 단계에서 미적용 파일을 고르고 다음 오류를 찾는다: 내용 변경, 파일 누락, 이미 적용한 번호보다 앞선 새 파일.
  - 실행 단계는 advisory lock을 잡고, 파일 하나와 이력 행을 한 트랜잭션으로 적용한다. 상태 조회는 이력 테이블을 만들지 않는 읽기 전용이다.
- `backend/src/migrate.ts` CLI와 npm 스크립트
  - 루트에서 `npm run db:migrate`, `npm run db:migrate -- --status`로 실행한다.
  - backend 스크립트는 `tsx --env-file-if-exists=../.env src/migrate.ts`이다. 이미 설정된 `DATABASE_URL`이 `.env`보다 우선한다.
- 이력 테이블: `schema_migrations(name, checksum, applied_at)`.
- 기존 001~009는 모두 재실행해도 안전하다. 그래서 이력이 없는 기존 DB에서는 첫 실행 때 전체를 다시 적용하며 기준선으로 기록한다. 기존 데이터는 바뀌지 않는다.
- 빈 볼륨은 Docker의 `docker-entrypoint-initdb.d` 초기화를 그대로 유지했다. 대신 새 마이그레이션도 재실행 안전하게 작성해야 한다는 규칙을 database/README와 AGENTS.md에 명시했다.
- CI는 파일별 psql 반복문 대신 `npm run db:migrate`로 스키마를 준비한다.

### 기능별 백엔드 구조

- `app.ts`의 라우트를 다음 모듈로 옮겼다. `app.ts`는 등록 순서만 담당한다.
  - `backend/src/routes/routines.ts`
  - `machines.ts`
  - `workouts.ts`
  - `body-measurements.ts`
  - `goals.ts`
  - `analysis.ts`
  - `shared.ts`(`id`, `seoulTodaySql`, 공통 오류 처리)
- 바꾸지 않은 것: 라우트 등록 순서, 백업 라우트를 JSON 파서보다 먼저 등록하는 순서, SQL, 응답, 오류 메시지.
- 옮기기 전 `app.ts`의 모든 줄이 새 모듈에 있는지 기계적으로 비교했다. 남은 차이는 import 목록과 `export`를 붙인 선언뿐이다.
- `backup.ts`는 로직과 라우트가 한 파일에 있고 테스트가 직접 import하므로 위치를 유지했다.

### REST 계약 문서

- `docs/api.md`에 다음을 정리했다: 공통 규칙(JSON, 날짜 `YYYY-MM-DD`·Asia/Seoul, 총중량 kg·NULL), 오류 형식 `{ error }`와 상태 코드, 30개 엔드포인트 표, 주요 요청 본문, 변경 절차.
- `backend/test/api-contract.test.ts`는 Express 라우터 스택에서 실제 등록된 메서드·경로를 읽어 문서 표와 양방향으로 비교한다.

### 문서

- 마이그레이션 절차를 다음 문서에 반영했다: database/README(적용·상태·실패 복구·작성 규칙), README(실행·검증 절차), AGENTS.md(검증 명령, 스키마·라우트 변경 규칙).
- `skills/workout-foundation/references/stack.md`에 도입 상태를 기록하고 `npm run skills:sync`로 `.claude/skills/`를 갱신했다.

## 테스트

추가한 테스트:

- `backend/test/migrations.test.ts` (단위 5개)
  - 체크섬이 줄바꿈·BOM을 무시하고 내용 변경은 감지
  - 저장소 마이그레이션 파일 이름·순서와 한글 UTF-8 읽기
  - 잘못된 이름·번호 중복 거부
  - 적용 이력 이후 파일만 대기로 분류
  - 내용 변경·파일 누락·앞선 번호 오류 보고
- `backend/test/migrations.integration.test.ts` (DB 3개, 테스트마다 임시 스키마 생성 후 삭제)
  - 빈 스키마: 상태 조회가 이력 테이블을 만들지 않음, 전체 적용과 이력 기록, 한글 시드, 재실행 시 0개
  - 이력 없는 기존 스키마: 기준선 기록 후 기존 세트의 총중량·RPE·완료 상태 보존
  - 실패: 체크섬 변경 시 중단, 실패한 파일은 테이블과 이력이 남지 않음, advisory lock 해제
- `backend/test/api-contract.test.ts` (2개): 문서 표와 등록 라우트의 양방향 일치, 모든 경로가 `/api` 아래인지

실행 결과:

- 실행 환경: Node 24.21.0 / npm 11.19.0, 전용 테스트 DB(`workout-memo-agent-test-db`, 127.0.0.1:55434)
- 위 테스트만 실행: 마이그레이션 8개, 계약 2개 모두 pass
- 테스트 DB에 `npm run db:migrate` 실행: 이력이 없는 기존 DB에 001~009를 기준선으로 기록했다. 두 번째 실행 결과는 "적용할 마이그레이션이 없습니다."였다.
- `npm run check`: **EXIT=0**
  - format:check, lint, typecheck, build 통과
  - 앱·DB 테스트 **349 pass / 0 fail / 0 skip**
  - 워커 테스트 **212 pass / 0 fail / 0 skip**
  - 스킬 테스트 **4 pass / 0 fail / 0 skip**
- 화면 변경이 없어 브라우저 검증은 하지 않았다.
- skill-creator의 `quick_validate.py`는 실행하지 못했다. Python에 PyYAML이 없어 import 단계에서 실패했고, 패키지는 설치하지 않았다. 스킬 쪽 변경은 `references/stack.md` 한 문단뿐이며 SKILL.md frontmatter는 바꾸지 않았다. 원본·복제본 일치는 `test:skills` 4 pass로 확인했다.

## 제한·후속

- 사용자의 실제 로컬 DB(`workout-memo-db-1`)에는 `db:migrate`를 실행하지 않았다. 병합 후 `npm run db:migrate -- --status`로 상태를 확인하고 `npm run db:migrate`를 실행하면 기준선이 기록된다.
- 다음은 새 npm 패키지 도입이 필요해 후속 이슈로 남긴다: OpenAPI 문서 생성, 프론트엔드·백엔드 공유 Zod 계약 패키지. 프론트엔드 구조는 로드맵 3단계에서 다룬다.
- 빈 볼륨 초기화는 계속 Docker initdb가 이력 없이 수행한다. 첫 `db:migrate`가 같은 파일을 재적용하며 기록하므로, 마이그레이션의 재실행 안전성이 계속 전제 조건이다.
