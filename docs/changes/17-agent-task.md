# #17 feat: [MVP] 기간별 운동 기록 조회·통계·그래프

- 이슈: https://github.com/sirloinbh/workout-memo/issues/17
- 브랜치: feat/17-agent-task

## 변경 및 검증

### 테스트 단계 — 2026-10-15

- 기준 SHA: `a0ce3245dddf8974f36054d01967ff21efbb5f29`.
- `AGENTS.md`, `workout-implementation`, `workout-testing`을 읽고 기존 이슈와 브랜치를 재사용했다. 테스트와 이 기록만 변경했으며 구현·커밋·푸시·PR 작업은 수행하지 않았다.
- 기존 테스트 4개에 행동 테스트 18개를 추가했다. 새로운 패키지나 검사 명령은 추가하지 않았다. 기존 `npm test`가 새 테스트를 실행한다.

#### 추가한 검증

- `backend/test/period-ui.test.ts`: 실제 프런트엔드 진입점을 TypeScript로 변환해 격리된 VM에서 실행한다. 최소 React hook/element 어댑터와 메모리 API로 표시 값 및 이벤트 핸들러를 검증한다. 소스 문자열의 특정 구현 형태를 검사하지 않는다.
- 1일, 월요일/일요일의 연말 주간, 윤년 2월 및 연말 달력 월간, 기준일까지 최근 28일/84일의 요청 범위를 고정된 기대 날짜와 비교한다. 각 범위의 시작·종료일 및 바로 전후 날짜에 데이터를 놓아 목록·합계·그래프의 포함/제외를 확인한다.
- 모든 기간의 빈 목록과 0일·0세트·0kg 및 0 그래프를 확인한다. 같은 날의 여러 일지는 하루로 계산하며 모든 세트의 총중량 × 반복 수를 합산한다. PostgreSQL numeric 문자열 형태와 소수 중량도 포함한다.
- 수정 창에서 중량을 바꾸고 저장한 뒤 목록 데이터·통계·그래프가 갱신되는지 확인한다. 기록을 삭제하고 마지막 기록까지 삭제한 뒤에도 일수·세트 수·볼륨과 빈 상태가 갱신되는지 확인한다.
- UTC 기기에서 `2026-10-14T15:30:00Z`일 때 기준 날짜가 서울 날짜 `2026-10-15`인지 확인한다.
- `backend/test/period-api.test.ts`: Express HTTP 요청으로 잘못된 달력 날짜, YYYY-MM-DD 형식 오류, 종료일 누락, 역전된 범위를 검증한다. 잘못된 범위는 저장소를 조회하기 전에 400으로 거부해야 한다. 저장소 응답은 모의하므로 DB 통합 검증으로 계산하지 않는다.
- `backend/test/integration.test.ts`: 전용 DB가 있을 때 실제 API 생성 → 경계 조회 → 날짜 수정으로 조회 범위 밖으로 이동 → 삭제를 검증한다. 윤일·월말·연말·28일·84일 경계와 날짜 문자열 및 볼륨을 확인한다. 생성한 ID만 정리하며 기존 데이터를 전체 삭제하지 않는다.

#### 실제 실행 결과

| 명령                                                                                                                                                  | 결과                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (추가 전)                                                                                                                                  | exit 0; pass 3, fail 0, skip 1                                                                                                          |
| `npx prettier --write backend/test/period-ui.test.ts backend/test/period-api.test.ts backend/test/integration.test.ts`                                | exit 0; 테스트 파일 포맷 적용                                                                                                           |
| `node node_modules/prettier/bin/prettier.cjs --write backend/test/period-ui.test.ts backend/test/period-api.test.ts backend/test/integration.test.ts` | exit 0; 최종 테스트 포맷 적용                                                                                                           |
| `npm run typecheck`                                                                                                                                   | 최종 exit 0; frontend/backend 모두 통과. 작성 도중 테스트의 응답 변수 타입 추론 오류를 명시적 `Response` 타입으로 해결한 뒤 재실행      |
| `npm run lint`                                                                                                                                        | exit 0                                                                                                                                  |
| `npm test` (추가 후)                                                                                                                                  | exit 1; pass 18, fail 2, skip 2                                                                                                         |
| `npm run check`                                                                                                                                       | exit 1; format:check·lint·typecheck 통과, 테스트 pass 18 / fail 2 / skip 2에서 중단. 뒤의 test:agents·build는 이 명령에서 실행되지 않음 |
| `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`                                | exit 0                                                                                                                                  |

