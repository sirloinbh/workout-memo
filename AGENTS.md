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

- 개발 기준 저장소: `sirloinbh/workout-memo`. 코드 원본은 이 우산 모노레포에서 관리한다.
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

## 검증 명령

- 현재 전체 빌드·테스트: `npm run check`.
- 단위 테스트: `npm test`.
- DB 통합 테스트: 스키마를 준비한 전용 테스트 DB의 `TEST_DATABASE_URL`을 설정하고 `npm test`. 환경변수가 없으면 통합 테스트는 건너뛰므로 DB 검증 완료로 보고하지 않는다.
- 인프라 변경: 초기화된 `infrastructure`에서 `terraform validate`. 실제 AWS 적용은 배포 요청 범위에 한정한다.
- 문서·스킬만 변경: 링크·절차를 검토하고 각 스킬에 skill-creator의 `quick_validate.py`를 실행한다. 앱 전체 검사를 생략했다면 그 사유를 PR에 적는다.
- 추가 도구를 도입하면 실제 실행 가능한 검사 명령을 package.json, CI, 이 문서에 함께 반영한다. 아직 설치하지 않은 도구의 명령을 실행 가능한 것으로 표시하지 않는다.
