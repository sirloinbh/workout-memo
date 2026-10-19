# #27 feat: 분할·운동 부위 선택 기반 12주 루틴과 주차별 증가·디로딩 계획

- 이슈: https://github.com/sirloinbh/workout-memo/issues/27
- 브랜치: feat/27-agent-task

## 변경 및 검증

작업 에이전트가 실제 변경·검증 결과를 기록한다.

## 테스트 단계 — 2026-10-19 (Asia/Seoul)

- 역할: tests. 기존 이슈 #27, 기존 브랜치와 worktree를 재사용했다. 구현 파일, 커밋, 원격 저장소는 변경하지 않았다.
- 기준 SHA: `c827abbe3a29d404ab42faa60a6a8f0c72ba9817`.
- 적용 지침: `AGENTS.md`, `skills/workout-implementation/SKILL.md`, `skills/workout-testing/SKILL.md`. 워커 지시에 따라 테스트·기록만 작성했다.

### 추가한 테스트와 검증 의도

- `backend/test/routine-fixture.ts`: 명시적으로 입력한 시작일·빈도·휴식일, 운동별 세트·총중량·반복 수, 12주 수동 목표의 공용 예제다. 사용자 규칙을 자동 계산으로 대체하지 않는다.
- `backend/test/routines.test.ts`: 다섯 분할, 일곱 부위의 단일/다중/동일 분할 내 중복 및 분할 간 중복 보존, 사용자 지정 디로딩 감소 대상·감소량을 검사한다. API의 잘못된 분할·부위·날짜·휴식일·빈도·주차·목표 수치·운동 기준값·4주 주기 위반 46건은 저장소 접근 전에 400과 오류 메시지로 거부되어야 한다.
- `backend/test/routines.integration.test.ts`: 다섯 분할의 생성→목록→상세→새 서버/새 DB 연결의 재조회, 순서·중복·수동 목표 보존을 전용 DB로 검사한다. 윤일이자 휴식일인 2024-02-29부터 84일 동안 월/수/금 총 36회만 배치하고, 운동일마다 분할을 순환하며 주 경계에서 순환을 초기화하지 않는지 검사한다. 디로딩은 4·8·12주차이며 5주차 수동 증가량 7.25 kg를 자동 재설정하지 않는다. 루틴 저장이 실제 일지 세트나 기존 #18 목표를 만들지 않는지도 확인한다.
- `backend/test/routines-ui.test.ts`: 기존 `period-ui.test.ts`와 같은 설치된 TypeScript/Node 기반 렌더링 어댑터로 실제 프런트엔드 진입점을 실행한다. 루틴 조회 요청, 1~12주차와 각 디로딩 표시, 기준 총중량과 수동 증가량, 부위 중복 표시, 새 마운트 후 서버 재조회, 조회 시 변경 요청이 없는지를 검사한다. 어댑터는 상대경로의 새 컴포넌트 모듈도 불러올 수 있다.

### 구현 단계에 전달할 테스트용 인터페이스 제안

아직 루틴 API가 없으므로 아래 이름은 테스트가 사용하는 인터페이스 제안이다. 제품 요구사항에 없는 별도 사용자 정책이 아니다. 구현에서 다른 형태가 필요하면 동작 검증을 유지하면서 fixture/어댑터를 함께 조정한다.

