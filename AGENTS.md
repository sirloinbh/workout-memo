# Workout Memo 프로젝트 지침

이 파일은 공통 지침이다. 이 프로젝트에만 해당하는 규칙(서비스 규칙, PR 리뷰·병합 규칙, 계정·도구, 고유 스킬, 고유 검증 명령, 로컬 에이전트 작업)은 **[AGENTS.project.md](AGENTS.project.md)를 반드시 함께 읽고 따른다.** 두 파일이 다르면 AGENTS.project.md가 우선한다.

## 구현 작업 절차

기능 추가·수정·리팩터링·설정·문서·스킬 변경 요청에는 반드시 [workout-implementation](skills/workout-implementation/SKILL.md)을 읽고 적용한다.

1. `sirloinbh/workout-memo`에 이슈를 등록한다. 사용자가 지정한 기존 이슈가 있으면 재사용한다.
2. 이슈 번호를 포함한 작업 브랜치를 만든다: `<type>/<issue-number>-<slug>`.
3. 해당 브랜치에서 구현·수정과 관련 테스트 코드를 함께 작성하고, 각 작업 커밋에 `docs/changes/<issue-number>-<slug>.md`의 관련 변경 기록을 함께 포함한다.
4. 커밋 전과 PR 생성·갱신 전에 관련 테스트를 실행하고 결과를 docs와 PR에 기록한다. 구현·테스트·docs를 함께 커밋한다.
5. PR 리뷰와 병합 규칙은 [AGENTS.project.md](AGENTS.project.md)의 "작업 절차"를 따른다.

질문 답변·추천·읽기 전용 조사는 이슈나 브랜치를 만들지 않는다. 실행 권한 제한이나 외부 인증이 막히면 정확한 차단 사유를 알리고 완료한 단계와 남은 단계를 구분한다.

## 프로젝트 기준

- 개발 기준 저장소: `sirloinbh/workout-memo`. 코드 원본은 이 우산 모노레포에서 관리한다.
- 이 저장소의 GitHub 작업은 개인 계정 `sirloinbh`의 `ghp` 또는 `scripts/gh-project.ps1` 프로젝트 래퍼를 사용한다. 기본 회사 계정 `gh`로 원격 변경을 수행하지 않는다.
- `frontend`, `backend`, `database`의 별도 저장소는 subtree 배포 대상이다. 일상적인 PR 작업 중 별도 저장소나 `main`에 직접 푸시하지 않는다. `scripts/push-repositories.ps1`은 별도 동기화 요청 시에만 사용한다. AWS 인프라는 공유 저장소 `sirloinbh/shared-aws-infrastructure`에서 관리한다.
- 포트(127.0.0.1 바인딩): 웹 `8101`, API `3101`, Vite `5201`, 호스트 DB `15401`, e2e API `3201`, e2e 웹 `5301`. 포트는 중앙 레지스트리(`sirloinbh/project-standards`의 `registry/projects.json`, 슬롯 01) 값이며, 바꾸려면 중앙 리포에 이슈를 연다.
- 날짜는 `YYYY-MM-DD`, 서비스 시간대는 `Asia/Seoul`이다.
- 입력 검증과 판정은 서버에서도 수행한다. 여러 행 변경은 트랜잭션으로 처리한다.
- `.env`, 인증 토큰, 실제 백업, Terraform state는 커밋하거나 docs·PR·로그에 기록하지 않는다.
- 사용자 변경을 덮어쓰지 않는다. 필요한 파일만 명시해서 stage한다.

## 스킬과 문서

- 고유 스킬과 화면 디자인 규칙은 [AGENTS.project.md](AGENTS.project.md)에 있다.
- 실행·운영: [README.md](README.md).
- 스킬 원본은 `skills/`이다. Claude Code용 복제본 `.claude/skills/`는 직접 수정하지 않고 원본 변경 후 `npm run skills:sync`로 갱신한다. `npm run check`의 `test:skills`가 불일치를 실패로 처리한다.
- 작업 기록: `docs/changes/`.
- 일일 총정리: `docs/daily/YYYY-MM-DD.md`. Asia/Seoul 기준 작업일마다 새 파일을 누적하고 같은 날 추가 작업은 해당 파일에 반영한다. 목록은 `docs/daily/README.md`에 추가하며 과거 상태를 오늘 상태로 덮어쓰지 않는다.
- 최신 다음 작업: `docs/next-steps/README.md`. 주 에이전트는 작업일 마무리·총정리 시 일일 기록과 함께 갱신하며 우선순위·의존성·차단 원인·다음 행동을 적는다. 복구 상세도 `docs/next-steps/`에 둔다. 자동 일일 스케줄러나 큐 등록을 전제하지 않으며 기존 커밋별 변경 기록도 유지한다.

## 검증 명령

- 현재 전체 빌드·테스트: `npm run check`.
- DB 통합 테스트: 전용 테스트 DB를 `DATABASE_URL`로 지정해 `npm run db:migrate`로 스키마를 준비하고, 같은 DB의 `TEST_DATABASE_URL`을 설정해 `npm test`. 환경변수가 없으면 통합 테스트는 건너뛰므로 DB 검증 완료로 보고하지 않는다.
- DB 스키마 변경: `database/migrations/`에 새 번호 파일을 재실행 안전하게 추가한다. 적용된 파일은 수정하지 않는다. 절차는 [database/README.md](database/README.md)를 따른다.
- 문서·스킬만 변경: 링크·절차를 검토하고 각 스킬에 skill-creator의 `quick_validate.py`를 실행한다. 앱 전체 검사를 생략했다면 그 사유를 PR에 적는다.
- 추가 도구를 도입하면 실제 실행 가능한 검사 명령을 package.json, CI, 이 문서에 함께 반영한다. 아직 설치하지 않은 도구의 명령을 실행 가능한 것으로 표시하지 않는다.
- 고유 검증 명령(단위·브라우저 테스트, 입력 스키마, API 라우트, 인프라, 패키지 도입)은 [AGENTS.project.md](AGENTS.project.md)를 따른다.