#### 구현 전 실패 및 구현 단계 인계

1. 서울 기준 오늘 날짜: UTC 기기에서 실제 `2026-10-14`, 기대 `2026-10-15`. 화면의 기본 기준 날짜가 기기 현지 시간대를 사용한다. 서비스 시간대 `Asia/Seoul` 적용이 필요하다.
2. 역전된 조회 범위: `from=2025-01-05&to=2024-12-30`의 실제 HTTP 200, 기대 400. 서버에서 시작일 ≤ 종료일을 검증해야 한다.

이 두 실패를 skip하거나 assertion을 약화하지 않았다. 테스트 어댑터 작성 중 발생한 import 및 타입 오류는 해결했으며 최종 실패는 위 두 사용자 동작뿐이다.

#### 차단 및 검증 한계

- `TEST_DATABASE_URL`이 제공되지 않아 기존 DB 테스트와 새 DB 테스트 모두 skip이다. 실제 DB 검증은 차단되어 있으며 DB 검증 완료로 보고하지 않는다. 구현 후 스키마가 준비된 전용 테스트 DB를 제공해 `npm test`와 최종 `npm run check`를 다시 실행해야 한다.
- 화면 테스트는 실제 컴포넌트의 표시 값과 이벤트 핸들러를 실행하지만 DOM·브라우저·실제 React 스케줄러를 사용하지 않는다. 레이아웃, 키보드/포커스, 브라우저 네트워크 경쟁 조건 및 실제 화면의 날짜별 표시 검토는 별도로 남는다. 모의 API의 필터링 성공을 PostgreSQL 필터링 성공으로 계산하지 않는다.
- 이 환경의 관찰된 Node 버전은 `v22.17.0`으로 프로젝트 기준 `24.21.0`과 다르다. 테스트는 실행됐으나 최종 검증 시 지정 런타임에서도 확인해야 한다.
- 구현 완료 후 같은 테스트를 재실행하고 이 문서에 수정 후 결과를 누적한다. 커밋·푸시·PR 및 독립 검토는 코디네이터 담당이다.

### 테스트 단계 재실행 — 2026-10-15

- 준비된 테스트 18개와 기존 테스트 4개를 검토하고 현재 구현에 대해 재실행했다. 기존 파일을 보존했으며 구현은 수정하지 않았다.
- 이번 실행에는 전용 `TEST_DATABASE_URL`이 제공되었다. 값은 출력하거나 기록하지 않았다. 앞선 실행의 DB 미제공 차단은 이번 실행에서 해소되었다.
- `npm test`: exit 1; **pass 20, fail 2, skip 0**. 실제 PostgreSQL 통합 테스트 2개 모두 통과했다. 기간 시작·종료일 포함과 인접일 제외, 날짜 문자열, 소수 중량 볼륨, 수정으로 범위 밖 이동, 삭제 후 조회를 검증했다.
- `npm run check`: exit 1; format:check·lint·frontend/backend typecheck 통과 후 테스트에서 동일한 **pass 20, fail 2, skip 0**으로 중단했다. 뒤의 test:agents·build는 실행되지 않았다.
- 구현 전 실패 2건은 앞선 실행과 같다: 역전된 조회 범위의 HTTP 200(기대 400), UTC 기기에서 기본 날짜 `2026-10-14`(서울 날짜 기대 `2026-10-15`). 테스트 실패를 그대로 유지해 구현 단계에 인계한다.
- 현재 런타임은 `v22.17.0`이다. 프로젝트 지정 Node `24.21.0`과 실제 브라우저에서의 검증은 여전히 남는다.

### 구현 단계 — 2026-10-15