- 서버 입력 스키마: 기존 `backend/src/domain.ts`의 다른 스키마와 함께 `routineSchema`를 제공한다.
- `POST /api/routines`: 입력을 저장하고 201 및 `{ id }`를 반환한다. `GET /api/routines`는 ID를 포함한 목록, `GET /api/routines/:id`는 전체 계획을 반환한다.
- 입력: `name`, `start_date` (YYYY-MM-DD), `split_count` (1~5), `weekly_workouts`, `rest_days` (일요일=0~토요일=6), `splits`, `weeks`.
- 분할: `{ name, body_parts: string[], exercises: [{ exercise, sets, weight, reps }] }`. 부위 배열의 순서와 중복을 보존한다. `weight`는 머신 기본중량을 포함한 총중량 kg이며 0 kg도 허용한다.
- 주차: `{ week, kind, amount, deload_metric }`. 일반 주차의 `kind`는 `increase_weight` 또는 `increase_reps`, `deload_metric`은 null이다. 4·8·12주차는 `kind: deload`이고 `deload_metric`은 사용자가 지정한 `weight`, `sets`, `reps` 중 하나다. `amount`는 명시적인 양수 변화량이며 횟수/세트 변화량은 정수다. 자동 비율이나 디로딩 이후 자동 목표를 넣지 않는다.
- 상세 응답은 위 입력과 `id`, `schedule: [{ date, week, split_index, is_deload }]`를 포함한다. `split_index`는 0부터 시작한다. 주차는 시작일부터 7일 단위이며 전체 범위는 시작일 포함 84일이다.
- 통합 테스트 정리는 `routines` 테이블에서 테스트가 생성한 ID만 삭제한다. 스키마가 다르면 정리 구문도 함께 조정한다.
- UI의 진입 버튼 이름은 `루틴짜기`이며, 목록에서 상세 화면을 여는 구조라면 `계획 보기` 버튼을 사용한다. 주차 표기는 `N주차`, 디로딩은 해당 주차 행/항목에서 구분한다.

### 실제 실행 명령 및 결과

- `npx --no-install prettier --write backend/test/routine-fixture.ts backend/test/routines.test.ts backend/test/routines.integration.test.ts backend/test/routines-ui.test.ts`: 성공. 테스트 보완 후 변경된 두 파일에도 다시 실행했다.
- `node node_modules/tsx/dist/cli.mjs --test backend/test/routines.test.ts backend/test/routines.integration.test.ts backend/test/routines-ui.test.ts`: 구현 전 기대 실패. 최초 실행 및 최종 테스트 보완 후 실행 모두 **56 tests / 0 pass / 56 fail / 0 skip**, 종료 코드 1. 하위 테스트와 실패한 상위 테스트를 함께 센 Node 출력이다. 원인은 `routineSchema` 부재, POST API의 404 (기대 400/201), `루틴짜기` 진입 버튼 부재다. 실패를 skip하거나 검증을 약화하지 않았다.
- 최종 신규 테스트 실행은 Node `spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--test', ...세 테스트 경로], { encoding: 'utf8' })`로 같은 명령을 실행하고 TAP 집계만 출력했다.
- 기존 테스트 회귀 검사: Node에서 `fs.readdirSync('backend/test').filter(name => name.endsWith('.test.ts') && !name.startsWith('routines')).map(name => 'backend/test/' + name)`으로 기존 파일을 선택한 뒤 위 `spawnSync` 방식으로 실행했다. **118 tests / 118 pass / 0 fail / 0 skip**, 종료 코드 0. 기존 테스트 파일은 수정하지 않았다.
- `npm run typecheck -w backend`: 통과, 종료 코드 0.
- 최종 `npx --no-install prettier --check backend/test/routine-fixture.ts backend/test/routines.test.ts backend/test/routines.integration.test.ts backend/test/routines-ui.test.ts docs/changes/27-agent-task.md`: 전체 대상 통과, 종료 코드 0. 최종 백엔드 타입 검사도 다시 통과했다.
- `npx --no-install eslint backend/test/routine-fixture.ts backend/test/routines.test.ts backend/test/routines.integration.test.ts backend/test/routines-ui.test.ts --max-warnings 0`: 통과, 종료 코드 0.
- 전용 DB 설정 여부만 출력하는 `node -e "console.log('Dedicated test DB configured:',Boolean(process.env.TEST_DATABASE_URL))"`: true. 연결 문자열은 출력하지 않았다.
- PowerShell 단일 인용 here-string을 `node --input-type=module`로 전달하여 `new Pool({ connectionString: process.env.TEST_DATABASE_URL })`에서 `SELECT to_regclass('workouts') IS NOT NULL AS workouts_ready, to_regclass('goals') IS NOT NULL AS goals_ready` 실행: 두 값 모두 true. DB가 준비되어 있으며 신규 통합 테스트의 실패는 환경 차단이 아닌 미구현 API 때문이다. 앞선 `node -e` 형태의 동일 probe는 PowerShell 인용 처리로 SyntaxError가 발생했고, here-string으로 고쳐 성공했다.

