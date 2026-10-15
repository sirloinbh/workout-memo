# #24 feat: 역할별 OpenAI 모델 지정과 Astra 디버깅 워커 추가

- 이슈: https://github.com/sirloinbh/workout-memo/issues/24
- 브랜치: feat/24-agent-task

## 변경 및 검증

### 테스트 단계 (2026-10-15)

- `workout-implementation`, `workout-testing` 및 AGENTS.md를 읽었다. 이미 준비된 이슈·브랜치·worktree를 사용했으며 구현, 커밋, 원격 변경은 수행하지 않았다.
- 시작 시 존재하던 `scripts/test/agent-runtime.test.mjs`의 #24 테스트 초안을 보존하고 검토했다. enqueue 입력 검증, 기존 작업의 안전한 설정 변경, 모델 접근 실패 및 진단 실패 후 잠금 해제 테스트를 보강했다.
- 기존 `test:agents` 대상 파일 안에 추가했으므로 package.json/CI 연결 변경은 필요하지 않다. 기존 34개 테스트와 #24 계약 테스트 35개가 함께 실행된다.
- 임시 디렉터리에 CLI와 가짜 Codex/npm 실행기를 복제한다. Git/GitHub 명령은 fixture에서 대체하며 실제 큐, worktree, 원격 저장소, 모델에는 접근하지 않는다. 가짜 자식 프로세스의 DB 상속 검증에는 실제 연결 문자열 대신 합성 표식만 사용한다.

검증하는 동작:

- 8개 역할의 명시적인 모델 및 reasoning effort 인자, 읽기 전용 smoke, Sol 기본 작업과 명시적인 Luna 문서 구현/Astra 고위험 검토 라우팅.
- 문서 제목·본문만으로 Luna를 선택하지 않는 하위 호환성, 알 수 없는 역할·모델·작업 종류 거부, 모델 접근 실패 시 호출 1회 및 fallback 금지.
- 성공 결과와 status에 역할·모델·effort·실제 이벤트 thread ID 노출, Codex/npm 자식 프로세스의 전용 DB 환경 상속 및 연결 값 미출력.
- Astra 진단의 read-only sandbox, never 승인 정책, 오류 증거와 snapshot 안내, 기존 job/소스/테스트/worker 잠금/스키마 보존, 별도 잠금·결과 파일, 동시 호출 배제, 실패 후 잠금 해제, 소스 변경에 따른 stale 표시.
- PowerShell → Node enqueue 작업 종류 및 diagnose 이슈 번호 전달, Node enqueue 작업/검토 선택 저장과 잘못되거나 누락된 옵션 거부.
- 기존 #21의 문서 모드 변경은 작업 상태·결과·파일을 보존하는 명시 명령으로 처리하고 활성 worker 잠금 아래에서는 거부한다.

구현에 전달하는 CLI 계약(아직 구현되지 않은 테스트 기대값):

- `node scripts/agents/cli.mjs smoke --role <role>`
- `node scripts/agents/cli.mjs enqueue <issue> --task-kind documentation --review-role highRiskReview`
- `node scripts/agents/cli.mjs configure 21 --task-kind documentation` — 작업 종류 재설정용 제안 명령. worker 잠금이 해제된 상태에서만 job을 갱신한다. 실행 중 JSON 수동 편집은 하지 않는다.
- `scripts/agents.ps1 enqueue -Issue <issue> -TaskKind documentation`
- `scripts/agents.ps1 diagnose -Issue <issue>`
- 작업 JSON의 명시 선택 필드는 `taskKind`, `reviewRole`이며 결과의 선택 정보 필드는 `role`, `model`, `reasoningEffort`, `threadId`로 검증한다.

실제 실행 및 결과:

| 명령                                                                    | 결과                                                                                                                              |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:agents` (초안 확인)                                       | exit 1; 62개 중 pass 35 / fail 27 / skip 0                                                                                        |
| `npx --no-install prettier --write scripts/test/agent-runtime.test.mjs` | exit 0                                                                                                                            |
| `npm run test:agents` (보강 후, 출력 요약 필터 사용)                    | exit 1; 69개 중 pass 35 / fail 34 / skip 0                                                                                        |
| `npm run check` (출력 요약 필터 사용)                                   | exit 1; format/lint/typecheck 통과, backend pass 4 / fail 0 / skip 0, agent pass 35 / fail 34 / skip 0; agent 실패로 build 미실행 |

34개 실패는 현재 모델/effort 인자 누락, 선택 정보 저장/status 누락, 알 수 없는 옵션 무시, diagnose/configure 미지원, PowerShell 전달 미지원에 따른 예상 pre-implementation 실패다. 기존 34개 테스트와 합성 npm 환경 상속 테스트 1개는 통과했다. 전달된 전용 TEST_DATABASE_URL로 실행된 백엔드 테스트에는 DB 통합 테스트 1개가 포함되어 있으며 건너뛰지 않았다. 연결 값은 열람하거나 기록하지 않았다.

검증 보조 명령에서 `require.resolve('npm/bin/npm-cli.js')`는 로컬 모듈을 찾지 못해 실패하여 사용하지 않았다. 이후 실제 `npm run ...` 명령으로 검사를 수행했다. Windows에서 `rg backend/test/*.test.ts` 글롭은 지원되지 않아 `rg ... backend/test`로 다시 확인했다.

마지막 `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/24 diff --check`와 `npx --no-install prettier --check scripts/test/agent-runtime.test.mjs docs/changes/24-agent-task.md`는 모두 exit 0이었다. Git status에는 테스트 파일과 이 기록만 변경으로 나타났다. Git status가 사용자 전역 ignore 파일의 읽기 권한 경고를 출력했지만 검사는 완료되었으며 전역 설정은 변경하지 않았다.

남은 검증은 구현 후 전체 검사 재실행, 운영 문서/AGENTS 역할 표와 명령 검토, 주 대화의 세 실제 모델 read-only smoke다. 가짜 실행기 결과는 실제 모델 접근 성공의 증거가 아니다. 프로젝트 외부 root나 설치/활성화 경로를 추가한다면 저장소·원격·계정 거부 및 큐/home 보존 테스트가 추가로 필요하다. 해당 선택적 경로는 이 단계에서 도입하거나 검증하지 않았다.

### 구현 단계 (2026-10-15)

- `AGENTS.md`, `workout-implementation`, `workout-testing`을 적용했다. 기존 이슈·브랜치·worktree만 사용했고 하위 에이전트, 커밋, 원격 변경, PR 작업은 수행하지 않았다. 이전 검토 역할의 지적사항은 입력에 없었다.
- `scripts/agents/models.mjs`에 8개 승인 역할의 모델/effort와 입력 검증을 분리했다. 모든 Codex 실행은 배열 인자로 모델/effort를 명시한다. 기본은 Sol, 명시적인 문서 구현은 Luna, 고위험 검토는 Astra이며 자동 fallback이나 escalation은 없다.
- `enqueue`의 작업/검토 옵션과 PowerShell 전달, 워커 잠금 아래에서 queued/blocked 작업만 변경하는 `configure`를 구현했다. 기존 #21을 안전하게 문서 모드로 변경하는 절차를 운영 문서에 기록했다. 실행 중 job을 수정하지 않는다.
- 단계 결과와 status에 선택 역할/모델/effort/thread ID를 남긴다. 모델 실행 실패에도 선택 정보가 유지되며 세션 시작 전에 실패한 경우 thread ID는 null이다. status에는 최근 진단 메타데이터도 표시한다.
- `diagnose`는 Astra high/read-only/never로 실행한다. ignored 진단 전용 경로에 별도 잠금, 실행별 스키마/결과/로그/메타데이터를 저장하고 job·테스트·소스·기존 워커 잠금·스키마를 변경하지 않는다. 분석 전후 파일 목록/내용과 job 해시가 달라지면 stale로 표시한다. 실패도 메타데이터에 기록하고 잠금을 해제하며 재호출하지 않는다.
- `TEST_DATABASE_URL`의 자식 프로세스 상속을 유지했다. 프로세스 출력/로그/오류에 연결 값이 포함되면 가리며, 파이프 청크 경계에 걸친 값도 처리한다. fingerprint에서는 민감 경로를 제외한다. 실제 연결 값이나 인증 파일은 열람·출력하지 않았다.
- 추가 회귀 테스트 `scripts/test/agent-models.test.mjs`는 상속된 객체 이름/잘못된 라우팅 거부, 기본/문서 라우팅, 청크 경계의 합성 DB 표식 비노출을 검증한다. package.json과 Windows/Linux 워커 CI의 실제 실행 목록에 연결했다.
- `AGENTS.md`와 운영 문서에 역할 표, 명령, 사용량 주의, 사용자 명시 요청 전 모델 변경 금지 및 현재 채팅/전역 설정 유지 원칙을 기록했다. 공식 CLI 문서를 검색·열람했다: [Codex developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli). 모델 이름은 사용자 지정값을 그대로 사용했으며 계정 접근 성공을 주장하지 않는다.
- 외부 root 옵션, 별도 설치본, 전역 설정 변경 및 실제 워커 활성화는 도입/수행하지 않았다. 현재 worktree 구현의 검증 후 활성화는 코디네이터 담당이다.

실제 명령 및 결과:

| 명령                                                                                                                   | 결과                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:agents` (기존 계약 구현 후)                                                                              | exit 0; pass 69 / fail 0 / skip 0                                                                                                                         |
| `npx --no-install prettier --write scripts/agents/cli.mjs scripts/agents/models.mjs scripts/agents/process.mjs`        | exit 0                                                                                                                                                    |
| `npx --no-install prettier --write scripts/test/agent-models.test.mjs AGENTS.md docs/local-agent-workflow.md`          | exit 0                                                                                                                                                    |
| `npm run check`                                                                                                        | exit 1; format/lint/typecheck 통과, backend pass 4 / fail 0 / skip 0, agent pass 71 / fail 0 / skip 0; frontend build의 Vite 설정 로딩에서 아래 권한 실패 |
| `npx --no-install prettier --write scripts/agents/cli.mjs` (status/인자 검증 보강 후)                                  | exit 0                                                                                                                                                    |
| `npm run test:agents` (최종 실행 코드)                                                                                 | exit 0; pass 71 / fail 0 / skip 0                                                                                                                         |
| `npm run lint` (최종 실행 코드)                                                                                        | exit 0                                                                                                                                                    |
| `npm run build -w backend`                                                                                             | exit 0                                                                                                                                                    |
| `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/24 diff --check` | exit 0                                                                                                                                                    |
| Node fs로 AGENTS/운영 문서의 상대 링크 대상 확인                                                                       | 모두 존재                                                                                                                                                 |

준비된 `scripts/test/agent-runtime.test.mjs`는 구현 단계에서 수정하지 않았으며 SHA256이 전달값 `eed238241a1d5a1e3829a5a02968a519a4f3422daba6e3022dd2795e1cd2e5e7`과 일치한다. 기존 assertion/skip을 바꾸지 않았다. 전용 TEST_DATABASE_URL이 전달된 백엔드 검사에는 PostgreSQL 통합 테스트가 포함되었고 4개 모두 통과했다.

차단 사항: `npm run check`의 frontend build에서 esbuild가 `../../../../../../../..` 디렉터리를 읽으려다 `Access is denied`로 실패했다. 이어 `frontend/vite.config.ts`를 resolve하지 못했다고 보고했다. 현재 샌드박스에서 상위 디렉터리 접근이 제한되어 있으며 우회하거나 권한 확장/전역 설정 변경을 하지 않았다. 앱 코드/빌드 설정 변경으로 이 이슈 범위를 넓히지 않았다. 코디네이터가 허용된 실행 환경에서 전체 check/build를 다시 확인해야 한다.

남은 인계: 권한 제한 없는 허용 환경의 전체 frontend build/check, 독립 검토, 주 대화의 세 실제 모델 read-only smoke, 필요 시 검증된 워커 활성화. 가짜 실행기의 71개 성공을 실제 모델 연결 검증으로 해석하지 않는다. 모든 변경은 미커밋 상태로 둔다.

작업 기록 작성 후 `npx --no-install prettier --write docs/changes/24-agent-task.md`, `npm run format:check`, `git ... diff --check`를 실행했고 모두 exit 0이었다. 최종 Git status는 사용자 전역 ignore 파일 읽기 권한 경고를 출력했지만 정상 종료했다. 준비된 테스트 외에는 이 구현 범위의 파일만 변경되어 있으며 전역 Git 설정은 수정하지 않았다.

### 독립 검토 지적 수정 (2026-10-15)

- 이전 리뷰의 P1 두 건과 P2 한 건을 수정했다. 준비된 이슈/브랜치/worktree를 유지했고 커밋·푸시·PR·추가 에이전트 실행은 하지 않았다.
- 공통 security 모듈의 재귀 가림 처리를 JSON 읽기/저장에 적용했다. 중첩 결과와 기존 job의 오류/status도 전용 DB 값을 노출하지 않는다. Codex last-message 파일은 성공/실패 경계에서 가리고, 성공 결과는 정제된 JSON으로 다시 저장한다. 진단은 원본 job을 수정하지 않는다. 실제 비밀값 대신 합성 표식만 회귀 테스트에 사용했다.
- stdout의 thread.started 이벤트를 청크 단위로 파싱하고 즉시 단계 결과 또는 진단 메타데이터에 저장한다. 실패 및 timeout 오류에도 threadId를 보존하며, 후속 출력이 길어져도 이미 수신한 ID를 유지한다.
- 진단 fingerprint의 민감 경로 제외와 게시용 검증을 분리했다. 게시 fingerprint 및 changedPaths가 같은 거부 규칙을 사용하여 connection.json, container.env, credentials, .codex와 기존 환경/백업/state 경로를 내용 읽기/스테이징 전에 거부한다. 검증 후 추가된 민감 경로가 fingerprint에서 조용히 제외되는 경로를 없앴다.
- 별도 scripts/test/agent-review-regressions.test.mjs에 회귀 테스트 13개를 추가하고 package.json 및 Windows/Linux CI에 연결했다. 성공/실패 시 구조화된 파일과 status의 가림 처리, 기존 job 보존, 실패/timeout 스레드 ID, 민감 경로의 게시 전 거부를 검증한다. 보호 테스트 scripts/test/agent-runtime.test.mjs는 수정하지 않았으며 SHA256 eed238241a1d5a1e3829a5a02968a519a4f3422daba6e3022dd2795e1cd2e5e7을 유지했다.

실제 실행 및 결과:

- node --test scripts/test/agent-review-regressions.test.mjs: exit 0, pass 13 / fail 0 / skip 0.
- node node_modules/prettier/bin/prettier.cjs --write scripts/agents/security.mjs scripts/agents/store.mjs scripts/agents/process.mjs scripts/agents/cli.mjs scripts/test/agent-review-regressions.test.mjs package.json .github/workflows/local-agent-workflow.yml: exit 0.
- npm run test:agents: exit 0, pass 84 / fail 0 / skip 0.
- npm run check: exit 0, format/lint/typecheck 통과, backend pass 4 / fail 0 / skip 0 (전달된 전용 DB의 PostgreSQL 통합 테스트 포함), agents pass 84 / fail 0 / skip 0, frontend/backend build 통과. 이전 구현 단계의 frontend 빌드 권한 실패는 이번 실행에서 재현되지 않았다.

남은 인계: 코디네이터의 최종 호스트 검증 및 독립 재검토, 주 대화가 담당하는 세 실제 모델의 read-only smoke와 필요 시 워커 활성화. 합성 실행기 통과를 실제 모델 접근 성공으로 보고하지 않는다. 모든 변경은 미커밋 상태다.

기록 작성 후 위 변경 파일과 작업 문서의 Prettier --check 및 git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/24 diff --check도 exit 0이었다. Node crypto로 보호 테스트 SHA256이 위 전달값과 동일함을 다시 확인했다.

### 기존 환경 템플릿 fingerprint 회귀 수정 (2026-10-15)

- 독립 재검토의 P1을 수정했다. 전체 추적 파일 목록에 게시 거부 규칙을 적용하여 기존 `.env.example`까지 verification을 막던 문제다.
- 게시 fingerprint는 먼저 `changedPaths`로 변경된 민감 경로를 거부하고, 전체 목록에서는 기존 민감 경로를 내용 읽기 없이 제외한다. verification 전후와 delivery 직전 모두 이 검사를 실행하므로 검증 후 추가되거나 변경된 민감 경로도 차단한다. 진단의 읽기 전용 제외 규칙은 유지한다.
- 기존 회귀 테스트의 assertion을 유지하면서 fake Git의 전체 목록/변경 목록 응답을 실제 명령별로 구분했다. 실제 저장소의 `git ls-files -z` 파일명 목록을 합성 worktree에 반영하는 회귀 테스트와 변경된 추적 환경 템플릿 거부 테스트를 추가했다. 민감 파일은 합성 worktree에도 만들지 않아 내용 읽기가 발생하면 실패한다. 실제 민감 파일의 내용은 열람하지 않았다.
- 수정 전 `node --test --test-name-pattern='repository tracked inventory' scripts/test/agent-review-regressions.test.mjs`: exit 1, pass 0 / fail 1 / skip 0. `Sensitive path cannot be published: .env.example`을 재현했다.
- 수정 후 `node --test scripts/test/agent-review-regressions.test.mjs`: exit 0, pass 15 / fail 0 / skip 0.
- `node node_modules/prettier/bin/prettier.cjs --write scripts/agents/cli.mjs scripts/test/agent-review-regressions.test.mjs`: exit 0.
- `npm run check`: exit 0. format/lint/typecheck 통과, backend pass 4 / fail 0 / skip 0 (전달된 전용 DB 통합 테스트 포함), agents pass 86 / fail 0 / skip 0, frontend/backend build 통과.
- Node crypto로 보호 테스트 SHA256 `eed238241a1d5a1e3829a5a02968a519a4f3422daba6e3022dd2795e1cd2e5e7`을 확인했다. 기존 테스트 파일은 변경하지 않았다.

기존 이슈/브랜치/worktree에서만 작업했으며 변경은 미커밋 상태다. 코디네이터의 독립 재검토가 남아 있다. 실제 모델 smoke 및 워커 활성화는 수행하지 않았다.

### 코디네이터 최종 확인 (2026-10-15)

- 주 대화가 허용된 호스트 환경에서 최종 `npm run check`를 실행했다. exit 0: format/lint/typecheck, 실제 전용 PostgreSQL 통합 테스트를 포함한 backend 4 pass / 0 skip, worker 86 pass / 0 skip, frontend/backend build 모두 통과했다. 연결 값은 출력하거나 문서에 기록하지 않았다.
- 주 대화의 파일 접근 없는 실제 Codex smoke에서 `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna` 모두 `READY`를 반환했다. 가짜 실행기 결과와 구분되는 실제 계정 접근 확인이다. 역할별 CLI 인자와 reasoning effort는 워커 테스트에서 별도로 검증했다.
- 별도 `gpt-6.1-sol` high 읽기 전용 검토가 최종 `approved=true`를 반환했다. 앞서 발견한 구조화 결과 가림, 실패 세션 ID, 게시 경로 검사, 기존 환경 템플릿 회귀가 해결됐고 보호 테스트 SHA가 유지됨을 확인했다. 워커 자체의 독립 재검토도 통과해 verification 단계로 진행했다. 이는 PR 병합 승인이 아니다.
- 검증된 코드를 현재 운영 워커에 반영할 때는 ignored `.local/agent-workflow/runtime/<commit>/`에 실행 모듈을 복사하고 코드 위치와 기존 프로젝트 root 바인딩만 분리한다. 원본/설치 파일 해시를 manifest에 기록하고 기존 큐·worktree·개인 계정·전용 DB 연결을 유지한다. `main`의 버전 관리 파일을 덮어쓰거나 PR을 자동 병합하지 않는다. 활성화와 재시작 기록은 ignored 로컬 운영 기록에 보관한다.