- 기존 이슈·브랜치·테스트를 재사용했다. 테스트 파일과 assertion은 변경하지 않았으며 이 worktree에서 구현과 문서만 수정했다. 커밋·푸시·PR 및 독립 검토는 코디네이터에게 인계한다.
- `frontend/src/main.tsx`: 기본 기준 날짜를 `Intl.DateTimeFormat`의 명시적 `Asia/Seoul` 시간대에서 구한다. 기간 경계·이전/다음 기간 이동·그래프 구간은 UTC 달력 연산으로 통일해 기기 시간대 및 일광절약시간의 영향을 제거했다. 날짜 라벨도 같은 달력 날짜의 요일을 표시한다.
- `backend/src/app.ts`: 조회 시작일이 종료일보다 늦으면 DB 조회 전에 HTTP 400으로 거부한다. 기존 날짜 형식·실제 달력 날짜 검증은 유지한다.
- 기존 기간별 목록·통계·그래프·편집/삭제 후 재조회 동작은 재사용했다. 기존 행동 테스트에서 1일, 월요일 기준 1주, 달력 월간, 최근 28일/84일의 경계와 빈 상태, 같은 날의 여러 일지 합산 및 수정·삭제 후 통계/그래프 갱신을 확인했다.

#### 실제 실행 결과

| 명령                                                                                                                   | 결과                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                                                                                                             | exit 0; pass 22, fail 0, skip 0. 전용 DB 통합 테스트 2개 포함. 구현 전 실패 2건 모두 해결                                                                          |
| `npm run check`                                                                                                        | exit 0; format:check·lint·frontend/backend typecheck 통과, 앱 테스트 pass 22 / fail 0 / skip 0, test:agents pass 34 / fail 0 / skip 0, frontend/backend build 통과 |
| `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check` | exit 0                                                                                                                                                             |

- 제공된 `TEST_DATABASE_URL`만 사용했다. 값은 열람·출력·기록하지 않았다. DB 관련 차단은 없다.
- 실행 런타임은 Node `v22.17.0`이다. 프로젝트 지정 Node `24.21.0`에서의 실행과 실제 브라우저 레이아웃·포커스·네트워크 경쟁 조건 검증은 수행하지 않았다. 기존 UI 행동 테스트는 격리된 VM의 컴포넌트 이벤트 검증이며 브라우저 검증으로 계산하지 않는다.

### 검토 지적 수정 — 2026-10-15

- 검토의 P2 지적(이전 기간의 지연 응답이 현재 선택 기간을 덮어씀)을 수정했다. `frontend/src/main.tsx`의 조회마다 증가하는 요청 번호를 ref에 유지하고 최신 요청만 목록·통계·그래프의 원본 데이터, 오류 및 로딩 상태를 갱신하도록 했다. 서버 API와 기존 기간 계산 수정은 유지했다.
- `backend/test/period-ui.test.ts`에 응답을 보류하고 원하는 순서로 완료할 수 있는 메모리 API 제어를 추가했다. 기존 테스트와 assertion은 유지했다.
- 회귀 테스트 3개를 추가했다: 이전 성공 응답이 최신 목록·통계·그래프를 덮어쓰지 않음, 이전 실패 응답이 현재 화면에 오류를 표시하지 않음, 이전 응답이 최신 조회의 로딩 상태를 해제하지 않음.
- 수정 전 재현에서 최신 3월 1일의 2,000kg이 이전 2월 29일의 1,000kg으로 바뀌었다. 오류·로딩 회귀도 수정 전에 실패하고 수정 후 통과했다.

#### 실제 실행 결과

