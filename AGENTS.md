# Workout Memo 프로젝트 지침

## 구현 작업 절차

기능 추가·수정·리팩터링·설정·문서·스킬 변경 요청에는 반드시 [workout-implementation](skills/workout-implementation/SKILL.md)을 읽고 적용한다.

1. `sirloinbh/workout-memo`에 이슈를 등록한다. 사용자가 지정한 기존 이슈가 있으면 재사용한다.
2. 이슈 번호를 포함한 작업 브랜치를 만든다: `<type>/<issue-number>-<slug>`.
3. 해당 브랜치에서 구현·수정과 관련 테스트 코드를 함께 작성하고, 각 작업 커밋에 `docs/changes/<issue-number>-<slug>.md`의 관련 변경 기록을 함께 포함한다.
4. 커밋 전과 PR 생성·갱신 전에 관련 테스트를 실행하고 결과를 docs와 PR에 기록한다. 구현·테스트·docs를 함께 커밋한다.
5. **PR 병합은 사용자만 수행한다. 에이전트는 병합·자동 병합·승인으로 병합을 대신하지 않는다.**

질문 답변·추천·읽기 전용 조사는 이슈나 브랜치를 만들지 않는다. 실행 권한 제한이나 외부 인증이 막히면 정확한 차단 사유를 알리고 완료한 단계와 남은 단계를 구분한다.

## 프로젝트 기준

- GitHub 개인 작업은 `ghp`를 우선 사용하며, 함수가 없는 비대화형 워커·Git helper는 `scripts/gh-project.ps1`을 명시적으로 호출한다. 개인 설정은 `%USERPROFILE%/.config/gh-personal`, 기대 계정은 `sirloinbh`이다. 기본 `gh`는 회사 계정 `byunghKim`용으로 유지하며 프로젝트 원격 변경에 사용하지 않는다.
- Codex는 `CODEX_HOME=%LOCALAPPDATA%/Codex-Account-B`로 기존 개인 계정B 프로필을 선택한다. 실행 중인 회사 계정 대화의 자동 전환을 전제하지 않는다. 인증 및 실행기 적용 절차는 [인증 문서](docs/project-github-auth.md)를 따른다.
- 개발 기준 저장소: `sirloinbh/workout-memo`. 코드 원본은 이 우산 모노레포에서 관리한다.
- 이 저장소의 GitHub 작업은 개인 계정 `sirloinbh`의 `ghp` 또는 `scripts/gh-project.ps1` 프로젝트 래퍼를 사용한다. 기본 회사 계정 `gh`로 원격 변경을 수행하지 않는다. 개인 인증 설정은 `%USERPROFILE%/.config/gh-personal`을 재사용하며, 설치 스크립트 위치 `%LOCALAPPDATA%/gh-workout-memo`와 구분한다.
- `frontend`, `backend`, `database`, `infrastructure`의 별도 저장소는 subtree 배포 대상이다. 일상적인 PR 작업 중 별도 저장소나 `main`에 직접 푸시하지 않는다. `scripts/push-repositories.ps1`은 별도 동기화 요청 시에만 사용한다.
- 현재 구현: React + Vite + TypeScript(React Router 페이지 URL, TanStack Query 서버 조회, React Hook Form, Tailwind CSS 4 토큰·`components/ui` 공통 컴포넌트), Express + pg + Zod, PostgreSQL 17, npm workspaces, Docker Compose, GitHub Actions.
- 웹 포트: `8088`. 호스트 DB 포트: `55432`. 사용자 요청 없이 `8080`으로 변경하지 않는다.
- 운동 날짜는 `YYYY-MM-DD`, 서비스 시간대는 `Asia/Seoul`. 중량은 머신 기본중량을 포함한 총중량 kg이다. 확인하지 못한 머신 기본중량은 NULL로 보관한다.
- 입력 검증과 목표 판정은 서버에서도 수행한다. 일지 및 세트 수정은 트랜잭션으로 처리한다.
- `.env`, 인증 토큰, 실제 백업, Terraform state는 커밋하거나 docs·PR·로그에 기록하지 않는다.
- 사용자 변경을 덮어쓰지 않는다. 필요한 파일만 명시해서 stage한다.

## 스킬과 문서

