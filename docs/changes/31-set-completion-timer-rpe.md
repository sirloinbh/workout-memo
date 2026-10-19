# #31 feat: 세트 완료 표시·휴식 타이머·선택적 RPE 기록

- 이슈: https://github.com/sirloinbh/workout-memo/issues/31
- 브랜치: feat/31-set-completion-timer-rpe

## 변경 내용 (2026-10-19)

- `database/migrations/006_set_completion_rpe.sql`: `sets.completed boolean NOT NULL DEFAULT true`, `sets.rpe numeric(3,1)`과 CHECK(NULL 또는 1~10의 0.5 단위)를 `ADD COLUMN IF NOT EXISTS`로 추가한다. 기존 세트는 수행 기록이므로 완료로 남아 목표 달성 결과가 바뀌지 않는다. 재실행해도 값은 유지된다. `database/README.md`에 적용 명령과 의미를 추가했다.
- `backend/src/domain.ts`: 세트에 `completed`(boolean, 생략 시 true)와 `rpe`(number|null, 생략 시 null)를 추가했다. RPE는 1~10이면서 2배가 정수인 값만 허용하며 문자열·0·10.5·7.25 등은 400이다. 누락은 null로 남고 0으로 바꾸지 않는다. `volume`은 미완료 세트를 제외한다.
- `backend/src/app.ts`: 세트 저장 시 두 값을 같은 트랜잭션으로 저장한다. 목표 달성 SQL은 `s.completed`인 세트만 본다. 재시도 키 fingerprint는 정규화된 본문을 그대로 사용하므로 완료 상태가 다르면 다른 요청이다.
- `frontend/src/rest-timer.ts`(신규): 휴식 타이머 순수 로직. 남은 시간은 저장한 종료 시각(`endsAt`)과 현재 시각의 차로 계산하고, 일시정지 시 남은 ms를 보관, 재개 시 새 종료 시각을 만든다. 표시값은 초 단위 올림이라 실제 종료 전에는 0:00이 되지 않는다. 시간은 5~3600초 정수. 저장값은 형식·범위를 검증하고 손상 시 기본값(90초, 자동 시작 끔)으로 시작한다.
- `frontend/src/main.tsx`:
  - 세트마다 `완료`/`완료됨` 토글 버튼(`aria-pressed`)과 선택 입력 `RPE (선택)`을 추가했다. 비우면 null로 전송한다.
  - 새 기록의 첫 세트와 `세트 추가`로 만든 세트는 미완료로 시작한다. 서버에서 읽은 기존 세트는 `completed`가 없으면 완료로 본다.
  - 완료 상태는 기존 #34 로컬 초안에 함께 저장되어 새로고침·재접속 시 복구된다. 초안 검증에 두 필드를 추가했다(구형 초안은 필드가 없어도 허용).
  - 같은 렌더의 완료 클릭이 반복되면 동기적으로 저장된 최신 초안을 기준으로 무시해 상태가 되돌아가거나 타이머가 재시작되지 않는다. 완료 취소는 타이머를 건드리지 않는다.
  - 휴식 타이머 패널: 시간 설정, 시작·일시정지·재개·취소, `세트 완료 시 자동 시작` 체크박스(기본 꺼짐). 편집 창 안에 표시하고, 편집 창이 닫혀 있어도 타이머가 진행 중이면 페이지 상단에 표시한다. 진행 중에는 1초 단위로 다시 그리기만 하고, `visibilitychange`·`focus` 시 즉시 다시 그려 백그라운드 복귀 후 종료 시각 기준 값을 보여준다.
  - 통계: 누적 볼륨·완료한 세트·그래프는 완료 세트만, 운동한 날은 완료 세트가 하나 이상인 날만 센다. 목록에는 완료 세트 수와 `미완료 n`, 세트 상세에 RPE와 `미완료(통계 제외)`를 표시한다.
- `frontend/src/style.css`: 완료 버튼·RPE 행·타이머 패널과 760px 이하 배치를 추가했다.

## 판단 사항

- **타이머 상태는 클라이언트 전용**: localStorage `workout-memo:rest-timer:v1`에 설정·자동 시작 여부·종료 시각만 보관한다. 서버·다른 기기와 동기화하지 않는다. 저장은 사용자가 타이머를 조작할 때만 하며(초기 렌더에서 쓰지 않음) 읽기·쓰기 오류는 try/catch로 처리하고 경고만 표시한다. 브라우저가 닫힌 동안의 알림은 범위 밖이다.
- **API 기본값은 완료**: `completed`를 보내지 않는 기존 클라이언트·스크립트의 세트는 지금까지처럼 수행 기록으로 저장된다. 이 결정으로 마이그레이션 전후·구형 클라이언트의 목표 판정이 같다.
- **화면의 새 세트는 미완료로 시작**: 운동 중 입력하고 수행 후 완료를 누르는 흐름(자동 휴식 시작 포함)을 기준으로 했다. 완료하지 않은 세트를 실제 수행으로 집계하지 않는 쪽이 보수적이라고 판단했다. 사후에 한 번에 기록하는 사용자는 각 세트를 완료로 표시해야 하므로 편집 창에 `완료 n / m세트`와 안내를 표시한다. 기본값을 바꿀지는 PR 검토에서 확인이 필요하다.
- **운동한 날**: 미완료 세트만 있는 일지(계획만 입력)는 운동한 날로 세지 않는다. 일지 자체는 목록에 남는다.
- **#28과의 정책**: 루틴/간편 입력에서 만든 세트를 `completed:false`로 보내면 저장만 되고 목표·통계에서 제외된다. #28 구현 시 같은 필드를 사용해야 한다.
- 타이머 시간을 진행 중에 바꾸면 현재 휴식의 종료 시각은 유지하고 다음 휴식부터 적용한다. 5초 미만·3600초 초과·소수는 무시한다.
- 서버 측 통계 API는 아직 없고(통계는 화면에서 서버 기록으로 계산), 서버의 판정은 목표 달성 SQL과 `volume` 도메인 함수에 적용했다.