- `node node_modules/tsx/dist/cli.mjs --test backend/test/period-ui.test.ts`: 수정 전 exit 1; pass 16, fail 3, skip 0. 수정 후 exit 0; pass 19, fail 0, skip 0.
- `node node_modules/prettier/bin/prettier.cjs --write frontend/src/main.tsx backend/test/period-ui.test.ts`: exit 0; 포맷 변경 없음.
- `npm run check`: exit 0; format:check·lint·frontend/backend typecheck 통과, 앱 테스트 pass 25 / fail 0 / skip 0(전용 DB 통합 2개 포함), 워커 테스트 pass 34 / fail 0 / skip 0, frontend/backend build 통과.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`: exit 0.
- 제공된 전용 `TEST_DATABASE_URL`만 테스트가 사용했으며 값을 출력하거나 기록하지 않았다. DB 차단은 없다.
- 실제 브라우저 대신 VM에서 응답 순서를 역전시켜 검증했다. 실제 브라우저 및 지정 Node 버전 검증은 여전히 미실행이다. 모든 변경은 미커밋 상태로 코디네이터의 검증·독립 검토에 인계한다.

### 테스트 단계 재확인 — 2026-10-15

- 이번 테스트 단계 시작 시 응답 순서 보호 구현과 회귀 테스트 3개가 이미 작업 트리에 있었다. 기존 테스트·assertion·구현을 보존하고 중복 테스트를 추가하지 않았다. 이번 단계의 변경은 이 실행 기록뿐이며 커밋·푸시·PR 작업은 수행하지 않았다.
- 기존 회귀 테스트는 이전 성공 응답의 목록·통계·그래프 덮어쓰기, 이전 실패 응답의 오류 표시, 최신 요청이 대기 중일 때 이전 응답의 로딩 해제를 각각 검증한다. 수정 전 실패는 위 단계의 기록이며 이번 실행에서 구현을 되돌려 재현하지 않았다.
- `npm test`: exit 0; **pass 25, fail 0, skip 0**. 응답 순서 회귀 3개와 전용 PostgreSQL 통합 테스트 2개가 모두 통과했다. 제공된 전용 `TEST_DATABASE_URL`은 테스트 실행에만 사용했으며 값을 열람·출력·기록하지 않았다.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`: exit 0 (문서 추가 전).
- 구현·테스트 변경이 없으므로 이미 기록된 전체 `npm run check`를 반복하지 않았다. 이번 단계는 실제 브라우저 및 지정 Node 버전 검증을 수행하지 않았다. 실행 차단은 없다.

### 구현 단계 재확인 — 2026-10-15

- 이전 검토의 P2 수정과 응답 순서 회귀 테스트 3개가 이미 존재함을 확인했다. 최신 요청 번호로 성공 데이터·오류·로딩 상태를 모두 보호한다. 기존 구현과 테스트·assertion은 수정하지 않고 보존했다. 이번 단계는 검증 기록만 추가했다.
- `npm run check`: exit 0; format:check·lint·frontend/backend typecheck 통과, 앱 테스트 pass 25 / fail 0 / skip 0(전용 PostgreSQL 통합 2개와 응답 순서 회귀 3개 포함), 워커 테스트 pass 34 / fail 0 / skip 0, frontend/backend build 통과.
- `node node_modules/prettier/bin/prettier.cjs --check docs/changes/17-agent-task.md` 및 `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`: exit 0.
- 테스트에는 제공된 전용 TEST_DATABASE_URL만 사용했고 값을 열람·출력·기록하지 않았다. 실행 차단은 없다.
- 실제 브라우저 및 프로젝트 지정 Node 버전 검증은 이번 단계에서 수행하지 않았다. 모든 변경을 미커밋 상태로 유지하며 독립 검토와 커밋·푸시·PR은 코디네이터에게 맡긴다.

### 두 번째 검토 지적 수정 — 2026-10-15

- P2 지적: 삭제 요청을 보낸 뒤 기준 날짜를 변경하면 삭제 완료 시 이전 기간의 `refresh`가 새 요청 번호를 얻어 현재 목록·통계·그래프를 덮어썼다. 편집 저장도 같은 공통 `action`을 사용해 같은 문제가 있었다.
- `frontend/src/main.tsx`: 기간 조회 effect에서 최신 `refresh`를 ref에 보관하고, 변경 요청 완료 후 그 최신 함수를 호출한다. 기존 응답 번호 보호를 유지하며 삭제·저장 후 현재 선택 기간을 다시 조회한다.
- `backend/test/period-ui.test.ts`: PUT/DELETE 완료를 보류할 수 있는 메모리 API 제어와 회귀 테스트 2개를 추가했다. 삭제 대기 중 날짜 변경, 편집 저장 대기 중 날짜·기간 변경을 각각 검증한다. 완료 후 현재 기간 재조회, 목록, 운동 일수, 세트 수, 볼륨, 그래프 및 오류 없음까지 확인한다. 기존 테스트와 assertion은 보존했다.
- 수정 전 두 테스트 모두 이전 `2024-02-29`를 다시 조회해 실패했다. 수정 후 현재 선택한 `2024-03-01`의 일간 또는 3월 월간 범위를 조회한다.