- 구현·수정 테스트: [workout-testing](skills/workout-testing/SKILL.md). 새 기능은 관련 테스트, 버그 수정은 회귀 테스트를 함께 작성한다.
- 작업 절차: [workout-implementation](skills/workout-implementation/SKILL.md).
- 개발 기반 구축·정리: [workout-foundation](skills/workout-foundation/SKILL.md). 적용 시 위 구현 절차도 함께 따른다.
- 실행·운영: [README.md](README.md).
- 기술 추천과 적용 순서: [stack.md](skills/workout-foundation/references/stack.md). 추천 목록은 설치 완료 목록이 아니다.
- 스킬 원본은 `skills/`이다. Claude Code용 복제본 `.claude/skills/`는 직접 수정하지 않고 원본 변경 후 `npm run skills:sync`로 갱신한다. `npm run check`의 `test:skills`가 불일치를 실패로 처리한다.
- 화면 디자인: [디자인 시스템](docs/design-system.md). 새 요소는 `frontend/src/components/ui`를 먼저 쓰고 색·모서리는 `theme.css` 토큰을 쓴다. Preflight와 기존 스타일 전면 교체는 전체 화면 비교와 함께 별도 이슈로 진행한다.
- 작업 기록: `docs/changes/`.
- 일일 총정리: `docs/daily/YYYY-MM-DD.md`. Asia/Seoul 기준 작업일마다 새 파일을 누적하고 같은 날 추가 작업은 해당 파일에 반영한다. 목록은 `docs/daily/README.md`에 추가하며 과거 상태를 오늘 상태로 덮어쓰지 않는다.
- 최신 다음 작업: `docs/next-steps/README.md`. 주 에이전트는 작업일 마무리·총정리 시 일일 기록과 함께 갱신하며 우선순위·의존성·차단 원인·다음 행동을 적는다. 복구 상세도 `docs/next-steps/`에 둔다. 자동 일일 스케줄러나 큐 등록을 전제하지 않으며 기존 커밋별 변경 기록도 유지한다.

## 검증 명령

