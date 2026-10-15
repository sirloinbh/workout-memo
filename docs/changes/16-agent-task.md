# #16 feat: [MVP] 운동 일지와 세트 입력·조회·수정·삭제

- 이슈: https://github.com/sirloinbh/workout-memo/issues/16
- 브랜치: feat/16-agent-task

## 변경 및 검증

작업 에이전트가 실제 변경·검증 결과를 기록한다.

### 테스트 단계 (2026-10-15)

- 기준 SHA: `a0ce3245dddf8974f36054d01967ff21efbb5f29`. 기존 이슈·브랜치를 재사용하고 구현 파일은 변경하지 않았다. 커밋·푸시·PR 작업은 수행하지 않았다.
- `AGENTS.md`, `skills/workout-implementation/SKILL.md`, `skills/workout-testing/SKILL.md`를 읽고 테스트 역할 범위에 적용했다.
- `backend/test/workout-validation.test.ts`: 세트별 독립 메모 보존, 0 및 소수 총중량, 머신 미지정 허용을 검사한다. POST/PUT 각각 15개 잘못된 입력(필수값 누락, 빈 제목·운동명, 잘못된 날짜 형식·불가능한 날짜, 음수·문자 중량, 0·소수 반복 수, 잘못된 머신 ID)에 대해 400 응답과 저장소 미접근을 검사한다.
- `backend/test/workout-persistence.test.ts`: 전용 DB에서 날짜·머신·총중량·세트 순서·일지 및 세트 메모의 생성/조회/수정, 날짜 변경 후 이전 날짜에서 제외, 두 번째 세트 FK 오류 시 일지와 전체 세트 롤백, 실패한 생성의 일지 미잔존, API 및 Pool 재생성 후 조회, 삭제와 세트 cascade 및 없는 일지 수정/삭제 404를 검사한다. UUID로 격리한 fixture를 정리하며 운영 DB 설정은 사용하지 않는다.

실제 실행 결과:

- `node -e "console.log(Boolean(process.env.TEST_DATABASE_URL))"`와 동등한 존재 여부 검사: `false`. 값은 읽거나 출력하지 않았다.
- `npx prettier --write backend/test/workout-validation.test.ts backend/test/workout-persistence.test.ts`: 성공.
- `npm test`: **실패**, 총 38개 중 pass 35 / fail 1 / skip 2. 실패는 `workout validation retains independent notes for each set`: 현재 `workoutSchema`가 세트 `notes`를 제거하여 두 세트의 메모가 소실된다. 구현 전 예상 실패를 실제 재현했다. POST/PUT 입력 거부 30개 사례는 통과했다.
- `npm run typecheck -w backend`: 성공 (exit 0).
- `npx eslint backend/test/workout-validation.test.ts backend/test/workout-persistence.test.ts --max-warnings 0`: 성공.
- `npx prettier --check backend/test/workout-validation.test.ts backend/test/workout-persistence.test.ts`: 성공.

차단 및 구현 단계 인계:

- **DB 검증 차단**: 전용 `TEST_DATABASE_URL`이 제공되지 않아 기존 및 신규 DB 통합 테스트 2개가 skip되었다. DB CRUD·롤백·재연결 지속성을 검증 완료로 계산하지 않는다. 스키마를 준비한 전용 DB를 제공한 뒤 `npm test`를 재실행해야 한다.
- 확인한 구현 차이: 서버 스키마·세트 INSERT·DB 세트 테이블·프런트 세트 타입/입력에 세트 메모가 없다. 구현 단계에서 저장과 조회 및 UI 입력/표시를 함께 보완해야 한다.
- 프런트 날짜 기본값은 브라우저 로컬 시간대의 `getFullYear/getMonth/getDate`를 사용한다. `Asia/Seoul` 날짜 경계 검증은 아직 수행하지 않았다. 좌우/편측 장비 총중량 안내 및 실제 UI 생성 → 조회 → 수정 → 삭제·새로고침 검증도 구현 단계에서 필요하다.
- 신규 테스트는 서비스 API와 DB 연결 재생성을 검사하며 실제 PostgreSQL 프로세스 재시작이나 브라우저 새로고침을 대신하지 않는다. 브라우저 테스트 도구는 추가하지 않았다.
- `npm run check` 전체 검사는 구현 전 예상 실패를 남기는 테스트 단계에서 실행하지 않았다. 구현 후 최종 전체 검사와 전용 DB 통합 검사 및 UI 검증이 필요하다.