## 테스트

- `backend/test/rest-timer.test.ts`(신규, 단위 4): 종료 시각 기반 남은 시간, 59.999초/60초 경계, 장시간 백그라운드 후 음수 없음, 일시정지·재개·취소·재개 멱등, 시간 범위 5~3600, 진행 중 시간 변경, 손상·범위 밖 저장값(시계 역행 포함) 기본값 처리.
- `backend/test/set-completion.test.ts`(신규): 생략 시 완료·RPE null, 유효 RPE(1, 1.5, 6.5, 9.5, 10, null), 잘못된 RPE(0, 0.5, 10.5, 11, -1, 7.25, 8.1, '8', true, NaN)와 비boolean 완료 거부, `volume`의 미완료 제외, POST/PUT에서 잘못된 RPE가 저장소에 닿기 전 400. DB(전용 테스트 DB): 마이그레이션이 기존 행을 완료/NULL로 두고 재실행 시 값 보존, DB CHECK가 0·0.5·10.5·7.25 거부; 저장·재조회 시 완료 상태와 RPE 복원(누락은 null), 같은 Idempotency-Key 중복 제출 1건, 마감일의 미완료 세트는 미달성 → 완료로 수정 시 달성 → 완료 취소 시 다시 미달성, 잘못된 RPE 수정은 기록 불변, 마감 다음날 완료 세트는 미달성.
- `backend/test/set-completion-ui.test.ts`(신규, VM 어댑터 7): 제어 가능한 시계·타이머·window 이벤트를 사용한다. 새 세트 미완료·완료·완료 취소와 전송 본문, 자동 시작 기본 꺼짐·선택 후 동일 렌더 중복 클릭에서 1회만 시작, 완료 취소 시 타이머 유지, 시간 설정(3초 무시)·시작·틱·일시정지(백그라운드 2분에도 고정)·재개·취소, 타이머 콜백 없이 시계만 이동한 백그라운드 복귀(1:00 → 0:01 → 휴식 종료, 음수 없음), 새로고침 후 남은 시간 0:45·완료 상태·RPE 8.5·자동 시작 설정 복구, RPE 비우면 null, 손상된 타이머 저장값, 미완료 세트의 볼륨·세트 수·운동한 날 제외.
- 기존 테스트 변경: `workout-validation.test.ts`의 파싱 결과 기대값에 새 기본값 `completed: true, rpe: null`을 추가했다(메모 검증은 그대로). `workout-draft-ui.test.ts` VM 로더에 `./rest-timer` 모듈을 추가했다. `period-ui.test.ts` 어댑터의 `useState`가 React처럼 지연 초기화 함수를 실행하도록 고쳤다. 기존 assertion은 삭제·약화하지 않았다.
- 구현 후 회귀 확인: 동일 렌더 중복 클릭 방지 조건과 볼륨의 완료 필터를 임시로 제거하면 UI 테스트 2건이 실패함을 확인하고 원복했다.

## 실제 실행 결과

- `node ../node_modules/tsx/dist/cli.mjs --test test/rest-timer.test.ts test/set-completion.test.ts test/set-completion-ui.test.ts test/workout-draft-ui.test.ts test/period-ui.test.ts`(Node 24.21.0, DB 미설정): **53 pass / 0 fail / 2 skip**. skip 2건은 DB 통합 테스트이며 성공으로 계산하지 않는다.
- `issue-check.ps1 -Issue 31 -Migrate`(전용 DB `workout_test_31`에 001~006 적용 후 `npm run check`):
  - 1회차: backend typecheck 실패(TS7022, 테스트의 fetch 응답 타입). 수정.
  - 2회차: `npm test` **232 pass / 1 fail / 0 skip** — `workout-validation.test.ts`의 deepEqual이 새 기본 필드로 실패. 기대값에 기본값을 추가.
  - 3회차: **EXIT=0**. 포맷·lint·typecheck 통과, 앱·DB `npm test` **233 pass / 0 fail / 0 skip / 0 cancelled**(DB 통합 테스트 포함), `test:agents` **162 pass / 0 fail / 0 skip**, `test:skills` **4 pass / 0 fail / 0 skip**, frontend/backend build 통과.
- 최종 검사(이 문서 추가·포맷 후 같은 명령 재실행): **EXIT=0**. 포맷·lint·typecheck 통과, `npm test` **233 pass / 0 fail / 0 skip / 0 cancelled**, `test:agents` **162 pass / 0 fail / 0 skip**, `test:skills` **4 pass / 0 fail / 0 skip**, build 통과. 이후 변경은 이 결과 줄 추가뿐이며 `prettier --check`로 확인했다.

## 한계

- 실제 브라우저(모바일 390px/PC) 확인은 이 단계에서 하지 않았다. VM 어댑터는 DOM 배치·포커스·실제 React 스케줄링·브라우저의 백그라운드 타이머 스로틀링을 검증하지 않는다. 코디네이터의 브라우저 확인이 필요하다.
- 휴식 종료 시 소리·진동·알림은 없다. 여러 탭은 같은 타이머 저장 위치를 공유하지만 다른 탭의 변경을 실시간 반영하지 않는다(다음 새로고침 시 반영).
- 운영 DB에는 `006_set_completion_rpe.sql`을 적용하지 않았다. 배포 전 적용이 필요하다. 마이그레이션 번호 005는 다른 작업용으로 비어 있다.