### 제한과 다음 단계

- tests 역할의 완료는 구현 전 실패 재현까지다. 구현 후 위 신규 테스트와 `npm run check`를 실행하고 실제 결과를 추가해야 한다. 현재 새 기능이 통과했다고 보고하지 않는다.
- 실제 브라우저에서 루틴 작성→분할/부위 중복 입력→운동 기준값/12주 목표/디로딩 입력→저장→페이지 재접속을 확인해야 한다. 현재 UI 자동 테스트는 서버에 저장된 계획의 조회·표시에 초점을 두며 작성 폼의 입력/저장 전체 흐름, 브라우저 레이아웃·포커스·네이티브 유효성 검사·React 스케줄링을 검증했다고 주장하지 않는다. 구현 단계에서 폼 구조에 맞는 입력·저장 테스트를 추가한다.
- 실행 환경의 Node는 v22.17.0이다. 저장소가 지정한 Node 24.21.0/npm 11.19.0 환경의 최종 검사는 코디네이터가 확인해야 한다. 이번 명령에서 버전으로 인한 실행 차단은 없었다.
- 테스트 및 문서는 미커밋 상태로 남겼다. 커밋·푸시·PR·CI 확인은 코디네이터, 병합은 사용자 담당이다.

## 구현 단계 — 2026-10-19 (Asia/Seoul)

- implementation 역할로 기존 이슈·브랜치·worktree를 재사용했다. 추가 에이전트, 이슈/브랜치 생성, 커밋, 푸시, PR 및 병합 작업은 수행하지 않았다. 별도로 전달된 이전 reviewer finding은 없었다.
- 서버에 `routineSchema`와 84일 일정 생성 함수를 추가했다. 다섯 분할/일곱 부위, 동일 분할 내 중복과 순서, 직접 입력한 운동 기준값, 수동 주차별 변화량을 유지한다. 시작일부터 7일씩 주차를 구분하고 휴식 요일을 제외한 운동일마다 분할을 연속 순환한다. 4·8·12주차만 디로딩이며 감소 대상과 양수 감소량을 명시해야 한다. 횟수/세트는 정수로 검사한다.
- `POST /api/routines`, `GET /api/routines`, `GET /api/routines/:id`를 추가했다. 유효성 검사 후 단일 JSONB 문서 INSERT로 원자적으로 저장한다. 목록과 상세는 DB에서 조회하며 계획과 일정을 반환한다. 실제 일지/기존 #18 목표를 생성하지 않는다.
- `database/migrations/003_routines.sql`에 routines 테이블을 추가했다. 부위와 운동 배열의 순서·중복을 JSON 배열 그대로 보존한다. 기존 DB 적용 절차와 사용자 기능 설명을 database/README.md 및 README.md에 추가했다. CI는 기존 파일명 순서 마이그레이션 루프를 그대로 사용한다.
- `frontend/src/routines.tsx`에 작성·목록·상세 화면을 추가하고 기존 메뉴에 루틴짜기를 연결했다. 부위 버튼을 반복해서 눌러 중복 추가하고 개별 항목을 삭제할 수 있다. 운동 기준값, 시작일, 빈도, 휴식 요일, 주차별 증가/감소량은 빈 입력에서 사용자가 지정한다. 디로딩 비율과 이후 증가량은 자동 계산하지 않는다. 저장 후 계획과 일정을 다시 조회한다. POST 실패는 입력을 보존하며 POST 성공 후 재조회 실패는 저장 성공을 표시하고 초안을 닫아 중복 저장을 방지한다.
- 기존 테스트 assertion/skip은 보존했다. `period-ui.test.ts`의 모듈 로더만 실제 분리 컴포넌트를 읽도록 확장했다. `routines-ui.test.ts`에는 작성→중복 부위/운동 기준값/12주 수동 목표 입력→POST 본문 확인→GET 상세 확인, 다섯 분할 전환, 저장 실패 시 입력 보존, 저장 성공 후 조회 실패 시 중복 POST 방지를 추가했다. 새 오류 경로에서 드러난 어댑터의 undefined 자식 재귀 처리도 보완했다.