### 테스트 단계 재개: 전용 DB 제공 후 (2026-10-15)

- 이전 실행이 남긴 위 테스트 파일과 기록을 보존하고 이어서 검증했다. 이번 실행에서는 `TEST_DATABASE_URL` 존재 여부가 `true`이며 전용 DB에 연결하여 기존·신규 통합 테스트를 실제 실행했다. 연결 값, 인증 정보, `.env`는 출력하거나 문서에 기록하지 않았다. 위의 DB 미제공 차단은 이번 실행에서 해소되었다.
- `backend/test/workout-persistence.test.ts`에 세트를 3개에서 2개로 줄이는 수정과 남은 DB 세트 수 검사를 추가했다. 수정 시 운동명·머신·중량·반복 수·메모를 바꾸고 순서를 변경하는 동작을 검사한다.
- `backend/test/workout-validation.test.ts`에 제목 누락 및 음수 반복 수 거부를 추가했다. POST/PUT 각각 17개, 총 34개 입력 오류 사례를 검사한다.

실제 명령 및 결과:

- `npm test` (보강 전): exit 1, 총 43개 / pass 38 / fail 5 / skip 0. 전용 DB 통합 테스트가 실행되었으며 세트 메모 소실을 생성·수정·재연결 조회에서 재현했다.
- `npx prettier --write backend/test/workout-validation.test.ts backend/test/workout-persistence.test.ts`: exit 0, 두 파일 모두 포맷 변경 없음.
- `npm test` (보강 후 최종): exit 1, 총 47개 / pass 42 / fail 5 / skip 0. 실패 5개는 세트 메모 스키마 검사 1개, DB 생성·수정·재연결 조회 하위 검사 3개, 그 하위 실패를 집계한 부모 검사 1개다. 모두 `notes`가 누락되는 동일한 구현 차이에서 발생한다. 예상 실패를 skip하거나 assertion을 약화하지 않았다.
- 기존 DB CRUD 통합 검사, 새 DB 롤백·삭제 하위 검사, 입력 오류 34개 사례는 통과했다. 수정 후 DB 세트 수가 2개인 검사도 메모 assertion 전에 통과했다. 재연결 후 전체 조회 결과 동일성은 통과했으나 원하는 세트 메모를 포함한 조회는 실패했다.
- `npm run typecheck -w backend`: exit 0.
- `npx eslint backend/test/workout-validation.test.ts backend/test/workout-persistence.test.ts --max-warnings 0`: exit 0.
- `npx prettier --check backend/test/workout-validation.test.ts backend/test/workout-persistence.test.ts docs/changes/16-agent-task.md`: exit 0.

구현 단계 인계:

- 테스트 단계의 외부 차단은 없다. 구현 파일은 변경하지 않았고 모든 파일은 미커밋 상태로 남겼다.
- 서버·DB·UI 세트 메모 보완 후 `npm test`와 `npm run check`를 실행해야 한다. 기존 DB에 적용되는 세트 메모 마이그레이션도 필요하다.
- `Asia/Seoul` 날짜 경계, 좌우/편측 장비 총중량 안내, 브라우저 CRUD·새로고침 및 실제 PostgreSQL 재시작 검증은 여전히 남아 있다. 현재 설치된 테스트 도구에는 브라우저/컴포넌트 러너가 없어 이번 단계에서는 추가하지 않았다. API 및 DB Pool 재생성 검사를 실제 DB 프로세스 재시작으로 보고하지 않는다.
- 전체 `npm run check`는 세트 메모 관련 예상 실패가 남아 있는 테스트 단계에서 실행하지 않았다. 최종 구현 단계에서 필수 전체 검사를 수행한다.

### 구현 단계 (2026-10-15)

