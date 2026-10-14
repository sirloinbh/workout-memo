# 로컬 AI 작업 자동화

PC가 켜져 있고 워커 프로세스가 실행 중이면, 큐에 등록한 GitHub 이슈를 테스트 → 구현 → 독립 검토 → 실제 검사 → 커밋·푸시·PR → CI 확인 순서로 처리한다. 워커는 한 번에 이슈 하나를 처리하며, 사용자는 주 대화에서 다음 요구사항을 계속 논의할 수 있다.

## 대화와 작업의 연결

주 대화가 스레드 1이다. 요구사항과 완료 기준을 정리해 `sirloinbh/workout-memo`에 이슈를 만들고 큐에 등록한다. 대화 내용을 자동으로 수집하지 않으며, 이슈에 기록한 확정 내용만 작업 대상으로 삼는다. 사용자가 진행 상황을 물으면 주 에이전트가 상태·작업 기록을 읽어 답한다. 완료 결과를 이 채팅에 무인으로 삽입하는 기능은 없다.

스레드 2·3·4에 해당하는 테스트·구현·검토는 역할마다 독립적인 `codex exec` 세션으로 실행된다. 테스트 코드와 단계 요약을 다음 역할에 전달한다. 이슈별 브랜치와 worktree는 주 에이전트가 큐에 등록할 때 준비한다. 역할별 영구 채팅창 네 개를 유지하는 방식은 아니다.

## 준비 및 시작

Windows PowerShell, Git, Node.js, npm, GitHub CLI와 로그인된 Codex CLI가 필요하다. 프로젝트 GitHub 계정 설정은 [기존 인증 문서](project-github-auth.md)를 따른다. 실행에는 네트워크와 Codex 사용량이 필요하며, PC가 켜져 있어도 절전·인터넷 단절·사용량 한도로 작업이 중단될 수 있다.

```powershell
./scripts/agents.ps1 doctor
./scripts/agents.ps1 smoke
./scripts/agents.ps1 start
./scripts/agents.ps1 status
```

`doctor`는 GitHub 계정·원격 주소·Codex 버전과 npm 경로를 확인한다. `smoke`는 파일을 수정하지 않는 작은 실제 모델 요청으로 연결을 검증한다. `start`는 숨겨진 워커 프로세스를 실행한다. 시작프로그램이나 Windows 서비스를 설치하지 않으므로 재부팅 후에는 다시 실행한다.

PowerShell 실행기는 프로젝트의 `.local/node-v24.21.0-win-x64/node.exe`가 있으면 사용하고, 없으면 PATH의 Node를 사용한다. `CODEX_HOME`은 기존 환경변수를 우선하고, 없으면 `%LOCALAPPDATA%/Codex-Account-B`를 사용한다. 다른 계정의 Codex 홈은 실행 전에 해당 환경변수를 지정한다. 사용자 전역 설정·모델·인증 파일은 변경하지 않는다.

실행 파일과 npm 경로를 지정하려면 무시되는 `.local/agent-workflow/config.json`에 설정한다. Windows의 `codexExecutable`은 `.cmd`가 아닌 네이티브 `.exe`를 지정한다. 지정하지 않으면 `volta.exe run codex`를 사용한다. IDE에 포함된 실행 파일 경로는 확장 업데이트 후 바뀔 수 있으므로 `doctor`와 `smoke`로 다시 확인한다.

```json
{
  "codexExecutable": "C:/path/to/codex.exe",
  "npmCli": "C:/path/to/node/node_modules/npm/bin/npm-cli.js"
}
```

## 이슈 등록과 중지

완료 기준이 본문에 있는 열린 이슈를 등록한다. 본문에 `완료 기준` 또는 `Acceptance criteria`를 포함한다.

```powershell
./scripts/agents.ps1 enqueue -Issue 12
./scripts/agents.ps1 status
./scripts/agents.ps1 stop
```

예시 번호 12는 실제 처리할 이슈 번호로 바꾼다. 큐 등록 시 최신 원격 main의 SHA와 이슈 본문·제목·수정 시각을 저장한다. 브랜치는 `feat/12-agent-task`, 작업 공간은 `.local/agent-workflow/worktrees/12`에 만들어 원래 작업 공간을 보존한다. 이미 등록한 이슈는 중복 등록하지 않는다.

