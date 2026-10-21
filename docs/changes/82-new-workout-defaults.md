# #82 새 일지 기본값 자동 입력(오늘 날짜·제목·진행 중 루틴의 세트)

- 이슈: [#82](https://github.com/sirloinbh/workout-memo/issues/82)
- 브랜치: `feat/82-new-workout-defaults` (main `cc6f510`에서 시작)

## 결정 — 2026-10-21

이슈의 "확인 필요" 항목은 사용자 답변으로 정했다([이슈 댓글](https://github.com/sirloinbh/workout-memo/issues/82#issuecomment-6306001768)).

- 제목 형식은 `10월 20일(화)`이다. 날짜만 쓰고 루틴 분할명은 붙이지 않는다.
- 기준 날짜를 다른 날로 옮긴 상태에서도 새 일지 날짜는 Asia/Seoul 오늘이다.
- 루틴 계획에 운동별 머신을 저장하는 기능을 이번 범위에 포함한다.

## 변경

- 새 일지("운동 기록하기")
  - 날짜: Asia/Seoul 오늘. 화면의 기준 날짜(`anchor`)를 쓰지 않는다.
  - 제목: `dateTitle`(`frontend/src/date.ts`)로 만든 `10월 15일(목)` 형식.
  - 세트: 진행 중 루틴에 오늘 목표가 있으면 운동명·머신·총중량 kg·반복 수로 채운다. 루틴이 없거나 휴식일이면 기존처럼 빈 세트 3개로 시작한다.
  - 날짜·제목·세트는 모두 입력란에서 수정할 수 있다.
  - 복구할 초안이 있으면 새 일지를 열지 않는다(기존 #34 동작). 따라서 초안이 우선한다.
- 루틴 계획의 운동별 머신
  - `routineSchema`(`backend/src/domain.ts`)에 선택 필드 `machine_id`(양의 정수 또는 null)를 추가했다. 계획은 jsonb로 저장하므로 DB 마이그레이션이 필요 없다. 기존 계획은 필드가 없는 상태로 그대로 동작한다.
  - jsonb에는 외래 키가 없다. 그래서 `POST /api/routines`가 지정된 머신의 존재를 확인하고, 없으면 400 `루틴에 지정한 머신을 찾을 수 없습니다`를 돌려준다.
  - 오늘 목표(`today_plan.target.exercises`)는 수동·자동 루틴 모두 `machine_id`를 함께 돌려준다. 계획에 머신이 없으면 `null`이다.
  - 루틴짜기 화면에서 운동마다 "머신" 선택(기본 "자유 운동")을 둔다. 자유 운동은 저장 요청에서 `machine_id`를 빼서, 머신을 쓰지 않는 계획은 기존 형태를 유지한다. 계획 보기에는 `운동명 (브랜드 · 머신)`으로 표시한다.
  - 새 일지와 "오늘 루틴으로 기록하기"는 화면이 불러온 머신 목록에 있는 머신만 채운다. 목록에 없는 머신은 "자유 운동"(null)으로 둔다. 총중량은 계획 값을 그대로 쓴다. 머신 기본중량을 자동으로 더하지 않는 기존 규칙(기본중량 포함 총중량 kg)을 유지한다.
- 백업
  - 검증: 루틴이 백업에 없는 머신을 가리키면 `routines[i]: 백업에 없는 머신 N를 참조합니다`로 거부한다.
  - 복원: 루틴 계획의 `machine_id`를 복원·매칭된 머신 id로 바꿔서 저장한다. 중복 판정도 바뀐 계획으로 하므로 같은 백업을 다시 복원하면 건너뛴다.
  - 백업 버전은 v1을 유지한다. 필드가 선택이라 기존 백업도 그대로 검증을 통과한다.
- 문서: `docs/api.md` 루틴 계획 형식 설명, `docs/openapi.json` 재생성(`npm run openapi`)

## 테스트

- 화면(Vitest·RTL)
  - `frontend/src/new-workout-defaults.test.tsx`
    - 기준 날짜를 2026-09-01로 옮겨도 새 일지는 오늘(2026-10-15)·`10월 15일(목)`이다. 제목을 수정할 수 있다.
    - 오늘 루틴의 세트를 운동명·머신·총중량·횟수로 채운다. 목록에 없는 머신은 자유 운동으로 둔다. 저장 요청의 `machine_id`와 미완료 상태를 확인한다.
    - 휴식일에는 빈 세트 3개로 시작한다.
  - `frontend/src/routines.test.tsx`: 운동에 머신을 지정하면 POST에 `machine_id`가 실린다. 자유 운동은 필드를 생략한다. 계획 보기에 머신 이름을 표시한다.
  - `frontend/src/workout-draft.test.tsx`: 제목이 이제 날짜로 미리 채워지므로, 시나리오에서 제목을 지운 뒤 입력하도록 수정했다.
- 백엔드 단위(node:test)
  - `backend/test/routine-progress.test.ts`: 수동·자동 목표에 `machine_id`를 전달하는지, 0 이하 id를 거부하는지 확인한다. 기존 기대값에 `machine_id: null`을 추가했다.
  - `backend/test/backup.test.ts`: 루틴의 머신 참조 검증(거부·허용)
- DB 통합(node:test, 전용 테스트 DB)
  - `backend/test/routines.integration.test.ts`: 존재하는 머신을 지정해 저장·조회한다. 없는 머신은 400이며 저장되지 않는다.
  - `backend/test/backup.integration.test.ts`: 대상 DB의 머신 id가 달라도 복원된 루틴이 새 머신 id를 가리킨다. 다시 복원하면 루틴을 건너뛴다.
  - `backend/test/routine-progress.integration.test.ts`: 오늘 목표 기대값에 `machine_id: null`을 추가했다.
- 브라우저(Playwright): `e2e/new-workout-defaults.spec.ts`
  - API로 머신과 오늘 시작하는 루틴을 만든다.
  - 기준 날짜를 2001-03-15로 옮긴 뒤 새 일지를 연다. 오늘 날짜·제목, 세트 2개의 운동명·머신·150 kg·10회를 확인한다.
  - 루틴·머신 삭제 API가 없어서 고유 이름으로 만들고 테스트 DB에 남는다.

## 검증 — 2026-10-21

- `npm run check`(Node 24.21.0, `TEST_DATABASE_URL`=로컬 전용 테스트 DB `workout-memo-agent-test-db`) 통과
  - format·lint·contract·typecheck 통과
  - 백엔드 283 pass, 0 skip(DB 통합 포함)
  - 프론트 93 pass
  - 워커 162, skills 4, docs 3, build 통과
- `npm run test:e2e`(`E2E_DATABASE_URL`=같은 테스트 DB): 5 passed
- 먼저 시스템 Node 22.17.0으로 실행한 check는 백엔드·프론트 테스트를 통과했지만, 이후 단계에서 exit 255로 끝났다. 실패 단계는 따로 확인하지 않았다. 프로젝트 기준인 Node 24로 다시 실행해 전체 통과를 확인했다.

## 제한·후속

- 머신 삭제 API가 없어서, 루틴이 가리키는 머신이 사라지는 경우는 백업 replace 복원뿐이다. 이 경우에도 복원 시 id를 다시 매핑한다.
- 루틴 수정 API가 없어서, 기존 루틴에 머신을 추가하려면 새 루틴을 만들어야 한다.