- 준비된 이슈·브랜치·worktree를 유지했다. 커밋·푸시·PR·병합·추가 에이전트 실행은 하지 않았다. 별도의 이전 검토 결과는 전달되지 않았다.
- 서버 세트 스키마에 선택적 `notes`(최대 4000자, 기본 빈 문자열)를 추가하고 기존 트랜잭션 안의 세트 INSERT에 포함했다. 기존 메모 없는 클라이언트 요청도 허용한다. 기존 생성·수정·삭제 및 롤백 구조를 재사용했다.
- `database/migrations/002_set_notes.sql`: 기존 세트를 보존하면서 메모 컬럼을 추가한다. 기존 데이터용 적용 명령을 `database/README.md`에 기록하고 CI가 모든 SQL을 순서대로 적용하도록 변경했다. 초기 Docker 볼륨은 기존 마이그레이션 디렉터리 마운트를 통해 두 SQL을 실행한다.
- UI에 세트별 메모 입력·수정과 펼쳐 보는 세트 기록(운동명·총중량·반복·머신·메모)을 추가했다. 중량 표시는 소수 둘째 자리까지 보존한다. 좌우 동시 운동은 양쪽 합계, 편측 운동은 해당 쪽에서 움직인 총중량이라는 안내와 미확인 기본중량의 메모 안내를 추가했다.
- 기본 날짜를 브라우저 시간대와 무관한 `Asia/Seoul` 기준으로 계산한다. 선택한 날짜의 기간 이동은 기존 달력 계산을 유지했다.
- 테스트 단계에서 전달받은 두 테스트 파일은 수정하지 않았다. SHA-256이 인계 값과 각각 일치함을 확인했다. assertion 삭제·약화 및 skip 추가는 없었다.
- `backend/test/service-date.test.ts`: 실제 UI가 사용하는 날짜 함수를 서울 자정 직전·직후, 연도 경계, 윤일 경계에서 검증한다.
- `backend/test/set-notes.test.ts`: 메모 생략 기본값·타입·길이 한계와 마이그레이션의 기존 행 보존 및 재적용 시 메모 보존을 검증한다. DB 검사는 전용 DB 세션의 임시 테이블과 트랜잭션을 사용한다.

실제 명령 및 결과:

- `node -e "console.log('Dedicated test DB provided: '+Boolean(process.env.TEST_DATABASE_URL))"`: `true`. 연결 값은 출력하지 않았다.
- `node --input-type=module -e "import {Pool} from 'pg'; import fs from 'node:fs'; if(!process.env.TEST_DATABASE_URL) { console.error('Dedicated TEST_DATABASE_URL missing'); process.exit(1); } const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL}); try { await pool.query(fs.readFileSync('database/migrations/002_set_notes.sql','utf8')); console.log('002_set_notes applied to dedicated test DB'); } catch {console.error('Dedicated test DB migration failed');process.exitCode=1;} finally {await pool.end();}"`: exit 0. 제공된 전용 테스트 DB에만 새 마이그레이션을 적용했다.
- `npx prettier --write backend/src/domain.ts backend/src/app.ts frontend/src/main.tsx frontend/src/date.ts frontend/src/style.css backend/test/service-date.test.ts database/README.md .github/workflows/ci.yml`: exit 0.
- `npm run check`: **exit 1**. 포맷·lint·frontend/backend 타입 검사 통과, 앱 테스트 **48 pass / 0 fail / 0 skip**, 에이전트 테스트 **34 pass / 0 fail / 0 skip**. 이후 프런트 빌드의 Vite 설정 로딩 중 esbuild가 `Cannot read directory "../../../../../../../..": Access is denied` 및 `Could not resolve .../frontend/vite.config.ts`로 실패했다. 전체 검사 성공으로 보고하지 않는다.
- `npx prettier --write backend/test/set-notes.test.ts`: exit 0.
- `npm test` (마이그레이션 회귀 테스트 추가 후): **exit 0, 50 pass / 0 fail / 0 skip**. 전용 DB CRUD·일지/세트 메모·수정 롤백·삭제 cascade·API/Pool 재생성 후 조회 및 신규 마이그레이션 테스트가 모두 실제 실행되었다. 인계받은 메모 관련 실패 5개는 해소되었다.
- `npm run build -w backend`: exit 0.
- `npm run lint`, `npm run typecheck`: 각각 exit 0.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/16 diff --check`: exit 0.
- 최종 중량 표시·문서 반영 후 `npx prettier --write frontend/src/main.tsx docs/changes/16-agent-task.md`, `npm run format:check`, `npm run lint`, `npm run typecheck`: 모두 exit 0. 마지막 `diff --check`도 exit 0. 구현과 테스트는 미커밋 상태다.

차단 및 남은 검증:

- **전체 검사 차단**: 프런트 빌드 중 esbuild의 상위 디렉터리 접근이 현재 파일시스템 샌드박스에서 거부된다. 권한 변경이나 제한 우회는 시도하지 않았다. 코디네이터의 허용된 검증 환경에서 `npm run check`를 재실행해야 한다.
- 실제 브라우저 CRUD·새로고침 및 화면 증거, PostgreSQL 프로세스 재시작 후 지속성은 검증하지 않았다. 브라우저 자동화 도구는 제공되지 않았으며 Playwright 의존성도 설치되어 있지 않다. 실제 DB 서비스 제어는 하지 않았다. API/Pool 재생성 테스트 통과를 브라우저·DB 프로세스 재시작 검증으로 대체해 보고하지 않는다.
- 기존 운영 볼륨에는 새 API 실행 전에 `002_set_notes.sql` 적용이 필요하다. 이 작업에서는 운영 DB·환경 파일·인증 정보에 접근하지 않았다.

### 구현 단계 재개: 최종 전체 검사 (2026-10-15)

- 남아 있던 구현·테스트·문서를 보존하여 검토했다. 별도의 이전 리뷰 지적은 전달되지 않았다. 추가 구현 변경은 필요하지 않았으며 이번 실행은 최종 검증과 이 기록 갱신만 수행했다.
- `AGENTS.md`, `skills/workout-implementation/SKILL.md`, `skills/workout-testing/SKILL.md`를 UTF-8로 읽고 적용했다. 준비된 이슈·브랜치를 재사용했으며 커밋·푸시·PR·병합·추가 에이전트 실행은 하지 않았다.
- Node `fs.readFileSync`와 `crypto.createHash('sha256')`로 전달된 두 테스트 파일을 확인했다. `workout-persistence.test.ts`는 `496033317a704f3cafb32d668a8a29deac1e352e682b86b7ae1bf819536ebca0`, `workout-validation.test.ts`는 `655115edce0e2d60852ec80ce89e52d978fd8641bf1f929e6acb777b49d16be8`로 인계 값과 일치한다. assertion과 skip 조건은 변경하지 않았다.
- `node -e "console.log('Dedicated test DB provided: '+Boolean(process.env.TEST_DATABASE_URL))"`와 동등한 존재 여부 검사: `true`. 연결 값과 인증 정보는 출력하지 않았다. 이번에는 이미 준비된 전용 DB를 사용했으며 마이그레이션을 다시 적용하지 않았다.
- `npm run check`: **exit 0**. 포맷·lint·프런트/백엔드 타입 검사, 전용 DB를 포함한 앱 테스트 **50 pass / 0 fail / 0 skip**, 에이전트 테스트 **34 pass / 0 fail / 0 skip**, 프런트/백엔드 프로덕션 빌드 모두 성공했다. 앞서 기록한 esbuild 상위 디렉터리 접근 오류는 이번 실행에서 재현되지 않았으며 전체 검사 차단은 해소되었다. 권한이나 빌드 설정은 변경하지 않았다.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/16 diff --check`: exit 0.
- 실제 브라우저 CRUD·새로고침·화면 증거와 PostgreSQL 프로세스 재시작 검증은 여전히 수행하지 않았다. 제공된 브라우저 도구가 없으며 API/Pool 재생성 통과를 실제 브라우저나 DB 프로세스 재시작 검증으로 보고하지 않는다. 코디네이터의 최종 검증에서 확인해야 한다. 변경은 모두 미커밋 상태로 유지했다.
- 기록 갱신 후 `npx prettier --check docs/changes/16-agent-task.md`와 위 `git diff --check`: 각각 exit 0.

### 코디네이터 검증 및 P0 재개 (2026-10-15)

