# #28 feat: 루틴 기반 일·주·12주 목표와 휴식 일정 이동·간편 일지 입력

- 이슈: https://github.com/sirloinbh/workout-memo/issues/28
- 브랜치: feat/28-routine-daily-goals
- 확정 규칙: 이슈 코멘트 "구현 착수 및 확정 규칙 — 2026-10-19"

## 변경 내용 — 2026-10-19 (Asia/Seoul)

### 서버

- `backend/src/progress.ts` (신규): 루틴 진행 계산을 순수 함수로 분리했다.
  - `planTargets`: #27의 84일 일정(`routineSchedule`) 순서대로 목표 1~N번을 만든다. 각 목표는 원래 주차·디로딩 여부·분할과 종목별 세트·총중량 kg·반복 수(기준값 포함)를 가진다.
  - `arrangeTargets`: 휴식 날짜 목록을 받아 운동일 슬롯에 목표를 계획 순서대로 다시 배치한다. 휴식한 슬롯은 비우고 이후 목표가 한 운동일씩 밀린다. 운동일 날짜·휴식 요일·12주 종료일(시작일+83일)은 바뀌지 않으며, 넘친 마지막 목표는 삭제하지 않고 `excluded`(제외됨)로 반환한다.
  - `restUnavailable` / `restPreview` / `routineProgress`: 휴식 가능 여부(이미 휴식, 루틴 기간 밖, 계획된 운동일 아님), 실행 전 미리보기(이동 일정 `from → to`, 새로 제외될 목표), 오늘·이번 주·12주 표 데이터를 만든다. 미리보기와 실제 적용은 같은 `arrangeTargets`로 계산한다.
- `backend/src/app.ts`
  - `GET /api/routine-progress`: 시작일이 오늘(Asia/Seoul) 이하인 루틴 중 시작일이 가장 늦은 1개(동률이면 최신 ID)를 진행 중 루틴으로 선택한다. 없으면 `{ today, routine: null }`. 오늘 목표 종목별로 오늘 이전의 가장 최근 실제 일지 세트를 `previous`(참고값)로 함께 반환한다. 운동명 비교는 기존 목표 판정과 같이 `lower(trim())`이다.
  - `POST /api/routines/:id/rests` `{ date }`: `date`가 서버의 Asia/Seoul 오늘이 아니면 409. 트랜잭션에서 루틴 행을 `FOR UPDATE`로 잠그고, 진행 중 루틴인지·휴식 가능한 날인지 검사한 뒤 `routine_rests`에 한 행을 넣는다. 이미 같은 날 휴식이면 아무것도 쓰지 않고 200 `applied:false`(중복 클릭/재전송 무시). 응답은 COMMIT 성공 후에만 보낸다.
  - `DELETE /api/routines/:id/rests/:date`: 당일(서버 오늘)만 허용, 다른 날은 409. 반복 취소는 200 `applied:false`.
  - `createApp(pool, { today })`: 테스트에서 오늘 날짜를 주입할 수 있다. 기본값은 Asia/Seoul 오늘.
- `database/migrations/005_routine_progress.sql` (신규): `routine_rests(routine_id → routines ON DELETE CASCADE, rest_date, created_at, PK(routine_id, rest_date))`, `IF NOT EXISTS`로 재실행 안전. 적용 방법은 `database/README.md`에 추가했다.
- 휴식은 날짜만 저장하고 일정은 파생 계산하므로 저장된 일지·세트·루틴 계획을 수정하지 않는다.

### 화면

- `frontend/src/progress.tsx` (신규, hook 없는 표시 컴포넌트와 도우미): 운동 일지 화면의 "루틴 목표" 카드.
  - 오늘 목표: `N주차(디로딩) · 분할 · 해당 주 계획 변화`, 종목별 `세트 · 총중량 kg · 반복 수`, 기준값, 같은 종목 직전 기록(없으면 "직전 기록 없음"). 서로 다른 종목의 중량은 합산하지 않는다.
  - 이번 주 운동일 목록, 12주 전체 목표 표(주차별 행, 목표의 원래 주차 기준, 제외됨 표시).
  - 진행 중 루틴이 없으면 루틴짜기 안내.
  - "오늘 하루 휴식하기" → 이동될 일정과 제외될 마지막 목표를 보여주는 확인 영역 → "휴식 확정". 휴식 후 "휴식 취소"(당일).
  - "오늘 루틴으로 기록하기": 오늘 목표의 세트 수만큼 세트 행(종목·총중량·반복 수, 머신 미선택)을 채운 일지 편집기를 연다.