#### 실제 실행 결과

- `node node_modules/tsx/dist/cli.mjs --test backend/test/period-ui.test.ts`: 수정 전 exit 1; pass 19, fail 2, skip 0. 구현 수정 직후 exit 1; pass 20, fail 1, skip 0. 남은 실패는 새 월간 테스트가 같은 그래프 구간의 합계 5,000kg을 개별 일지 볼륨 3,000kg으로 잘못 기대한 것이었다. 해당 기대값을 고정 데이터의 합계 5,000kg으로 바로잡았으며 기존 assertion은 변경하지 않았다.
- `node node_modules/prettier/bin/prettier.cjs --write frontend/src/main.tsx backend/test/period-ui.test.ts`: exit 0; 포맷 변경 없음.
- 첫 `npm run check`: exit 1; format:check·lint·typecheck 통과, 앱 pass 26 / fail 1 / skip 0(위 신규 그래프 기대값 오류), 워커·빌드 미실행.
- 기대값 수정 후 최종 `npm run check`: exit 0; format:check·lint·frontend/backend typecheck 통과, 앱 **pass 27 / fail 0 / skip 0**(전용 PostgreSQL 통합 2개 및 새 회귀 2개 포함), 워커 **pass 34 / fail 0 / skip 0**, frontend/backend build 통과.
- 문서 갱신 후 `node node_modules/prettier/bin/prettier.cjs --check docs/changes/17-agent-task.md` 및 `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`: exit 0.
- 제공된 전용 `TEST_DATABASE_URL`만 테스트에 사용했으며 값은 열람·출력·기록하지 않았다. 실행 차단은 없다.
- `node --version`: `v22.17.0`. 실제 브라우저 및 지정 Node `24.21.0` 검증은 수행하지 않았다. VM의 이벤트·응답 순서 검증을 브라우저 검증으로 계산하지 않는다.
- 변경은 이 worktree에 미커밋으로 유지했다. 이슈·브랜치 생성, 커밋·푸시·PR, 승인·병합 및 추가 에이전트 실행은 수행하지 않았다.

### 테스트 단계 최종 재확인 — 2026-10-16

- `AGENTS.md`, `workout-implementation`, `workout-testing`을 읽고 준비된 이슈·브랜치·테스트를 재사용했다. 기간 경계·빈 상태·통계·그래프·수정/삭제 및 응답 순서 테스트가 이미 있어 중복 추가하지 않았다. 이번 단계에서는 구현과 테스트를 변경하지 않고 실행 기록만 추가했다.
- 지연된 삭제·편집 완료 후 현재 선택 기간을 재조회하는 회귀 테스트 2개를 확인했다. 기존의 응답 순서 회귀 3개도 유지했다. 수정 전 실패는 위 구현 단계의 관찰 기록이며 이번 단계에서 구현을 되돌려 재현하지 않았다.
- `npm test`: exit 0; **pass 27, fail 0, skip 0**. 새 회귀 2개와 실제 PostgreSQL 통합 테스트 2개 모두 통과했다. 제공된 전용 `TEST_DATABASE_URL`만 테스트가 사용했으며 값을 열람·출력·기록하지 않았다. 실행 차단은 없다.
- `node node_modules/prettier/bin/prettier.cjs --check docs/changes/17-agent-task.md`: exit 0. `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`: 문서 추가 전후 모두 exit 0.
- 구현·테스트 변경이 없고 직전 구현 단계의 전체 검사가 통과했으므로 이번 단계는 `npm run check`를 반복하지 않았다. 실제 브라우저 및 지정 Node 버전 검증은 수행하지 않았다. 모든 변경을 미커밋 상태로 유지했다.

### 구현 단계 최종 재확인 — 2026-10-16