- 사용자의 중요도 부여·구현 착수 요청에 따라 열린 이슈 14개에 priority:P0~P3 라벨을 적용했다. #16/#17/#19와 MVP 상위 #20은 P0이며 실제 구현 순서는 #16 → #17 → #19다. #20은 집계 카드로 별도 구현하지 않는다.
- #16 worktree와 보호 테스트는 유지하고 전용 테스트 DB만 사용해 호스트 `npm run check`를 실행했다. 앱 50 pass / 0 fail / 0 skip, 에이전트 34 pass / 0 fail / 0 skip, 포맷·lint·타입·프런트/백엔드 빌드가 모두 통과했다. 전체 로그는 ignored `.local/agent-workflow/jobs/16/coordinator-check.log`에 있다.
- 사용자 Chrome 프로필과 분리한 headless Chrome 및 loopback 검증용 앱으로 실제 React 화면을 확인했다. 기존 검토 차단 원인이었던 브라우저 제어는 호스트 실행 환경에서 동작했다. 새 종속성 설치나 사용자 브라우저 변경은 하지 않았다.
- ignored `.local/agent-workflow/browser-check-16.mjs create`: 화면에서 일지 생성(종목·42.5kg·8회·세트/일지 메모), 새로고침 후 조회, 45kg·9회와 세트 메모 수정 후 API 저장값 확인이 통과했다. 실제 앱은 이번 전체 검사에서 생성한 프로덕션 빌드를 사용했다.
- 검증용 API 프로세스와 전용 PostgreSQL 컨테이너 `workout-memo-agent-test-db`를 실제 재시작했다. DB 준비 직후 첫 readiness 확인은 실패했으며 accepting connections 확인 후 API를 재실행했다. 데이터 볼륨은 보존했고 운영 DB는 접근하지 않았다.
- ignored `.local/agent-workflow/browser-check-16.mjs persist-delete`: 재시작 후 실제 화면에서 수정된 값과 세트 메모 보존 확인, 화면 삭제와 API의 삭제 확인이 통과했다. 이 검사기가 만든 테스트 일지만 정리했다. 초기 서버 준비 전 화면 확인 실패는 서버 준비 후 재실행으로 해소되었다.
- 이번 브라우저 검증은 데스크톱 Chromium에 한정한다. 모바일·다른 브라우저와 화면 캡처 증거는 추가하지 않았다. API/Pool 재생성을 실제 서비스 재시작으로 대체한 결과가 아니다.
- 중요도 라벨 적용으로 바뀐 이슈 updatedAt은 제목·본문·번호·URL·상태가 기존 스냅샷과 동일함을 확인한 뒤 메타데이터만 감사 기록과 함께 갱신했다. 테스트 해시·검토 결과·단계를 수동으로 승인하거나 삭제하지 않았다. 표준 retry 절차로 구현·독립 검토·호스트 검사·PR 단계를 재개한다.

### 구현 단계 재개: 이전 리뷰 검증 보류 대응 (2026-10-15)

- 이전 리뷰는 코드 결함 없이 브라우저 CRUD·새로고침 및 실제 서비스 재시작 검증 미완료로 승인을 보류했다. 위 코디네이터 검증 기록에 실제 Chromium 생성·조회·수정·삭제, 새로고침, API와 전용 PostgreSQL 컨테이너 재시작 후 데이터 보존 결과가 추가되어 있음을 확인했다. 이번 구현 에이전트가 브라우저나 서비스를 다시 제어한 결과로 보고하지 않는다. 독립 리뷰에서 이 추가 증거를 판단해야 한다.
- 서버·UI·마이그레이션과 관련 테스트를 재검토했다. 추가 구현 수정이 필요한 결함은 발견하지 않아 기존 변경을 보존하고 검증 기록만 갱신했다. `AGENTS.md`와 구현·테스트 스킬을 적용했으며 이슈·브랜치·커밋·푸시·PR·승인·병합·추가 에이전트 작업은 하지 않았다.
- `node -e`로 전용 `TEST_DATABASE_URL`의 존재 여부만 확인: `true`. 연결 값·인증 정보·환경 파일은 출력하거나 접근하지 않았다.
- Node `fs`와 `crypto`를 사용한 SHA-256 검사: 보호된 `backend/test/workout-persistence.test.ts`와 `backend/test/workout-validation.test.ts`가 인계 해시와 각각 일치했다. assertion·skip 조건은 변경하지 않았다.
- `npm run check`: **exit 0**. 포맷·lint·프런트/백엔드 타입 검사, 전용 DB 포함 앱 테스트 **50 pass / 0 fail / 0 skip**, 에이전트 테스트 **34 pass / 0 fail / 0 skip**, 프런트/백엔드 빌드 모두 통과했다.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/16 diff --check`: exit 0. 모든 변경은 미커밋 상태로 유지했다. 최종 승인 판단은 독립 검토 역할에 남긴다.