`stop`은 현재 단계가 끝나면 중지하도록 요청한다. 실행 중인 모델 호출은 최대 30분 제한이 있으며, 중지 요청이 즉시 모델 호출을 취소하지는 않는다. 단계 사이에 상태를 저장하므로 다시 시작하면 남은 단계부터 처리한다. 테스트·구현 중 강제 종료됐다면 남아 있는 파일을 보존한 채 해당 단계를 재실행한다. 워커 전체 종료 또는 잠금 문제는 `worker.stderr.log`에서 확인한다.

## 검증과 실패 처리

- 테스트 역할이 작성한 테스트 파일의 해시를 저장한다. 구현 역할이 해당 테스트를 수정·삭제하면 중단한다. 테스트가 잘못됐으면 주 대화에서 원인을 검토한 뒤 테스트 단계부터 다시 진행한다.
- 검토는 읽기 전용으로 수행하며 요구사항과 전체 diff를 확인한다. 검토 반려 또는 CI 실패는 구현 단계로 되돌린다. 두 번째 반려·실패까지 해결되지 않으면 `blocked`로 멈춘다.
- 모델의 성공 보고와 별개로 호스트가 `npm run check`, unstaged/staged `git diff --check`를 실행한다. 검증 후 파일 상태가 바뀌면 게시하지 않는다.
- 커밋과 푸시는 이슈 작업 브랜치만 대상으로 한다. 검사 통과 후 draft PR을 만들고, CI의 `verify` 및 게시된 검사 결과가 통과하면 검토 가능한 PR로 전환한다. 병합·자동 병합·PR 승인은 수행하지 않는다.
- DB 통합 검증에는 스키마가 준비된 전용 DB의 `TEST_DATABASE_URL`이 필요하다. 워커 시작 전에 설정해야 하며 기존 사용자 DB를 지정하지 않는다. 미설정이면 로컬 DB 검증을 완료로 보고하지 않고 PR에 구분해 기록한다. CI에서는 기존 전용 PostgreSQL 테스트를 실행한다.
- 권한·설치·검사 실패는 원인과 실패 단계를 저장하고 멈춘다. Codex 역할에는 workspace-write/read-only 샌드박스를 사용하며 무제한 접근 옵션을 사용하지 않는다. 백그라운드에서 승인을 받을 수 없는 작업은 주 대화에서 해결한다.

```powershell
./scripts/agents.ps1 stop
# 워커 종료 후 원인을 해결하고 동일 단계를 재시도
./scripts/agents.ps1 retry -Issue 12
./scripts/agents.ps1 start
```

요구사항이 바뀌면 다음 단계 전에 멈춘다. 새 이슈 내용을 기준으로 다시 테스트부터 진행하려면 명시적으로 새 내용을 인계한다.

```powershell
./scripts/agents.ps1 accept-requirements -Issue 12
./scripts/agents.ps1 start
```

이 명령은 기존 파일을 삭제하거나 reset하지 않는다. 기존 구현과 새 요구사항을 테스트 담당부터 다시 검토한다. 재시도·요구사항 갱신은 워커가 종료된 상태에서만 가능하다.

큐에서 작업을 취소하려면 워커 종료 후 `./scripts/agents.ps1 cancel -Issue 12`를 실행한다. worktree와 기록은 보존하며 이후 자동 처리하지 않는다. 이미 생성된 PR은 자동으로 닫지 않는다.

## 기록과 한계

`.local/agent-workflow/jobs/<번호>/job.json`에 진행 단계, 이슈 스냅샷, Codex 스레드 ID, 단계 요약, 검토 결과와 PR URL을 저장한다. 같은 폴더의 역할별 로그·checks.log에서 상세 결과를 확인한다. 이 폴더는 Git에서 제외되며 인증 파일·토큰을 복사하지 않는다. 로그에도 민감한 데이터를 포함하지 않도록 작업 내용을 작성한다.

단계 상태는 임시 파일을 거쳐 교체하고, PID 잠금으로 워커 중복 실행을 막는다. 죽은 PID 잠금은 다음 실행에서 회수한다. PID가 다른 프로세스에 재사용되었거나 잠금이 손상되었으면 자동 삭제하지 않는다. 실제 소유 프로세스가 없는지 확인한 뒤 해당 잠금 파일만 수동으로 정리한다.

테스트는 `npm run test:agents`이며 Linux와 Windows CI에서 실행한다. `npm run check`에도 포함한다. 이는 상태 전이와 프로세스 경계를 검증하며, 실제 기능 이슈의 모든 요구사항이 자동 충족된다는 보장은 아니다. 사용자 코드 검토와 최종 병합 절차를 유지한다.

참고: [Codex 비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode), [하위 에이전트](https://learn.chatgpt.com/docs/agent-configuration/subagents).
