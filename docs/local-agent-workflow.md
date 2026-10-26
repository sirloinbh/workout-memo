# 로컬 AI 작업 자동화

PC가 켜져 있고 워커 프로세스가 실행 중이면, 큐에 등록한 GitHub 이슈를 테스트 → 구현 → 독립 검토 → 실제 검사 → 커밋·푸시·PR → CI 확인 순서로 처리한다. 워커는 한 번에 이슈 하나를 처리하며, 사용자는 주 대화에서 다음 요구사항을 계속 논의할 수 있다.

워커 코드와 실행 방법의 원본은 중앙 리포 `sirloinbh/project-standards`다. 설치, 명령, 역할별 모델, `.agents.json` 형식은 중앙 [docs/tools.md의 로컬 에이전트 워커](https://github.com/sirloinbh/project-standards/blob/main/docs/tools.md#로컬-에이전트-워커-toolsagents)를 따른다. 워커를 고칠 때는 중앙 리포에 이슈를 연다. 이 문서에는 이 리포에만 해당하는 설정을 적는다.

## 실행

중앙 리포의 `tools\install.ps1`이 실행기를 `%LOCALAPPDATA%\sirloinbh-tools\`에 설치한다. 리포 폴더에서 다음처럼 실행한다.

```powershell
$agents = "$env:LOCALAPPDATA\sirloinbh-tools\agents.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . doctor
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . start
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . enqueue -Issue 12 -Slug csv-export
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . status
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . stop
```

예시 번호 12와 `csv-export`는 실제 이슈 번호와 영문 요약으로 바꾼다. 완료 기준(`완료 기준` 또는 `Acceptance criteria`)이 본문에 있는 열린 이슈만 등록한다.

## 이 리포의 설정

### `.agents.json`

리포 루트의 `.agents.json`에 DB 사전검사로 확인할 테이블 5개(`brands`, `machines`, `workouts`, `sets`, `goals`)와 필수 컬럼을 적는다. 마이그레이션으로 이 컬럼을 바꾸면 이 파일도 함께 고친다.

- `checkScript`는 기본값 `check`(`npm run check`)를 쓴다.
- `autoMerge`는 적지 않는다. 기본값 `true`라 CI 통과 후 워커가 PR을 병합한다(#128에서 사용자가 허용, 중앙 #184 표). main 병합은 곧 운영 배포다.

### DB가 필요한 작업

`-RequireDatabase true`로 등록한 작업은 전용 테스트 DB의 `TEST_DATABASE_URL`이 있어야 한다. 운영 DB나 사용자 데이터를 쓰지 않고, 연결 값은 docs·PR·로그에 적지 않는다. 사전검사는 위 테이블·컬럼을 조회만 하며 DB 생성·마이그레이션은 하지 않는다.

### PC별 설정과 작업 기록

- 큐·잠금·worktree·로그는 무시되는 `.local/agent-workflow/`에 둔다. 리포 안 워커 사본(#149에서 삭제)이 남긴 job 기록도 같은 경로라 중앙 워커가 그대로 읽는다.
- Codex 실행 파일, npm, 브라우저 경로는 `.local/agent-workflow/config.json`에 둔다(`codexExecutable`, `npmCli`, `browserExecutable`, `browserCheckArgs`). 커밋하지 않는다.
- 프로젝트의 `.local/node-v24.21.0-win-x64/node.exe`가 있으면 실행기가 그 Node를 쓴다.

## 검증

워커 동작 테스트는 중앙 리포의 `npm run test:agents`다. 이 리포의 `npm run check`에는 들어 있지 않다. 이 리포에서는 `doctor`로 계정·리포 등록·`.agents.json`·Codex·npm을 확인한다.
