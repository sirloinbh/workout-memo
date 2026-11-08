# #115 유산소 기록 화면 ③ 운동 일지 탭 연결과 대시보드 요약

- 이슈: [#115](https://github.com/sirloinbh/workout-memo/issues/115)
- 브랜치: `feat/115-cardio-tab`
- 선행: PR ①([115-cardio-form.md](115-cardio-form.md), 병합됨), PR ②([115-cardio-stats.md](115-cardio-stats.md), 병합됨), #116(유산소 목표, 병합됨), #105의 일지 쪽 변경(병합됨)

## 목적

#115의 마지막 PR입니다. PR ①·②에서 독립 부품으로 만든 유산소 목록·폼·통계·개인 기록을 운동 일지의 근력/유산소 탭(결정 1)에 붙이고, 대시보드에는 유산소 기록이 있을 때만 요약 카드 1개(결정 5)를 보여 줍니다. 390px 실제 브라우저 흐름(e2e)과 화면 공통 검사도 더합니다.

| PR  | 내용                                                |
| --- | --------------------------------------------------- |
| ①   | 폼·목록·수정·삭제 부품(병합됨)                      |
| ②   | 통계 부품과 개인 기록 API(병합됨)                   |
| ③   | 운동 일지의 근력/유산소 탭 연결, 대시보드 요약, e2e |

## 변경 — feat: 운동 일지의 근력/유산소 탭

- `frontend/src/app.tsx`
  - 운동 일지 머리글 아래에 공통 `SegmentedControl`("기록 종류": 근력·유산소)을 둡니다. 근력은 기존 일지 화면(요약 카드, 오늘의 루틴, 운동 기록 목록) 그대로입니다.
  - 유산소를 고르면 같은 기간 선택(기간 탭·기준 날짜·직접 선택) 아래에 `CardioTab`이 보입니다. 기간은 두 탭이 함께 씁니다.
  - 선택한 탭은 주소의 `?tab=cardio`에 둡니다. 근력이 기본이라 매개변수가 없습니다. 탭을 바꾸면 기록이 하나 쌓여 뒤로·앞으로 가기와 새로고침에서 탭이 유지됩니다.
  - 기간 주소(`?from&to`, #85)를 바꾸던 `setSearchParams({})`·`setSearchParams({ from, to })`는 주소 전체를 덮어 탭이 지워졌습니다. 이제 `setRangeAddress`가 `from`·`to`만 바꾸고, `setJournalTab`은 `tab`만 바꿉니다.
  - 주 메뉴 링크: 운동 일지는 지금 주소를 그대로 이어 받고, 대시보드·신체 기록은 기간만 이어 받습니다(`tab` 제외).
  - 운동 일지에서 불러온 기간의 근력 일지를 `{ id, date, title }`로 넘겨, 유산소 폼의 "연결할 근력 일지"가 같은 날 일지를 고를 수 있습니다. 요청을 더 하지 않습니다.
- `frontend/src/cardio/cardio-tab.tsx`(새 파일): `CardioTab({ from, to, today?, workouts, onChanged? })`. `CardioPanel`과 `CardioStats`를 위아래로 놓는 작은 컨테이너입니다.
- `frontend/src/cardio/cardio-panel.tsx`: 선택 속성 두 개를 더했습니다. 없으면 PR ①과 똑같이 동작합니다.
  - `onSessionsChange(sessions)`: 화면의 목록이 바뀔 때마다(새 기간을 불러오는 동안은 `[]`) 알립니다. 최신 콜백을 ref에 두어, 부모가 매번 새 함수를 넘겨도 호출이 늘지 않습니다.
  - `onChanged()`: 저장, 삭제, 이미 삭제된 기록(404) 뒤에 부릅니다.

### 상태 끌어올리기

기록 목록을 불러오는 일은 `CardioPanel`에 그대로 두고, 탭(`CardioTab`)은 패널이 알려 준 목록과 `refreshKey`만 가집니다.

- 통계(`CardioStats`)는 패널이 이미 불러온 목록으로 계산하므로 `/api/cardio-sessions` 요청이 한 번뿐입니다.
- 저장·삭제 뒤에는 패널이 목록을 다시 불러와 통계가 바뀌고, `onChanged`로 `refreshKey`를 올려 개인 기록(`CardioRecords`)도 다시 불러옵니다. 대시보드 요약의 캐시(`['cardio-sessions', …]`)도 무효로 표시해 대시보드로 돌아가면 새로 불러옵니다.
- 불러오기를 탭으로 옮기는 방법도 있었지만, 그러면 PR ①의 경쟁 응답 처리·오류·재연결·포커스 유지를 옮기고 테스트를 다시 써야 합니다. 콜백 두 개로 PR ① 테스트(19개)를 그대로 통과시켰습니다.

### 머리글 버튼

유산소 탭에서는 머리글의 "운동 기록하기"를 숨기고, 유산소 목록 카드의 "유산소 기록 추가"를 그 화면의 주요 버튼으로 씁니다.

- 머리글 버튼을 "유산소 기록 추가"로 바꾸려면 패널 밖에서 폼을 여는 통로(명령형 ref나 열림 상태 끌어올리기)가 필요하고, 같은 이름의 버튼이 한 화면에 둘 생겨 화면 낭독기와 테스트에서 헷갈립니다.
- 패널의 버튼은 기간 선택 바로 아래, 유산소 목록 카드 머리에 있어 머리글 버튼과 거의 같은 자리에서 찾을 수 있습니다.
- 근력 탭과 대시보드의 "운동 기록하기"는 바뀌지 않습니다.

## 변경 — feat: 대시보드 유산소 요약 카드

- 대시보드의 요약 카드 줄에 `StatCard` "유산소"를 더합니다. 값은 기간의 거리 합계(km, 종류를 더한 거리), 설명은 "횟수 · 시간"(예: "2회 · 1:32:05")입니다. `cardio/stats.ts`의 `totalsOf`와 `format.ts`의 `formatDistance`·`formatDuration`을 씁니다.
- 기간에 유산소 기록이 없으면 카드를 그리지 않고 기존 4장 그대로입니다. 있으면 `lg`부터 5열, 그보다 좁으면 다섯째 카드가 한 줄을 차지합니다.
- 요청은 대시보드에서만 `listCardioSessions(from, to)` 하나입니다(TanStack Query, `enabled: page === 'overview'`). 실패하면 카드만 숨기고 오류를 띄우지 않습니다. 운동 일지는 이 요청을 하지 않습니다.

## 변경 — test: 화면 공통 검사 고정 데이터

- `e2e/support/ui-fixtures.ts`
  - `/api/cardio-sessions`: #116 목표에서 쓰던 고정 유산소 기록 4개(10/6·10/9·10/13 러닝, 10/14 실내 자전거)를 서버 응답 모양(최신 순, 서버와 같은 반올림의 페이스·속도)으로 돌려줍니다. 기간으로 거릅니다.
  - `/api/cardio-sessions/records`: 서버와 같은 규칙으로 계산한 개인 기록(러닝 최장 9 km, 5·10km 기록 없음).
  - 화면 목록에 `{ path: '/journal?tab=cardio', name: 'journal-cardio' }`을 더해 접근성·반응형·터치·시각 검사가 유산소 탭을 포함합니다.
- 고정 시계(2026-10-15)의 대시보드 기본 기간(10/12~10/18)에 10/13·10/14 기록이 있어 대시보드에도 유산소 카드가 보입니다.

## 테스트

- 추가: `frontend/src/cardio/journal-tab.test.tsx` 4개(앱 전체를 `mockApi`·`fixClock`으로 그림)
  - 운동 일지는 근력으로 열리고 주소에 `tab`이 없음. 유산소를 누르면 `?tab=cardio`, 유산소 목록·통계가 보이고 근력 요약 카드와 "운동 기록하기"가 사라짐. 요청 기간은 기본 주(10/12~10/18). 뒤로 가기는 근력, 앞으로 가기는 다시 유산소.
  - `/journal?tab=cardio&from=2026-10-01&to=2026-10-10`으로 열면 그 기간의 기록·페이스(6:00/km)·통계 기간이 보임. 기간 탭 "1주"를 누르면 주소에서 기간만 지워지고 `tab=cardio`는 남으며 새 기간으로 다시 계산됨. 대시보드로 가면 `tab`이 따라가지 않음.
  - 유산소 기록을 저장하면 기간 합계(5 km, 30:00)가 바뀌고 개인 기록을 다시 불러와 "러닝 최장 거리"가 보임(`/records` 요청 2회).
  - 대시보드는 기간에 기록이 있으면 "유산소" 카드(8.2km, "2회 · 1:32:05")를 보여 주고 요청은 1회. 기록이 없는 기간(1일)으로 바꾸면 카드가 사라짐. 운동 일지로 가도 대시보드 요청이 늘지 않음.
- 추가: `e2e/cardio.spec.ts` 1개(390×844, 실제 API와 테스트 DB, 다른 spec과 겹치지 않는 2001-04-20)
  - 운동 일지에서 유산소 탭을 고르면 주소가 `/journal?tab=cardio`이고 "운동 기록하기"가 없음.
  - 러닝 1시간 2분 30초·12.5 km를 저장하면 목록에 "1:02:30 · 12.5 km · 5:00/km · 12 km/h", 기간 합계 12.5 km. 새로고침 뒤에도 탭과 기록이 남음.
  - 거리를 10 km로 고치면 "6:15/km · 9.6 km/h", 새로고침 뒤에도 같음. 삭제하면 목록과 새로고침 뒤에서 사라짐. 실패로 남은 기록은 `afterAll`이 메모로 찾아 지웁니다.
- 실행 결과
  - `npm run test -w frontend -- src/cardio src/period.test.tsx src/routing.test.tsx`: 8 files, 80 pass(PR ① `cardio-panel.test.tsx` 포함)
  - `npm run test -w frontend -- src/custom-range.test.tsx`: 6 pass(기간 주소 처리를 바꿔 함께 실행)
  - `npm run typecheck -w frontend`: 통과
  - `node_modules/.bin/tsc -p e2e/tsconfig.json --noEmit`: 통과
  - `node_modules/.bin/eslint`·`node_modules/.bin/prettier --check`(바꾼 파일): 통과
- 로컬 전체 `npm test`·`npm run check`·e2e는 메모리 부족 이력이 있고 로컬 PostgreSQL이 꺼져 있어 실행하지 않았습니다. `e2e/cardio.spec.ts`와 화면 공통 검사는 CI `e2e` 작업에서 확인합니다.

## 시각 기준선

- 새 화면 `journal-cardio`(4개 폭)의 기준선이 없고, 대시보드(`dashboard`, 4개 폭)는 유산소 카드가, 근력 일지(`journal`, 4개 폭)는 머리글 아래 "기록 종류" 탭이 더해져 바뀝니다. 모두 12장입니다(1차 리뷰에서 `journal`이 빠진 것을 바로잡음). 기준선은 로컬에서 만들지 않았습니다.
- CI `e2e`가 화면 차이로 실패하면 [workout-testing](../../skills/workout-testing/SKILL.md)의 절차대로 `playwright-report`의 diff를 확인한 뒤 같은 실행의 `visual-baselines` 아티팩트로 `e2e/__screenshots__/`를 갱신하고, 바뀐 장수를 이 문서와 PR에 적습니다.

## 한계와 남은 일

- 유산소 탭에서는 근력 요약 카드와 오늘의 루틴 카드를 보이지 않습니다. 근력 일지의 로컬 초안 안내와 휴식 타이머는 두 탭에 그대로 보입니다.
- 패널이 새 기간을 불러오는 동안 통계는 잠깐 빈 상태로 보입니다. 패널의 "기록을 불러오는 중…"과 같은 시점에 사라집니다.
- 대시보드 카드의 거리는 수영도 km로 더합니다(유산소 탭의 기간 합계와 같음).

- 이 PR은 구현을 하위 에이전트에 맡겼습니다. 주 에이전트가 `app.tsx`의 주소 처리 변경을 읽고 `npm run test -w frontend -- src/cardio src/period.test.tsx src/routing.test.tsx src/custom-range.test.tsx src/workout-draft.test.tsx`(10 files, 108 pass), typecheck(frontend·e2e), eslint, prettier, `test:docs`를 다시 돌려 확인했습니다.

## 변경 — fix: 1차 리뷰 보완

- (필수) 시각 기준선: 위 "시각 기준선" 절에 `journal` 4장을 더해 12장으로 바로잡았습니다. 실제 갱신은 이 커밋의 CI 아티팩트로 합니다.
- (선택) 목록을 처음 불러오지 못하면 통계가 "기록 없음"처럼 보였습니다. `CardioPanel`이 `onSessionsChange(sessions, status)`로 `loading`·`error`·`ready`를 함께 알리고, `CardioTab`은 `ready`일 때만 통계를 보여 줍니다. 저장 뒤 다시 불러오기가 실패해 목록이 남은 경우는 `ready`입니다.
- (선택) 대시보드 카드는 기간의 기록이 모두 거리 없음이면 "0 km" 대신 횟수(예: "1회")를 값으로, "45:00 · 거리 미입력"을 설명으로 보여 줍니다.
- (선택) 테스트: 직접 고른 기간과 `tab=cardio`가 있는 주소에서 대시보드로 가면 `?from&to`만 남는지, 첫 불러오기 실패 때 통계가 숨는지, 거리 없는 기록만 있을 때의 카드를 더했습니다. 기간 프리셋 뒤 대시보드 이동 테스트의 주석도 실제 확인 내용에 맞췄습니다.
- 한계(반영 안 함): 근력 일지 연결 후보는 일지 탭이 불러온 기간 안의 일지뿐입니다. 폼에서 날짜를 기간 밖으로 바꾸면 그날 일지가 있어도 후보에 없습니다. 화면 검사 고정 데이터의 속도는 서버의 NUMERIC 반올림과 달리 실수로 계산해 소수 둘째 자리 경계에서 다를 수 있지만 지금 데이터에서는 같습니다.
- `npm run test -w frontend -- src/cardio src/period.test.tsx src/routing.test.tsx src/custom-range.test.tsx`: 89 pass. typecheck, eslint, prettier 통과