- 준비된 구현에서 이전 P2 지적의 수정이 이미 적용되어 있음을 확인했다. 변경 작업 완료 시 `latestRefresh.current()`로 현재 선택 기간을 재조회하며, 조회 응답 번호로 이전 성공·실패·로딩 완료의 상태 덮어쓰기를 막는다. 추가 구현 변경은 필요하지 않아 기존 코드와 assertion을 보존했다.
- Node의 SHA-256으로 테스트 파일 3개의 해시를 확인했고 전달받은 테스트 단계 해시와 모두 동일했다. 이번 단계의 변경은 이 작업 기록뿐이다.
- `npm run check`: exit 0; format:check·lint·frontend/backend typecheck 통과, 앱 **pass 27 / fail 0 / skip 0**(전용 PostgreSQL 통합 2개와 응답 순서 회귀 5개 포함), 워커 **pass 34 / fail 0 / skip 0**, frontend/backend build 통과.
- 제공된 전용 `TEST_DATABASE_URL`만 테스트에서 사용했으며 값을 열람·출력·기록하지 않았다. DB·의존성·실행 권한 차단은 없다. 읽기 전용 Git 상태 조회에서 전역 ignore 파일 접근 경고가 있었지만 조회는 exit 0으로 완료했으며 설정을 변경하지 않았다.
- `node -e`로 확인한 런타임은 `v22.17.0`이다. 실제 브라우저 및 지정 Node `24.21.0` 검증은 수행하지 않았다. 변경은 미커밋 상태이며 독립 검토와 커밋·푸시·PR은 코디네이터가 담당한다.
- 문서 갱신 후 `node node_modules/prettier/bin/prettier.cjs --check docs/changes/17-agent-task.md`와 `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`: 모두 exit 0.

### PR 생성 후 리뷰 보완 — 2026-10-16

- 사용자가 PR #40의 추가 코드 리뷰에서 제안한 브라우저 검증과 PR 설명 정정을 승인했다. 앱 코드·테스트·스킬은 변경하지 않았다.
- 검증 대상 앱 커밋: `1a7c6483c591f46c8190dce53b05d517e57a6322`. 해당 커밋의 프로덕션 빌드와 전용 PostgreSQL 테스트 DB, loopback 서버, 사용자 프로필과 분리된 headless Chrome을 사용했다.
- `node .local/agent-workflow/browser-check-17.mjs` (저장소 루트, ignored 검사기): 최종 exit 0. PC 1440×1000 및 모바일 에뮬레이션 390×844에서 1일·월요일 기준 1주·윤년 2월·최근 28일/84일의 실제 화면 기간 경계, 누적 볼륨과 그래프, 수평 넘침 없음을 확인했다. 모바일 크기에서 200→250 kg 수정 후 볼륨 3,000→3,500 kg 및 그래프 갱신, 새로고침 후 보존, 삭제 후 1,000 kg, 빈 날짜의 0 통계·빈 그래프를 확인했다.
- 첫 실행은 화면 검사가 모두 통과했지만 정리 단계에서 이미 UI로 삭제한 fixture를 다시 삭제해 404로 종료했다. ignored 검사기에서 정리용 DELETE의 404를 허용하고 남은 fixture를 정리한 후 전체를 재실행해 통과했다. 앱 오류로 계산하지 않는다. 이 검사에서 만든 fixture만 삭제했다.
- 화면 캡처 `browser-desktop.png`, `browser-mobile.png`를 ignored `.local/agent-workflow/jobs/17/`에 보관하고 직접 확인했다. 실제 모바일 기기·Safari·Firefox·터치 및 포커스 이동 검증은 포함하지 않는다. 캡처와 검사기는 로컬 증거이며 GitHub에 업로드하지 않았다.
- PR 본문은 최종 게시/CI 상태 및 위 검증 범위를 반영해 갱신한다. 이전 단계의 미커밋·브라우저 미검증 기록은 당시 이력으로 보존한다. PR 병합은 사용자가 수행한다.
- 호스트 최종 재검사: 지정 Node `24.21.0` 및 npm `11.19.0`, 전용 `TEST_DATABASE_URL`로 `npm run check` exit 0. 포맷·lint·타입 검사, 앱 **27 pass / 0 fail / 0 skip**(DB 통합 2개 포함), 워커 **34 pass / 0 fail / 0 skip**, frontend/backend 빌드 모두 통과했다. 로그: ignored `.local/agent-workflow/jobs/17/post-review-check.log`. 문서만 추가했으므로 앱 테스트 코드는 새로 추가하지 않았다.
