# FORM · 나의 운동 기록

나 한 명의 운동 일지를 기록하고, 기간별 훈련량과 점진적 과부하 목표를 확인하는 서비스입니다. 로그인 없이 로컬에서 사용합니다.

## 개발 기준

Node.js **24.21.0**, npm **11.19.0**을 사용합니다. 설치는 `npm ci`, 포맷은 `npm run format`, 전체 검증은 `npm run check`입니다. 상세 명령과 잠금 파일 정책은 [개발 기준 문서](docs/development-baseline.md)를 참고하세요.

## 개발 작업 절차와 Codex 스킬

변경 작업은 **GitHub 이슈 등록 → 이슈 번호 기반 브랜치 → 구현 및 커밋별 docs 기록 → 테스트 후 PR → 사용자 직접 병합** 순서로 진행합니다. 상세 규칙은 [AGENTS.md](AGENTS.md)와 [구현 절차 스킬](skills/workout-implementation/SKILL.md)에 있습니다.

앞서 정리한 기술 구성·코드 규칙·API·디자인·검증·운영 추천은 [개발 기반 스킬](skills/workout-foundation/SKILL.md)에 보관합니다. 스킬 원본은 이 저장소의 `skills/`이며, Codex 스킬 경로에 설치하면 `$workout-implementation`, `$workout-foundation`으로 사용할 수 있습니다. 로컬 설치본을 수정하기보다 저장소 원본을 갱신한 뒤 다시 설치하세요. Claude Code용 복제본은 `.claude/skills/`에 있으며, 원본 수정 후 `npm run skills:sync`로 갱신합니다(`npm run check`가 불일치를 검출). 새 세션에서 스킬 목록이 갱신됩니다. 구현·수정 시 테스트 코드도 함께 작성하고 커밋 전과 PR 생성·갱신 전에 실행합니다. [테스트 스킬](skills/workout-testing/SKILL.md)은 `$workout-testing`으로 사용할 수 있습니다. PR 병합은 사용자가 수행합니다.

## 로컬 AI 작업 자동화

작업일별 총정리는 [일일 작업 기록](docs/daily/README.md)에 날짜별로 누적하고, 최신 우선순위·할 일·차단 해제 절차는 [다음 작업](docs/next-steps/README.md)에서 갱신합니다.

요구사항 대화는 주 에이전트와 진행하고, 확정한 이슈는 PC에서 테스트 → 구현 → 독립 검토 → 검사 → PR 순서로 처리합니다. 시작·중지·이슈 등록·복구 방법은 [로컬 에이전트 운영 문서](docs/local-agent-workflow.md)를 참고하세요.

```powershell
./scripts/agents.ps1 start
./scripts/agents.ps1 enqueue -Issue 12
./scripts/agents.ps1 status
./scripts/agents.ps1 stop
```

## 실행

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

접속: http://localhost:8088 . `.env`의 비밀번호를 변경한 후 실행하세요. 데이터는 `workout-data` 볼륨에 저장됩니다. `docker compose down` 후에도 유지되며, `down -v`는 데이터를 삭제합니다.

개발 실행:

```powershell
docker compose up -d db
npm ci
npm run dev
```

http://localhost:5173 . `.env`의 DATABASE_URL 비밀번호도 함께 맞추세요. 비밀번호에 URL 예약문자가 있으면 DATABASE_URL에 URL 인코딩이 필요합니다.

## 기능과 규칙

- **루틴짜기**: 무분할~5분할, 순서와 중복을 보존하는 운동 부위, 운동별 기준 세트·총중량 kg·반복 수를 입력해 저장합니다. 시작일·주당 운동 횟수·휴식 요일을 직접 지정하며 운동일마다 분할을 순환합니다. 12주 각각의 중량/반복 증가량과 4·8·12주차의 디로딩 대상·감소량을 수동 입력합니다. 저장된 계획을 다시 조회할 수 있으며 실제 일지나 목표 달성을 생성하지 않습니다. 기존 DB에는 [루틴 마이그레이션](database/README.md)을 먼저 적용하세요.

피트니스 서비스 13개의 기능·가격·웹 지원 비교와 추가 구현 이슈는 [서비스 조사 및 구현 백로그](docs/fitness-app-research-2026.md)를 참고하세요.

- 일지 입력·조회·수정·삭제, 세트별 운동명·총중량·반복 수·머신·메모.
- 1일, 월요일 기준 1주, 달력 1달, 기준일까지 4주/12주 조회. 기간별 일수·볼륨·세트 수와 그래프. 기간 일지는 날짜별 기록을 모아 확인하고 각각 편집하는 방식입니다.
- 목표 시작일·종료일, 목표 총중량·반복 수. 같은 운동명(앞뒤 공백·영문 대소문자 무시)으로 한 세트에서 두 조건을 모두 충족하면 달성. 미래 기록은 목표 판정에서 제외합니다.
- 브랜드 선택, Arsenal Strength 등 머신 기본중량 입력·수정. 미확인 값은 NULL이며 샘플 중량을 사실처럼 제공하지 않습니다.
- 중량은 기본중량을 포함한 총중량입니다. 좌우/편측 장비도 동일한 기준으로 입력하세요.

## 저장소 구성

이 저장소는 전체 소스를 포함하는 우산 모노레포입니다. `frontend`, `backend`, `database`, `infrastructure`는 `git subtree split`으로 각 비공개 저장소에 배포합니다. 루트에 Docker Compose, 통합 CI, 운영 스크립트를 둡니다. 일반 `git clone URL`로 전체 구성을 받을 수 있습니다. 변경은 이 모노레포에서 커밋하고 `scripts/push-repositories.ps1`로 각 저장소에 반영합니다. 하위 저장소에서 직접 변경한 경우에는 먼저 `git subtree pull --prefix=frontend URL main --squash`처럼 동기화하세요.

## 검증·운영

`npm run check`는 TypeScript 빌드와 테스트입니다. 실제 DB 테스트는 `TEST_DATABASE_URL`을 설정하세요. GitHub 통합 CI는 전용 PostgreSQL 서비스에서 전체 빌드와 DB 통합 테스트를 수행합니다. 프론트엔드·백엔드 저장소에서는 개별 빌드 및 Docker 이미지 빌드도 검사합니다.

`docker compose logs --tail 100 api`로 오류 확인, `./scripts/backup.ps1`로 SQL 백업. 백업은 PC 외부의 별도 안전한 저장소에도 보관하고 정기적으로 복원 확인을 하세요. AWS 초안·비용 관리는 `infrastructure/README.md`를 참고하세요. 자동 운영 배포는 아직 연결되지 않았습니다.

실제 AWS 배포에는 계정, 실행 환경, 도메인, 비용 한도 결정이 필요합니다. 이 앱의 포트는 localhost에만 바인딩됩니다.

개인용 앱 8개의 공유 서버·DB 운영 대안과 가정별 월 예산은 [공유 호스팅 비용 문서](docs/shared-hosting-costs.md)를 참고하세요.

## 프로젝트 전용 GitHub 계정

이 프로젝트의 gh와 Git 인증은 sirloinbh 전용 설정을 사용합니다. VS Code 계정B 실행·환경변수·래퍼 명령·검증 방법은 [인증 설정 문서](docs/project-github-auth.md)를 참고하세요.
