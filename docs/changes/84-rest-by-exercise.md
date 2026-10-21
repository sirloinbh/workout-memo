# #84 운동 종류별 기본 휴식 시간(하체 2분30초·상체 2분·단관절 1분30초)

- 이슈: [#84](https://github.com/sirloinbh/workout-memo/issues/84)
- 브랜치: `feat/84-rest-by-exercise`
  - `feat/83-workout-feedback` 위에서 시작했다. 두 이슈 모두 마이그레이션을 추가하므로 번호(010·011) 순서를 지키기 위해서다.
  - #83 PR을 먼저 병합해야 하며, 그전까지 이 PR의 diff에는 #83 커밋이 함께 보인다.

## 결정 — 2026-10-21

- 단관절 여부는 머신 속성이다. 머신 라이브러리에서 사용자가 지정한다.
- 우선순위는 단관절 > 하체 > 상체이다. 예를 들어 레그 익스텐션은 1분 30초이다.
- 분류별 기본 시간은 브라우저(localStorage)에 저장한다. 기기마다 따로 설정한다.

## 변경

- DB `011_machine_single_joint.sql`: `machines.single_joint boolean NOT NULL DEFAULT false`. 재실행해도 안전하다.
- 계약·API
  - `machineSchema.single_joint`(선택 boolean)를 추가했다.
  - 등록 시 생략하면 `false`, 수정 시 생략하면 기존 값을 유지한다(`COALESCE`). 그래서 이전 클라이언트가 값을 지우지 않는다.
  - `GET /api/machines`는 `m.*`로 함께 돌려준다.
- 백업: 머신의 `single_joint`를 내보내고 복원한다. 필드가 없는 이전 백업은 `false`로 복원한다.
- 타이머(`frontend/src/rest-timer.ts`)
  - `restKind(singleJoint, parts)`: 단관절 머신 → 하체(하체-앞·하체-뒤) → 상체(가슴·등·어깨·팔) 순으로 정한다. 복근만 있거나 부위 지정이 없으면 `null`이다.
  - 분류는 사용자가 지정한 값(머신 플래그, #32 부위 지정)으로만 정하고, 운동명으로 추측하지 않는다.
  - `parseRestDurations`: 기본값은 `{ lower: 150, upper: 120, single: 90 }`이다. 저장된 값은 항목별로 검증하고, 잘못된 항목만 기본값으로 돌린다.
  - `startTimer(t, now, seconds?)`: 이번 휴식에만 다른 길이를 쓴다. 설정된 기본 휴식 시간은 바꾸지 않는다.
- 화면(`frontend/src/app.tsx`)
  - 자동 시작으로 세트를 완료하면 그 세트의 머신과 운동명(정규화 키)의 부위 지정으로 휴식 시간을 정한다. 분류가 없으면 기존 "휴식 시간(초)"을 쓴다. 수동 "휴식 시작"도 기존 값을 쓴다.
  - 휴식 타이머에 "운동별 기본 휴식(초)"(하체·상체·단관절) 입력을 추가했다. 5~3600초만 저장하고 잘못된 값은 무시한다.
  - 부위 지정(`/api/exercise-body-parts`)은 선택 조회이다. 실패하면 기본 휴식을 쓰고, 페이지를 옮기면 다시 불러온다.
  - 머신 등록·수정에 "단관절 운동 머신" 체크박스를 추가하고, 목록에 `단관절`을 표시한다.
- 문서: `docs/api.md`, `database/README.md`, `docs/openapi.json`

## 테스트

- `backend/test/rest-by-exercise.test.ts` (신규)
  - 기본값 표, 분류 우선순위(단관절 > 하체 > 상체, 복근·미지정은 null)
  - 저장값 항목별 검증, 휴식 시간 일회성 덮어쓰기, 계약 boolean 검증
  - DB 통합: 등록 기본 false, true 저장, 생략한 수정은 유지, false로 해제
- `backend/test/backup.test.ts`, `backup.integration.test.ts`: 이전 백업은 false, 잘못된 값은 거부, 내보내기·왕복 보존
- `backend/test/migrations.integration.test.ts`: 머신 기본값 false
- `backend/test/official-weights.test.ts`: 수정 SQL 파라미터에 생략된 `single_joint`(null, 유지)를 반영했다.
- `frontend/src/rest-by-exercise.test.tsx` (신규)
  - 스쿼트 2:30, 벤치프레스 2:00, 단관절 머신의 레그 익스텐션 1:30
  - 단관절이 아닌 머신은 부위로 정하고, 운동명 앞뒤 공백은 정규화한다.
  - 복근은 설정한 기본값(0:45)을 쓴다.
  - 분류별 값을 바꾸면 새로고침 후에도 유지되고 적용된다. 잘못된 값은 무시한다.
  - 머신 폼에서 단관절 저장(PUT 본문)을 확인한다.

## 검증 — 2026-10-21

- `npm run check`(Node 24.21.0, `TEST_DATABASE_URL`=로컬 전용 테스트 DB) 통과
  - 백엔드 291 pass, 0 skip(DB 통합 포함)
  - 프론트 97 pass
  - 워커 162, skills 4, docs 3, build 통과
  - 첫 실행은 `official-weights.test.ts`가 PUT 파라미터 배열 끝의 `null`(새 `single_joint`) 때문에 실패했다. 기대값을 고쳐 다시 실행해 통과했다.
- `npm run test:e2e`(같은 테스트 DB): 4 passed. 이번 변경에 e2e를 추가하지 않았다.

## 제한·후속

- 설정은 브라우저별이라 기기 간에 공유되지 않는다.
- 머신이 없는 자유 운동은 단관절로 지정할 수 없다. 부위 지정(하체·상체)만 적용된다.
