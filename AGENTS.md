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
- 현재 구현: React + Vite + TypeScript, Express + pg + Zod, PostgreSQL 17, npm workspaces, Docker Compose, GitHub Actions.
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
- 작업 기록: `docs/changes/`.
- 일일 총정리: `docs/daily/YYYY-MM-DD.md`. Asia/Seoul 기준 작업일마다 새 파일을 누적하고 같은 날 추가 작업은 해당 파일에 반영한다. 목록은 `docs/daily/README.md`에 추가하며 과거 상태를 오늘 상태로 덮어쓰지 않는다.
- 최신 다음 작업: `docs/next-steps/README.md`. 주 에이전트는 작업일 마무리·총정리 시 일일 기록과 함께 갱신하며 우선순위·의존성·차단 원인·다음 행동을 적는다. 복구 상세도 `docs/next-steps/`에 둔다. 자동 일일 스케줄러나 큐 등록을 전제하지 않으며 기존 커밋별 변경 기록도 유지한다.

## 검증 명령

- 현재 전체 빌드·테스트: `npm run check`.
- 단위 테스트: `npm test`.
- DB 통합 테스트: 스키마를 준비한 전용 테스트 DB의 `TEST_DATABASE_URL`을 설정하고 `npm test`. 환경변수가 없으면 통합 테스트는 건너뛰므로 DB 검증 완료로 보고하지 않는다.
- 인프라 변경: 초기화된 `infrastructure`에서 `terraform validate`. 실제 AWS 적용은 배포 요청 범위에 한정한다.
- 문서·스킬만 변경: 링크·절차를 검토하고 각 스킬에 skill-creator의 `quick_validate.py`를 실행한다. 앱 전체 검사를 생략했다면 그 사유를 PR에 적는다.
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

- 일반 작업은 Sol이며 문서 구현은 `enqueue -Issue <번호> -TaskKind documentation`, 고위험 검토는 `-ReviewRole highRiskReview`로 명시한다. 제목/본문으로 자동 분류하지 않는다. 기존 #21 변경은 워커 종료 후 `configure -Issue 21 -TaskKind documentation`을 사용한다.
- 어려운 디버깅은 `./scripts/agents.ps1 diagnose -Issue <번호>`를 사용한다. Astra 진단은 읽기 전용이며 별도 잠금·스키마·결과를 ignored `.local/agent-workflow/diagnostics/`에 기록한다. 동시 구현 중에는 시점 스냅샷이며 stale 여부를 확인한다. 자동 escalation은 없다. Astra high와 반복 smoke/진단은 사용량을 소비하므로 명시적 필요가 있을 때만 호출한다. 상세 절차는 [운영 문서](docs/local-agent-workflow.md)를 따른다.
- 큐·로그·로컬 실행 설정은 무시되는 `.local/agent-workflow/`에 저장한다. 진행 확인은 `./scripts/agents.ps1 status`, 중지는 `./scripts/agents.ps1 stop`이다. 채팅 메시지가 없을 때 워커 상태를 이 대화에 자동으로 보내는 기능은 없다.
