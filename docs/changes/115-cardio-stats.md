# #115 유산소 기록 화면 ② 통계 부품과 개인 기록 API

- 이슈: [#115](https://github.com/sirloinbh/workout-memo/issues/115)
- 브랜치: `feat/115-cardio-stats`
- 선행: PR ①(폼·목록·수정·삭제 부품, [115-cardio-form.md](115-cardio-form.md), 병합됨), #116(유산소 목표, 병합됨)

## 목적

#115는 PR 세 개로 나눕니다(2026-11-08 사용자 결정의 진행 순서). 이 PR은 둘째로, 유산소 탭에 들어갈 통계를 `frontend/src/cardio/`의 독립 부품과 테스트로 만들고, 전체 기간 개인 기록을 돌려주는 API 하나를 더합니다. 운동 일지 화면은 #105가 고치는 중이라 이번에도 앱에 연결하지 않습니다.

| PR  | 내용                                                |
| --- | --------------------------------------------------- |
| ①   | 폼·목록·수정·삭제 부품(병합됨)                      |
| ②   | 통계 부품과 개인 기록 API(이 PR)                    |
| ③   | 운동 일지의 근력/유산소 탭 연결, 대시보드 요약, e2e |

대시보드 요약 카드(결정 5)는 이 PR 범위에서 빠졌습니다. 대시보드가 `app.tsx`에 있어 PR ③에서 탭 연결과 함께 만듭니다.

## 변경 — feat: 기간 통계 부품

- `frontend/src/cardio/stats.ts`(새 파일): 화면 계산만 하는 순수 함수. 패널이 이미 불러온 기간(`from`~`to`)의 기록으로 계산하므로 요청을 더 하지 않습니다.
  - `weekStart(date)`: 그 주의 월요일. 한 주는 월요일에 시작합니다(AGENTS.project.md, #140). 일요일은 6일 전 월요일의 주입니다.
  - `bucketsOf(sessions, from, to, 'week' | 'month')`: 기간에 걸친 달력 주(월~일)·달력 월마다 거리 km·시간 초·횟수 합계. 기록이 없는 주·월도 0으로 넣어 시간 축이 끊기지 않습니다. 기간 밖으로 걸친 주·월도 기간 안의 기록만 셉니다(유산소 목표 #116과 같음). 라벨은 주의 월요일 `11/2`, 월 `11월`(기간이 해를 넘으면 `25.12`).
  - `totalsOf`: 합계. km 합의 부동소수 오차를 소수 셋째 자리에서 정리합니다(5.02 + 3.1 → 8.12).
  - `kindsOf`: 기록이 있는 종류를 종류 목록 순으로.
  - `runningPaces`: 러닝 기록마다 페이스(초/km, `format.ts`의 `paceOf`). 날짜·시작 시각·ID 순이고, 거리가 없는 기록은 0으로 그리지 않고 뺍니다.
  - 거리가 없는 기록은 시간과 횟수에만 더하고 거리는 추정하지 않습니다.
- `frontend/src/cardio/cardio-stats.tsx`(새 파일): `CardioStats({ from, to, sessions, refreshKey? })`. PR ③은 `CardioPanel` 옆에 같은 기간과 기록을 넘겨 놓기만 하면 됩니다.
  - 기간 합계: 거리·시간·횟수(`dl`, `aria-label="기간 합계"`). 여러 종류를 더한 거리는 km입니다.
  - `SegmentedControl` 두 개: "집계 단위"(주별·월별)와 "지표"(거리·시간·횟수). 집계 단위의 처음 값은 기간이 92일을 넘으면 월별, 아니면 주별입니다(운동 볼륨 차트의 `rangeBuckets` 기준과 같음).
  - 전체 추이 막대 차트와, 종류가 둘 이상이면 종류별 작은 막대 차트. 공통 토큰이 흑백이라 색으로 나눈 누적 막대 대신 종류마다 차트를 따로 그립니다. 막대는 운동 볼륨 차트처럼 위가 둥근 `bg-primary`이고, 차트마다 `role="img"`와 값을 모두 읽어 주는 `aria-label`(예: "전체 주별 거리: 11/2 주 6.52 km, 11/9 주 5 km")이 있습니다. 거리 지표인데 거리를 입력한 기록이 없으면 차트 대신 "거리를 입력한 기록이 없습니다"를 보여 줍니다.
  - 종류별 합계 표(`caption` "종류별 합계"): 종류·횟수·시간·거리. 거리가 하나도 없는 종류는 "거리 미입력"입니다.
  - 러닝 페이스 추이: 신체 기록 추이와 같은 SVG 선 그래프이고, 빠른 페이스가 위에 오게 그립니다. `aria-label`은 "러닝 페이스 추이(위가 빠름): 2026-11-03 6:05/km, …"이며 제목은 `role="img"` 밖에 둬 화면 낭독기가 읽습니다. 거리를 입력한 러닝 기록이 없으면 안내 문구만 보입니다.
  - 기간에 기록이 없으면 공통 `EmptyState`("선택한 기간에 통계를 낼 유산소 기록이 없습니다")입니다. 개인 기록은 기간과 무관해 그대로 보입니다.
- 단위는 PR ①과 같습니다. 페이스 `m:ss/km`, 시간 `h:mm:ss`/`m:ss`, 거리 km(소수 셋째 자리까지), 수영만 m(`1,500 m`). `format.ts`의 함수를 그대로 씁니다.

## 변경 — feat: 개인 기록 API와 부품

- `GET /api/cardio-sessions/records`(`backend/src/routes/cardio.ts`의 `cardioRecords`): 기간과 상관없이 모든 기록에서 찾습니다. 받는 입력이 없어 Zod 검사와 400이 없습니다.
  - `longest`: 거리가 있는 종류마다 가장 긴 기록 1개 `{ kind, id, date, distance_km, duration_sec }`. 순서는 종류 목록 순(러닝 먼저)이고, 같은 거리면 날짜가 이른 기록입니다.
  - `best5k`·`best10k`: 러닝 중 거리가 5km·10km의 ±2%(4.9~5.1 km, 9.8~10.2 km, 경계 포함)인 기록에서 전체 시간이 가장 짧은 기록 `{ id, date, distance_km, duration_sec }` 또는 `null`. 더 긴 기록의 시간을 페이스로 줄여 추정하지 않습니다(결정 4). 범위는 SQL에서 `$1::numeric * 0.98`~`* 1.02`로 계산해 4.9·5.1이 부동소수 오차 없이 정확한 경계입니다. 같은 시간이면 날짜가 이른 기록입니다.
  - `/api/cardio-sessions/:id`보다 먼저 등록해 `records`가 ID로 읽히지 않습니다.
  - `docs/api.md`의 엔드포인트 표와 "유산소 개인 기록" 절, `backend/src/openapi.ts`의 operation(200)을 더하고 `npm run openapi`로 `docs/openapi.json`을 다시 만들었습니다.
- `frontend/src/cardio/api.ts`: `getCardioRecords()`와 `CardioRecord`·`CardioRecords` 타입.
- `frontend/src/cardio/cardio-records.tsx`(새 파일): `CardioRecords({ refreshKey? })`. `CardioStats` 아래에 들어 있고 혼자 써도 됩니다. 처음 그릴 때와 `refreshKey`가 바뀔 때 불러오며, 가장 최근 요청만 화면을 바꿉니다.
  - "5km 최고 기록 24:30 5.02 km · 4:53/km · 2026-11-02", 없으면 "4.9~5.1 km 러닝 기록이 없습니다". 10km도 같습니다.
  - "러닝 최장 거리 21.1 km 2:03:00 · 2026-10-26", 수영은 "1,500 m".
  - 기록이 하나도 없으면 `EmptyState`("아직 개인 기록이 없습니다"), 불러오기 실패는 `AlertBanner`와 "다시 연결" 버튼입니다.

## 테스트

- 추가: `frontend/src/cardio/stats.test.ts` 5개
  - 월요일 경계: 11/8(일) → 11/2 주, 11/9(월) → 새 주, 해를 넘는 1/1 → 12/29 주. 수요일에 시작한 기간의 첫 주는 10/26 주이고 빈 주도 0으로 들어감. 거리 없는 기록은 시간·횟수만.
  - 기간 밖 날짜(같은 주라도)는 세지 않음.
  - 월별 합계(10월·11월·빈 12월), 해를 넘는 라벨 `25.12`·`26.1`.
  - 합계의 부동소수 정리(9.62 km), 종류 순서.
  - 러닝 페이스: 날짜·시작 시각 순, 걷기와 거리 없는 러닝 제외.
- 추가: `frontend/src/cardio/cardio-stats.test.tsx` 7개(`mockApi`, 역할·접근 이름으로 검사)
  - 주별: 기간 합계(11.52 km, 1:45:30, 4회), 전체·러닝·수영 차트의 `aria-label`(11/2 주와 11/9 주가 일요일→월요일로 갈림, 수영은 `1,500 m`), 지표를 횟수·시간으로 바꾼 차트.
  - 월별 차트와 종류별 합계 표.
  - 러닝 페이스 추이: 거리 없는 러닝은 빠짐, "가장 빠름 5:00/km".
  - 한 종류뿐이면 종류별 차트 없음, 거리 없는 기록만 있으면 거리 안내·페이스 안내·"거리 미입력".
  - 빈 기간 `EmptyState`(단위 선택 없음)와 개인 기록 빈 상태.
  - 개인 기록: `/api/cardio-sessions/records` 요청, 5km 기록 표시, 10km 없음 안내, 러닝 km·수영 m 최장 거리.
  - 개인 기록 불러오기 실패 → `alert`와 "다시 연결" → 다시 불러와 빈 상태.
- 추가: `backend/test/cardio.test.ts` 1개(DB 없이 가짜 pool): `records`가 ID로 읽히지 않고 쿼리 3개, 5·10 매개변수와 `BETWEEN $1::numeric * 0.98 AND $1::numeric * 1.02`, 러닝만, 시간 순 정렬, 최장 거리를 종류 목록 순으로 정렬.
- 추가: `backend/test/cardio.integration.test.ts` 1개(PostgreSQL): 기록이 없으면 `{ longest: [], best5k: null, best10k: null }`. 4.89·5.11·9.79·10.21 km는 더 빨라도 5·10km 기록이 아님(10.21 km는 러닝 최장 거리). 걷기 5 km는 5km 기록이 아님. 거리 없는 실내 자전거는 최장 거리에 없음. 4.9·9.8 km가 기록이 되고, 더 빠른 5.1·10.2 km가 이를 바꿈. 같은 시간의 늦은 기록은 바꾸지 않음.
- 실행 결과
  - `npm run test -w frontend -- src/cardio`: 5 files, 43 pass
  - `cd backend && ../node_modules/.bin/tsx --test test/cardio.test.ts test/api-contract.test.ts test/openapi.test.ts`: 19 pass
  - `npm run typecheck -w frontend`, `npm run typecheck -w backend`: 통과
  - `node_modules/.bin/eslint`·`node_modules/.bin/prettier --check`(바꾼 파일): 통과
  - `backend/test/cardio.integration.test.ts`: 로컬 PostgreSQL이 꺼져 있어 `ECONNREFUSED`로 실행하지 못했습니다(기존 4개 포함). CI에서 확인합니다.
- 로컬 전체 `npm test`·`npm run check`·e2e는 메모리 부족 이력이 있어 실행하지 않았습니다. CI에서 확인합니다.

## 한계와 남은 일

- 아직 앱 어디에도 연결하지 않았습니다. 유산소 탭 배치, 대시보드 요약 카드, 390px e2e·화면 공통 검사는 PR ③입니다. 연결 전이라 knip이 `CardioStats`를 쓰지 않는 내보내기로 경고할 수 있습니다(CI에서 경고만).
- `CardioPanel`은 불러온 기록을 밖으로 내보내지 않습니다. PR ③에서 기록 상태를 탭으로 올리거나 패널에 불러온 뒤 알림을 더해 `CardioStats`에 같은 목록과 `refreshKey`를 넘겨야 합니다.
- 실제 브라우저의 차트 모양(390px에서 주 수가 많을 때의 라벨, 막대 너비)은 jsdom으로 확인하지 못했습니다. 라벨은 전체 차트 12개, 종류별 차트 6개까지만 그리고 나머지는 건너뜁니다.
- 페이스 그래프의 가로축은 날짜 간격이 아니라 기록 순서입니다. 같은 날 기록이 겹치지 않게 하려는 선택이며, 처음·마지막 날짜만 축에 적습니다.
- 개인 기록은 기간 통계와 따로 불러오므로, 기록을 저장·삭제한 뒤에는 PR ③에서 `refreshKey`를 바꿔야 새 기록이 반영됩니다.

- 주 에이전트 확인: 5km·10km 최고 기록은 ±2% 안의 기록끼리 운동 시간을 그대로 비교합니다. 그래서 4.9 km 기록이 페이스가 조금 느려도 5.1 km 기록보다 앞설 수 있습니다. 추정하지 않는다는 결정(4)을 따른 결과이며, 바꾸려면 페이스 비교로 바꾸는 별도 결정이 필요합니다.
- 이 PR은 구현을 하위 에이전트에 맡겼습니다. 주 에이전트가 기록 SQL과 코드를 읽고 `npm run test -w frontend -- src/cardio`(43 pass), `tsx --test test/cardio.test.ts test/api-contract.test.ts test/openapi.test.ts`(19 pass), typecheck, eslint, prettier, `test:docs`를 다시 돌려 확인했습니다.