### 실제 검증과 결과

- 전용 `TEST_DATABASE_URL`만 사용했다. Node ESM here-string에서 pg Pool과 `fs.readFileSync(..., 'utf8')`로 `003_routines.sql`을 해당 DB에 적용: 성공. 연결 문자열은 출력하거나 기록하지 않았다.
- `node node_modules/tsx/dist/cli.mjs --test backend/test/routines.test.ts backend/test/routines.integration.test.ts backend/test/routines-ui.test.ts`: 초기 구현 후 56/56 pass, 0 fail, 0 skip. 실제 DB에서 다섯 분할 저장/목록/상세/새 서버·연결 재조회와 기존 일지/목표 미생성을 확인했다. 이후 UI 테스트 3건을 더 추가했다.
- `node node_modules/tsx/dist/cli.mjs --test backend/test/routines-ui.test.ts`: 최종 4/4 pass, 0 fail, 0 skip. 실제 브라우저 대신 기존 TypeScript/Node 렌더링 어댑터로 이벤트와 요청·렌더링 결과를 검사했다.
- `node node_modules/tsx/dist/cli.mjs --test backend/test/period-ui.test.ts`: 21/21 pass. 최초 전체 검사에서는 새 import를 처리하지 못해 이 21건이 실패했고, 로더 보완 중 CSS import를 먼저 처리하도록 수정한 뒤 전부 통과했다. 기간·통계·지연 응답 검증 조건은 그대로다.
- `npm run typecheck` 및 `npm run lint`: 통과.
- 최종 `npm run check`: format:check, lint, frontend/backend typecheck 통과. `npm test`는 **177 tests / 177 pass / 0 fail / 0 skip** (전용 DB 통합 포함), `npm run test:agents`는 **86 tests / 86 pass / 0 fail / 0 skip**. 마지막 frontend 기본 빌드에서 종료 코드 1. Vite 기본 esbuild 설정 로더가 허용된 worktree 밖 상위 디렉터리를 읽는 동안 `Access is denied` 오류가 발생했다. 기본 필수 검사 전체 통과로 보고하지 않는다.
- 마지막 전체 검사는 Node `spawnSync('npm.cmd', ['run', 'check'], { encoding: 'utf8', shell: true })`로 실행해 집계/오류만 출력했다. 임시 로그는 삭제했다.
- `npm run build -w backend`: 통과.
- `npm run build -w frontend -- --configLoader runner`: 통과. 기존 설정 파일을 runner 로더로 읽어 1580 modules와 프로덕션 번들을 생성했다. 샌드박스 권한·보안 설정·프로젝트 빌드 스크립트는 변경하지 않았다. 이 대체 명령 통과는 기본 `npm run check` 실패와 구분한다.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/27 diff --check`: 통과. 읽기 전용 Git 명령에서 사용자 전역 ignore 파일 접근 경고가 있었으나 저장소 diff 검사는 종료 코드 0이다.
- 포맷 중 SQL 파일을 Prettier 대상에 명시한 첫 명령은 SQL parser 미설치로 실패했다. TS/TSX/CSS/Markdown 대상만 포맷했으며 SQL은 실제 PostgreSQL 적용과 통합 테스트로 검증했다. 중간 PowerShell 인용 오류는 Node here-string으로 수정했다. 문서 추가 시 파이프의 한글 인코딩 손실은 UTF-8 패치로 복구했다.

### 남은 확인 및 전달

- 기본 `npm run check`의 frontend 빌드는 샌드박스 상위 디렉터리 읽기 제한으로 차단되어 코디네이터/CI에서 재검증해야 한다. 대체 runner 빌드와 backend 빌드는 통과했다.
- 실제 브라우저 도구 및 Playwright/Puppeteer 의존성이 이 환경에 없어 레이아웃·포커스·네이티브 required/min/step 검증과 실제 브라우저 재접속 증거는 미확인이다. 작성 폼의 자동 검증은 렌더링 어댑터 범위로 한정한다.
- 실행 Node v22.17.0으로 검증했다. 지정 Node 24.21.0/npm 11.19.0 환경의 기본 검사와 CI 결과는 코디네이터가 확인해야 한다.
- 최종 변경과 테스트는 미커밋 상태다. 독립 검토, 커밋·푸시·PR·CI는 코디네이터, 병합은 사용자 담당이다.

## 코디네이터: 보호 테스트 정식 재인계 — 2026-10-19

워커는 구현 역할이 backend/test/routines-ui.test.ts를 변경한 것을 감지해 중단했다. 기존 구현·추가 테스트·로그를 보존하고 accept-requirements로 테스트 역할부터 정식 재검토한다. 이전 tests 인계 및 tests.log와 현재 diff를 비교해 원래 assertion의 삭제/약화 없이 로더·어댑터 보완과 신규 시나리오가 타당한지 확인한다. 테스트 담당만 정식 인계 해시를 생성하며 코디네이터가 해시를 수동 교체하지 않는다. 새 테스트 오류는 테스트 역할이 고치고 실패/통과 결과를 기록한다. 구현 역할은 인계 후 보호 테스트를 다시 수정하지 않는다. 원래 확정 규칙과 이슈·브랜치를 재사용하고 실제 브라우저 검증을 남긴다.

## 테스트 정식 재인계 — 2026-10-19 (Asia/Seoul)

- tests 역할로 현재 구현과 추가 테스트를 검토했다. `AGENTS.md`, workout-implementation, workout-testing을 적용했으며 구현 파일과 Git 상태를 변경하는 작업은 하지 않았다.
- `routine-fixture.ts`, `routines.test.ts`, `routines.integration.test.ts`의 SHA-256은 전달된 최초 tests 결과와 각각 일치한다. UI 파일은 구현 단계에서 변경되었으므로 최초 해시와 일치하지 않는다. 현재 UI 파일에서 최초 조회 시나리오의 12주 표시·디로딩 구분·부위 중복·GET 전용·새 마운트 검증이 유지되는 것을 확인했다. 이전 tests.log 자체는 이번 단계에서 읽지 않았으며, 최초 파일의 바이트 단위 비교를 완료했다고 주장하지 않는다.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/27 diff -- backend/test/period-ui.test.ts`: 기존 assertion/시나리오 변경 없이 상대 모듈 로딩과 sandbox 공유만 추가된 것을 확인했다.
- 구현자가 추가한 작성→저장, 저장 실패 입력 보존, POST 성공 후 재조회 실패 시 중복 저장 방지 테스트를 검토했다. 저장 실패 검사는 어댑터가 네이티브 유효성 검사를 실행하지 않는 서버 오류 처리 검사이며 실제 브라우저에서 빈 폼 제출이 가능하다는 뜻은 아니다.
- UI 테스트를 보강했다. 저장 본문으로 새 화면 세션을 만들고 상세 GET을 다시 실행하여 사용자 이름·무분할·시작일·빈도·부위 순서/중복·5주차 수동 증가량·8주차 세트 감소·12주차 반복 감소를 확인한다. 다섯 분할 전환 검사는 maxLength 속성 개수 대신 사용자에게 보이는 분할 이름 입력 수를 확인한다. 새 계획의 모든 증가/감소량 및 디로딩 대상이 미입력 상태이며, 중복 부위 하나 삭제가 나머지 순서와 중복을 보존하는지도 추가했다.
- 전용 DB 제공 여부만 확인: `node -e "console.log('Dedicated test DB configured:',Boolean(process.env.TEST_DATABASE_URL))"` → true. 연결 정보 및 금지 파일을 읽거나 출력하지 않았다.
- `node node_modules/tsx/dist/cli.mjs --test backend/test/routines.test.ts backend/test/routines.integration.test.ts backend/test/routines-ui.test.ts backend/test/period-ui.test.ts`: 첫 보강 후 **80 tests / 80 pass / 0 fail / 0 skip**. Node spawnSync로 같은 인자를 전달하고 TAP 집계만 출력했다. 구현 전 실패는 위 최초 테스트 단계의 56건 기록을 유지하며, 이미 구현된 파일을 되돌려 재현하지 않았다.
- `npx --no-install prettier --write backend/test/routines-ui.test.ts`: 통과. 이후 새 수동 입력/개별 삭제 시나리오를 포함한 UI 테스트를 실행했다.
- 첫 `npm run check`: 기존 코디네이터 추가 기록의 Markdown 포맷으로 format:check 단계에서 실패했다. 내용 보존 후 이 문서를 Prettier로 포맷하여 재검사한다.
- 실제 브라우저 검증은 기존 환경에 도구가 없어 여전히 미실행이다. 이 단계의 UI 증거는 TypeScript/Node 어댑터 범위이며 DB 지속성은 별도 통합 테스트로 확인한다. 커밋·푸시·PR·독립 승인과 최종 인계 해시 수집은 코디네이터의 워커가 담당한다.
- 최종 `node node_modules/tsx/dist/cli.mjs --test backend/test/routines-ui.test.ts`: **5 tests / 5 pass / 0 fail / 0 skip**.
- `npx --no-install prettier --write docs/changes/27-agent-task.md` 후 최종 `npm run check`: format:check, lint, frontend/backend typecheck 통과. 앱 테스트 **178/178 pass, 0 fail, 0 skip** (전용 DB 포함), 워커 테스트 **86/86 pass, 0 fail, 0 skip**. frontend 기본 빌드는 Vite/esbuild의 worktree 밖 상위 경로 읽기에서 `Access is denied`로 실패했고 종료 코드 1이다. backend 빌드는 선행 frontend 실패로 이번 전체 명령에서 미실행이다. 샌드박스 우회나 구현 변경 없이 중단했으며 코디네이터/CI에서 기본 빌드를 재확인해야 한다.
- 최종 `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/27 diff --check`: 통과. UI 테스트 인계 SHA-256: `9671122e633da4edeb57ede10d9559a2ca1c6d7f42364d0f4d5daefa9ec0f0c3`. 다른 세 보호 테스트의 최초 해시는 유지된다.