- 현재 전체 빌드·테스트: `npm run check`.
- 단위 테스트: `npm test`. 백엔드는 node:test(`backend/test`), 화면은 Vitest·jsdom·React Testing Library(`frontend/src/*.test.tsx`, `npm run test -w frontend`)로 실행한다.
- 브라우저 검증: `npm run test:e2e`(Playwright, 설치된 Chrome 사용). `db:migrate`로 준비한 테스트 DB를 `E2E_DATABASE_URL`(없으면 `TEST_DATABASE_URL`)로 지정한다. API 3101·화면 5174 포트를 띄우며 개인 DB를 지정하지 않는다. CI의 `e2e` 작업이 PR마다 실행한다.
- DB 통합 테스트: 전용 테스트 DB를 `DATABASE_URL`로 지정해 `npm run db:migrate`로 스키마를 준비하고, 같은 DB의 `TEST_DATABASE_URL`을 설정해 `npm test`. 환경변수가 없으면 통합 테스트는 건너뛰므로 DB 검증 완료로 보고하지 않는다.
- DB 스키마 변경: `database/migrations/`에 새 번호 파일을 재실행 안전하게 추가한다. 적용된 파일은 수정하지 않는다. 절차는 [database/README.md](database/README.md)를 따른다.
- 입력 스키마 변경: 일지·세트·머신·목표·신체 기록 스키마의 원본은 `shared/contract.ts`이다. 수정 후 `npm run contract:sync`로 `backend/src/contract.ts`·`frontend/src/contract.ts`를 갱신하고 복제본은 직접 수정하지 않는다. `npm run check`의 `contract:check`가 불일치를 실패로 처리한다. 화면 폼은 React Hook Form + `zodResolver` 또는 저장 전 `safeParse`로 같은 스키마를 사용한다.
- API 라우트 변경: `backend/src/routes/`의 기능 모듈과 [REST API 계약](docs/api.md)을 함께 고친다. `api-contract.test.ts`가 둘의 불일치를 실패로 처리한다. `backend/src/openapi.ts`의 `operations`를 맞추고 `npm run openapi`로 `docs/openapi.json`을 다시 생성한다(`openapi.test.ts`가 오래된 파일을 실패 처리).
- 인프라 변경: 초기화된 `infrastructure`에서 `terraform fmt -check`·`terraform validate`, 셸 스크립트는 `bash -n`. 실제 AWS 적용은 배포 요청 범위에 한정하고, 개인 계정 프로필(`aws_profile`·`expected_account_id`)로 plan을 사용자에게 확인받은 뒤 apply한다. 회사 기본 AWS 프로필로 적용하지 않는다. 절차는 [배포·운영](docs/deployment.md)을 따른다. main에 병합된 커밋은 서버 timer가 CI 통과 후 자동 배포하므로(#75), main 병합은 곧 운영 배포다.
- 문서·스킬만 변경: 링크·절차를 검토하고 각 스킬에 skill-creator의 `quick_validate.py`를 실행한다. 앱 전체 검사를 생략했다면 그 사유를 PR에 적는다.
- npm 패키지 도입은 사용자 위험 인지 확인 후 [검증된 반복 절차](skills/workout-foundation/references/procedures.md)의 고정 버전·14일 경과·`--ignore-scripts`·subtree lockfile 재생성·Docker 빌드 확인을 따른다.
- 추가 도구를 도입하면 실제 실행 가능한 검사 명령을 package.json, CI, 이 문서에 함께 반영한다. 아직 설치하지 않은 도구의 명령을 실행 가능한 것으로 표시하지 않는다.

## 로컬 에이전트 작업

- 사용자가 요청한 다중 에이전트 작업은 [운영 문서](docs/local-agent-workflow.md)에 따라 확정한 이슈를 `./scripts/agents.ps1 enqueue -Issue <번호>`로 등록한다. 이 대화가 요구사항 및 진행 확인 창구다. 주 에이전트는 큐 등록 뒤 계속 요구사항 대화를 진행할 수 있다.
- 로컬 워커가 실행 중일 때 새로운 개발 요청을 받으면 주 에이전트가 요구사항·완료 기준·이슈를 준비하고 큐에 등록한다. 같은 이슈를 주 에이전트가 동시에 직접 구현하지 않는다. 사용자와의 소통 및 blocked 원인 해소를 담당한다.
- 워커는 이슈별 worktree에서 테스트 → 구현 → 독립 검토를 별도 Codex 실행으로 처리한다. 이미 등록한 이슈와 준비한 브랜치를 재사용하며 하위 에이전트가 이슈·브랜치를 중복 생성하지 않는다.
- 워커가 지시한 테스트·구현 역할은 파일 변경과 검증 기록만 수행한다. 검토 역할은 읽기 전용이다. 커밋·푸시·PR은 검증 후 워커가 담당한다. PR 병합은 사용자만 수행한다.
- 워커 변경은 `npm run test:agents`로 상태 전이·잠금·실행 경계 동작을 검증한다. 전체 `npm run check`에도 포함한다.
- 워커 모델은 `scripts/agents/models.mjs`에서 역할별로 고정하고 모든 `codex exec`에 모델·추론 수준을 명시한다. 사용자 명시 요청 전 모델 변경 및 임의 fallback을 금지한다. 접근 실패는 blocked로 기록한다. 현재 채팅이나 사용자/전역 Codex 설정은 변경하지 않는다.

| 역할                                | 모델        | reasoning effort |
| ----------------------------------- | ----------- | ---------------- |
| planning, debugging, highRiskReview | gpt-6-astra | high             |
| tests, implementation, review       | gpt-6.1-sol | medium           |
| research, documentation             | gpt-6-luna  | medium           |

- 테스트 복잡도는 `-TestComplexity simple|complex`로 enqueue/configure 시 명시한다. 단순 정상·오류 입력 테스트만 `simple`로 지정하면 tests 역할은 gpt-6-luna medium을 사용한다. 미지정 기존 job과 트랜잭션·동시성·복잡한 경계 테스트(`complex`)는 Sol을 유지한다. 기존 실행 중 job을 자동 재분류하지 않는다.
- 필수 DB/브라우저 검증은 `-RequireDatabase true -RequireBrowser true`로 명시한다. 모델 호출 전 도구·잠금·worktree·의존성 및 필수 환경을 검사하며 실패 시 모델 호출 없이 환경 차단을 기록한다. 브라우저 필수 작업에는 로컬 config의 `browserExecutable`, `browserCheckArgs`가 필요하다. 자동 설치·ACL 변경·샌드박스 해제는 하지 않는다.
- 역할 문맥은 완료 기준·base SHA·변경 경로·최근 검사 요약·미해결 지적만 전달한다. 전체 로그·해시·감사 기록은 로컬에 보존한다. 한도 초과 중요 지적은 조용히 자르지 않고 인계 전 중단한다. 검토 증거가 동일한 환경 복구는 통과한 코드 단계를 재사용하고, 변경 시 재검토한다. 보호 테스트 수정은 워커 종료 후 `handoff-tests -Issue <번호>`로 테스트 역할에 정식 재인계한다.

- 일반 작업은 Sol이며 문서 구현은 `enqueue -Issue <번호> -TaskKind documentation`, 고위험 검토는 `-ReviewRole highRiskReview`로 명시한다. 제목/본문으로 자동 분류하지 않는다. 기존 #21 변경은 워커 종료 후 `configure -Issue 21 -TaskKind documentation`을 사용한다.
- 어려운 디버깅은 `./scripts/agents.ps1 diagnose -Issue <번호>`를 사용한다. Astra 진단은 읽기 전용이며 별도 잠금·스키마·결과를 ignored `.local/agent-workflow/diagnostics/`에 기록한다. 동시 구현 중에는 시점 스냅샷이며 stale 여부를 확인한다. 자동 escalation은 없다. Astra high와 반복 smoke/진단은 사용량을 소비하므로 명시적 필요가 있을 때만 호출한다. 상세 절차는 [운영 문서](docs/local-agent-workflow.md)를 따른다.
- 큐·로그·로컬 실행 설정은 무시되는 `.local/agent-workflow/`에 저장한다. 진행 확인은 `./scripts/agents.ps1 status`, 중지는 `./scripts/agents.ps1 stop`이다. 이벤트와 판단 요청은 영속 기록하지만 실제 Codex 채팅 전송 어댑터는 연결되지 않았다. pending을 전달 완료로 보고하지 않는다. 실제 사용자 답변은 워커 종료 후 `respond -Issue <번호> -ResponseFile <UTF-8 JSON>`으로 인계하며 질문·이슈·요구사항 버전을 검증한다. 실제 채팅 왕복 전 #43 PR은 draft로 유지한다. `npm run test:agents`와 전체 검사 및 Linux/Windows 워커 CI에 관련 테스트를 포함한다.