- `frontend/src/main.tsx`
  - 간편 입력은 기존 `setEditor` → localStorage 초안 → `saveWorkout`(Idempotency-Key 재시도) 흐름을 그대로 사용한다. 저장 전에는 서버 요청이 없고 기존 초안 복구 중에는 버튼이 비활성화된다.
  - 편집기 세트 행에 오늘 루틴 종목이면 "오늘 목표 · 직전 기록" 참고 문구를 표시한다(초안 본문에는 넣지 않음).
  - "다른 운동 추가" 버튼으로 루틴 외 종목의 빈 세트 행을 추가할 수 있다. 기존 날짜·머신·메모·총중량 입력과 편집, "세트 추가"는 유지했다. 운동명 자동완성에 오늘 루틴 종목을 추가했다.
  - 휴식 요청 중에는 ref 잠금으로 중복 클릭을 막는다. 일지 저장 성공 후 루틴 목표(직전 기록)를 다시 불러온다.
- `frontend/src/style.css`: 카드·확인 영역·12주 표·세트 참고 문구 스타일, 760px 이하에서 표 가로 스크롤.
- `README.md`: 기능 설명 추가.

## 판단 사항 (확정 규칙 밖에서 보수적으로 선택)

1. **주차별 목표값 계산**: #27은 운동별 기준값과 주차별 수동 변화량만 저장한다. 오늘 목표값은 "기준값 + 해당 주차 변화량 1회 적용"(디로딩은 감소)으로 계산했고, 주차 간 누적하지 않는다. 화면에 기준값과 주차 변화를 함께 보여 계산 근거를 확인할 수 있다. 누적 방식이 의도라면 `weekExercises` 한 곳만 바꾸면 된다. **사용자 확인 필요.**
2. 감소 결과는 일지 입력 범위로 제한한다: 총중량 0~99999 kg(소수 둘째 자리 반올림), 세트·반복 최소 1.
3. 휴식은 오늘이 루틴 기간 내의 계획된 운동일이고 목표가 남아 있을 때만 허용한다. 휴식 요일·기간 밖에는 버튼을 표시하지 않고 서버도 409로 거부한다. 지난 날짜에 대한 휴식 추가는 지원하지 않는다.
4. 진행 중이 아닌 루틴(더 늦게 시작한 루틴이 있는 경우)에는 휴식을 거부한다. 취소는 당일 해당 루틴의 휴식 행만 삭제한다.
5. 이미 오늘 일지를 저장했더라도 휴식은 허용한다(일지는 바뀌지 않음).
6. 직전 기록은 오늘 이전 날짜(`date < 오늘`)의 가장 최근 일지 한 건에서 같은 종목 세트를 모두 보여준다. 오늘 이미 저장한 기록은 참고값에서 제외한다.
7. 간편 입력 일지 제목은 `루틴명 · 분할명`, 머신은 미선택(null)으로 둔다. 루틴에 머신 정보가 없어 기본중량을 임의로 더하지 않는다. 세트 행은 일지 상한 200개로 자른다.
8. 목표 카드는 운동 일지 화면에만 표시한다(대시보드에는 추가하지 않음).
9. 루틴 수정·삭제 API는 여전히 없다(#27 범위 밖). 루틴을 DB에서 삭제하면 휴식 기록도 CASCADE 삭제된다.

## 테스트

추가/수정한 테스트:

- `backend/test/routine-progress.test.ts` (신규, 13건): 주차 변화 1회 적용·비누적·디로딩 하한, 휴식 없음, 1회 휴식 시 이동과 마지막 목표 제외(종료일·날짜 고정), 서로 다른 날 연속 휴식, 같은 날 중복, 주차·디로딩 귀속(3주차 목표가 4주차 날짜로 밀려도 3주차, 디로딩 목표는 디로딩 유지), 마지막 운동일 휴식, 운동일 아님/기간 밖 거부, 모든 운동일·이전 휴식 조합에서 미리보기 = 적용 결과, 오늘·이번 주·12주 표. API(가짜 pool): 서버 오늘과 다른 날짜/잘못된 날짜/ID 400·409이며 저장소 미접근, 당일 외 취소 409, 1회 적용 후 중복은 INSERT 없음, 비운동일 ROLLBACK, COMMIT 실패 시 500·ROLLBACK·성공 응답 없음, 루틴 없음 안내.
- `backend/test/routine-progress.integration.test.ts` (신규, 전용 DB 필요, 하위 테스트 6건): 가장 최근 시작 루틴 선택·계획값·직전 기록 참고값, 진행 중이 아닌 루틴 휴식 거부, 실제 DB에서 COMMIT 실패 시 휴식 행 미저장, 동시 중복 POST 2건 → 201/200 및 행 1개, 적용 결과 = 미리보기, 종료일 고정, 저장된 세트 불변, 다른 날 취소 409·당일 취소 복원·반복 취소 no-op, 다른 날 연속 휴식 누적. 다른 테스트 파일과 같은 DB를 쓰므로 2097년 시작일을 사용하고 생성한 루틴·일지만 정리한다.
- `backend/test/routine-progress-ui.test.ts` (신규, 5건): 기존 렌더링 어댑터 방식으로 실제 `main.tsx`/`progress.tsx` 실행. 서버 응답은 실제 `routineProgress`로 계산. 일지 화면의 종목별 목표·기준값·직전 기록·합산 없음·12주 표, 루틴 없음 안내, 초안 채우기 → 저장 전 요청 없음 → 그대로 저장(Idempotency-Key, 본문 확인, 초안 정리, 목표 재조회), 반복 수 수정 + 루틴 외 종목 추가 후 저장, 휴식 미리보기(이동·제외됨) → 같은 렌더의 연속 클릭에도 POST 1회 → 휴식 표시·제외됨 행 → 당일 취소 복원, 일지 미생성.
- `backend/test/workout-draft-ui.test.ts` (수정): 새 `./progress` import를 실제 모듈로 불러오는 로더 분기만 추가했다. 기존 assertion은 변경하지 않았다.

순서 기록: 구현(`progress.ts`, API)을 먼저 작성한 뒤 같은 작업 안에서 테스트를 작성했다. 구현 전 실패 재현은 하지 않았다. 대신 UI 연속 클릭 테스트는 `restPending` 잠금을 임시 제거하면 실패(4 pass / 1 fail)하고 복원하면 통과하는 것을 확인했다.

### 실제 실행 명령과 결과

- `node node_modules/tsx/dist/cli.mjs --test test/routine-progress.test.ts` (backend, Node 24.21.0): 첫 실행 11 pass / 2 fail(테스트 기대값 오류: 미리보기 제외 목표 비교 방식, 실패 주입 지점). 테스트를 고친 뒤 **13 pass / 0 fail / 0 skip**.
- `node node_modules/tsx/dist/cli.mjs --test test/workout-draft-ui.test.ts test/period-ui.test.ts test/routines-ui.test.ts`: **43 pass / 0 fail / 0 skip**.
- `node node_modules/tsx/dist/cli.mjs --test test/routine-progress-ui.test.ts`: **5 pass / 0 fail / 0 skip**. 잠금 제거 변이 시 4 pass / 1 fail.
- `issue-check.ps1 -Issue 28 -Script test -Migrate` (전용 DB `workout_test_28`에 001~005 적용 후 `npm test`): **229 pass / 0 fail / 0 skip** (UI 테스트 추가 전). 통합 테스트 하위 6건 모두 실행·통과 확인.
- 첫 `issue-check.ps1 -Issue 28 -Migrate` (`npm run check`): format:check 단계에서 `README.md`, `database/README.md` Prettier 경고로 EXIT=1. Prettier로 포맷 후 재실행.
- 두 번째 `issue-check.ps1 -Issue 28 -Migrate`: **EXIT=0**. format:check, lint, typecheck 통과. 앱 테스트 **234 pass / 0 fail / 0 skip**(전용 DB 통합 포함), `test:agents` **162 pass / 0 fail / 0 skip**, `test:skills` **4 pass / 0 fail / 0 skip**, frontend(vite) 및 backend 빌드 통과.

## 제한·후속

- 실제 브라우저 확인은 하지 않았다. 레이아웃(특히 760px 이하 12주 표·세트 참고 문구), 포커스, 네이티브 유효성 검사, React 스케줄링은 렌더링 어댑터 범위 밖이다.
- 기존 직접 입력 대비 조작 수: 오늘 목표와 같으면 "오늘 루틴으로 기록하기" → "기록 저장하기" 2회 클릭으로 저장된다(제목·종목·세트별 중량·반복 입력 불필요). 절감률은 측정하지 않았다.
- 판단 사항 1(주차 목표 계산 방식)은 사용자 확인이 필요하다.
- 휴식 미리보기와 확정 사이에 다른 기기에서 휴식이 적용되면 확정은 중복으로 처리되어(200) 최신 일정을 표시한다. 자정을 넘기면 날짜 불일치 409로 다시 확인을 요구한다.
- 이 변경 기록 작성 후 최종 `issue-check.ps1 -Issue 28 -Migrate`: **EXIT=0**. 앱 테스트 234 pass / 0 fail / 0 skip, `test:agents` 162 pass / 0 fail / 0 skip, `test:skills` 4 pass / 0 fail / 0 skip, 빌드 통과.