## 코디네이터(Claude Code): 호스트 검증·독립 검토·마이그레이션 번호 — 2026-10-19

- Codex 토큰 소진으로 중단된 작업을 Claude Code가 이어받았다. 테스트·구현 코드는 변경하지 않았다.
- 호스트(Node 24.21.0 / npm 11.19.0, 전용 테스트 DB)에서 `npm run check`: **exit 0**. 앱·DB **178 pass / 0 fail / 0 skip**, 워커 **86 pass / 0 fail / 0 skip**, frontend/backend 빌드 통과.
- 독립 검토(읽기 전용): 차단 지적 없음. 정확히 12주, 4·8·12주 디로딩 양방향 강제, 분할·부위 enum, 중복·순서 보존, 파라미터 쿼리, 단일 행 원자 저장을 확인했다. 참고(P3): 디로딩 감소량이 기준 중량·세트 수보다 커도 허용, 수정·삭제 API 없음(확정 범위 밖).
- #34가 `003_workout_retries.sql`을 추가하므로 같은 번호 충돌을 피하려고 이 작업의 마이그레이션을 `004_routines.sql`로 변경하고 database/README.md 적용 명령을 갱신했다. CI·Docker 초기화는 파일명 순서로 모두 적용하며 두 마이그레이션은 서로 독립 테이블이다.
