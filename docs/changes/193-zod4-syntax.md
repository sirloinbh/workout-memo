# #193 검증 코드를 zod 4 문법으로 옮기기

- 이슈: [#193](https://github.com/sirloinbh/workout-memo/issues/193)
- 브랜치: `chore/193-zod4-syntax`

## 목적

중앙 `sirloinbh/project-standards#386`의 1단계다. 중앙이 `zod`를 4.6.7로 올릴 때 이 앱이 깨지지 않도록 코드를 먼저 옮긴다. 보안 권고 GHSA-mrhx-c7xc-m3w5의 Dependabot 알림은 그 동기화로 닫힌다. 이 PR만으로는 닫히지 않는다.

## 변경 — 2026-11-01

- `shared/contract.ts`와 백엔드 파일이 `zod/v4`에서 불러온다. 설치된 3.25.76에 이 경로가 있어 패키지와 잠금 파일은 바꾸지 않았다.
- `required_error`, `invalid_type_error`, `errorMap`을 `error`로 옮겼다. `.finite()`는 zod 4에서 아무 일도 하지 않아 지웠다.
- 문자열 길이 검사를 `limitLength`(`.refine`)로 옮겼다. zod 4의 `.min()`, `.max()`는 타입 검사가 실패해도 `.length`가 있는 입력이면 돌아, `title: []`에 길이 문구가 덧붙는다. 한도는 `.meta`에 남겨 OpenAPI 문서에 그대로 나온다.
- `backend/src/openapi.ts`가 `_def` 대신 `_zod.def`를 읽는다. `z.toJSONSchema`는 결과 형태가 달라 쓰지 않았다.
- 재시도 키는 `z.guid()`로 검사한다. zod 4의 `uuid()`는 `00000000-0000-0000-0000-000000000001` 같은 키를 거절해, 이미 쓰던 키가 400이 될 수 있다.
- 복원 요청의 `backup`을 `.optional()`로 적었다. 4.6.7에서는 `z.unknown()` 필드가 없으면 거절돼, 한국어 안내 대신 영어 오류가 나오기 때문이다.
- 백업 시각은 `z.iso.datetime({ offset: true })`로 옮겼다. 배열 길이 제한(`.max()`)은 그대로다.

## 해당 없는 항목

- `z.record`, `.partial()`, `.merge()`, `.email()`, `.url()`, `ZodError.errors`는 쓰지 않는다. `{"constructor":null}`이 `z.record`에서 500이 되는 3.25.76 문제는 해당 없다. 주요 쓰기 API 4개에 넣어 400을 확인하는 테스트를 넣었다.
- PATCH 라우트가 없고 `.default().optional()` 조합도 없다. 빠진 선택 필드가 기본값으로 채워지지 않는지 테스트로 확인한다.

## 비교 결과

전환 전 스키마(zod 3.25.76)와 전환 후 스키마를 입력 12,489개로 비교했다. 전환 후는 `zod/v4`(3.25.76)와 `node_modules/knip/node_modules/zod`(4.6.7) 두 가지로 돌렸다. 입력은 모든 필드에 잘못된 값, 빈 값, 큰 값, Infinity, `constructor` 키(null, 숫자, 객체)를 넣은 것이다.

| 분류 | 3.25.76 `zod/v4` | 4.6.7 |
|---|---:|---:|
| 합격 여부, 파싱 값, 메시지가 모두 같음 | 3,434 | 3,453 |
| zod 기본 영어 문구만 다름 | 8,774 | 8,902 |
| 같은 문구가 반복되는 횟수만 다름 | 22 | 22 |
| 첫 문구는 같고 뒤 문구가 줄어듦 | 10 | 10 |
| 영어 문구가 다르고 교차 검사 문구도 달라짐 | 236 | 86 |
| 합격 여부가 다름 | 13 | 16 |

합격한 입력의 파싱 값 차이는 두 버전 모두 없다. 값이 달라지면 재시도 키의 지문도 달라지므로 이 항목을 따로 확인했다. 모든 입력에서 스키마가 예외를 던지지 않았다.

**OpenAPI:** `npm run openapi` 결과가 `docs/openapi.json`과 바이트까지 같다. 4.6.7로 만든 문서도 내용이 같다.

## 바뀌는 응답

모두 잘못된 입력에 대한 것이고, 화면이 보내는 값에서는 나오지 않는다.

**zod 기본 영어 문구.** 한국어 문구를 지정하지 않은 곳은 문구가 zod 4의 것으로 바뀐다. 문자열 길이 문구만 `limitLength`가 zod 3 문구를 유지한다.

| 전 | 후 |
|---|---|
| `Required` | `Invalid input: expected number, received undefined` |
| `Expected string, received number` | `Invalid input: expected string, received number` |
| `Number must be greater than or equal to 1` | `Too small: expected number to be >=1` |
| `Array must contain at most 6 element(s)` | `Too big: expected array to have <=6 items` |
| `Invalid enum value. Expected 'a' \| 'b', received 'c'` | `Invalid option: expected one of "a"\|"b"` |
| `Unrecognized key(s) in object: 'x'` | `Unrecognized key: "x"` |
| `Invalid datetime` | `Invalid ISO datetime` |
| `Invalid uuid` | `Invalid GUID` |

**한국어 문구가 함께 달라지는 경우.**

- 정수 검사(`.int()`)가 실패하면 뒤 검사를 멈춘다. `reps: 0.5`의 응답이 같은 문구 두 번에서 한 번으로 줄고, 객체 단위 교차 검사 문구(예: `분할 개수를 확인하세요`)가 빠진다.
- 배열 필드에 `.length`가 있는 다른 타입이 오면 길이 문구가 덧붙는다. 예: `sets: ""`는 영어 타입 문구 뒤에 `세트를 1개 이상 입력하세요`가 붙는다. 배열 제한을 그대로 두려고 고치지 않았다.
- Infinity(`1e999`)는 타입 단계에서 거절돼 뒤의 `.refine`이 돌지 않는다. 첫 문구는 전환 전과 같게 맞췄고, 뒤에 붙던 문구는 빠진다. 예: 체중은 `체중은 유한한 숫자여야 합니다` 하나만 나온다.
- 3.25.76 `zod/v4`에서만: 날짜가 형식 오류이면 `조회 종료일은 시작일 이후여야 합니다`가 빠지고, `weeks`나 `cycle` 안쪽 값이 범위를 벗어나면 `1~12주차 목표를 입력하세요` 같은 문구가 덧붙는다. 4.6.7에서는 이 차이가 사라진다.
- 4.6.7에서만: `rest_days` 길이 초과 때 `휴식 요일과 주당 운동 횟수를 확인하세요`가 빠진다.

**합격 여부가 달라지는 경우.** 전에는 통과했고 이제 400이다.

- `Number.MAX_SAFE_INTEGER`를 넘는 정수(`id`, `brand_id`, `machine_id`, `version`, 경로의 id). 전에는 DB에서 범위 오류로 실패했을 값이다.
- 백업 시각의 `+0900` 형식(콜론 없는 시차), 4.6.7에서는 `2026-01-05T01:02Z`(초 없는 형식)도 거절한다. 이 앱이 내보낸 백업은 `toISOString()` 또는 `pg`의 Date 직렬화 형식이라 해당하지 않지만, 손으로 고친 백업은 거절될 수 있다.

## 검증

- `npm run format:check`, `lint`, `contract:check`, `typecheck`, `test:skills`, `test:docs`, `build`: 통과.
- 백엔드 테스트: 215개 통과, 35개 건너뜀(`TEST_DATABASE_URL`을 비워 DB 통합 테스트 제외, CI에서 확인).
- 프런트엔드 테스트: `--testTimeout 60000`으로 178개 통과, 4개 건너뜀. 기본 5초 제한으로는 이 PC에서 전환 전 main도 8개가 시간 초과 등으로 실패했다.
- `zodResolver`: `@hookform/resolvers` 5.9.1이 `zod/v4` 스키마를 타입 검사와 `forms.test.tsx`에서 받는다. 패키지는 올리지 않았다.
- 폼 타입: `WorkoutInput`, `GoalInput`이 타입 검사를 통과한다. `z.coerce`는 경로 id에만 쓰여 폼과 관계없다.
- 프런트엔드 번들: 618.40 kB(gzip 190.86)에서 613.24 kB(gzip 191.59)로 바뀌었다.
- 4.6.7은 위 비교와 OpenAPI 문서만 확인했다. 타입 검사, `zodResolver`, 전체 테스트는 중앙 동기화 PR의 CI로 확인한다.
