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

`npmCli`를 명시하면 Windows와 POSIX 모두 현재 Node로 해당 파일을 실행한다. 파일이 없으면 PATH의 npm으로 대체하지 않고 환경 오류로 중단한다. 미지정 시 POSIX는 PATH의 npm을, Windows는 Node 옆의 `node_modules/npm/bin/npm-cli.js`를 사용한다.

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
- 이 게시 전 독립 검토(최대 2회)가 PR 자동 코드 리뷰를 갈음한다. 두 번째 반려로 blocked된 job은 주 에이전트가 처리한다. 2차 지적을 추가 커밋으로 반영해 재리뷰 없이 CI 후 병합하거나, 큰 수정은 새 이슈카드로 분리한다(`workout-implementation` 5단계).
- 모델의 성공 보고와 별개로 호스트가 `npm run check`, unstaged/staged `git diff --check`를 실행한다. 검증 후 파일 상태가 바뀌면 게시하지 않는다.
- 커밋과 푸시는 이슈 작업 브랜치만 대상으로 한다. 검사 통과 후 draft PR을 만들고, CI의 `verify` 및 게시된 검사 결과가 통과하면 검토 가능한 PR로 전환하고 `--merge --match-head-commit <검증 커밋>`으로 병합한다. GitHub가 main보다 뒤처졌거나(`BEHIND`) 충돌(`CONFLICTING`)로 보고하면 `origin/main`을 merge해 push하고 재검증·CI를 기다린다. 자동 merge가 충돌하면 merge를 중단하고 `merge-conflict`로 blocked 처리한다. 주 에이전트가 worktree에서 merge 커밋으로 해결한 뒤 `retry`하면 구현·검토·검증을 거쳐 그 커밋을 게시한다. PR 승인은 수행하지 않는다.
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

## 역할별 모델과 명시적인 라우팅

`scripts/agents/models.mjs`가 승인된 배정의 단일 원본이다. 각 호출은 배열 인자로 `--model <모델> -c model_reasoning_effort="<수준>"`을 전달한다. 사용자/전역 모델 설정을 바꾸지 않으며, 현재 채팅의 모델을 소급 변경하지 않는다. CLI 인자는 [공식 Codex CLI 문서](https://learn.chatgpt.com/docs/developer-commands?surface=cli)를 참고했다. 아래 모델 이름은 이슈 #24에서 사용자가 지정한 값이며, 계정의 실제 접근 가능 여부는 별도의 smoke 결과로 확인한다.

| 역할           | 모델        | reasoning effort | 사용 경로                                              |
| -------------- | ----------- | ---------------- | ------------------------------------------------------ |
| planning       | gpt-6-astra | high             | 역할 smoke로 선택 가능; 자동 설계 단계는 추가하지 않음 |
| debugging      | gpt-6-astra | high             | 명시적인 diagnose                                      |
| highRiskReview | gpt-6-astra | high             | 명시적인 검토 옵션                                     |
| tests          | gpt-6.1-sol | medium           | 테스트 단계                                            |
| implementation | gpt-6.1-sol | medium           | 일반 구현 단계                                         |
| review         | gpt-6.1-sol | medium           | 기본 검토 단계                                         |
| research       | gpt-6-luna  | medium           | 역할 smoke로 선택 가능; 자동 검색 단계는 추가하지 않음 |
| documentation  | gpt-6-luna  | medium           | 명시적인 문서 작업의 구현 단계                         |

기존 job에 선택 필드가 없으면 `taskKind=code`, `reviewRole=review`로 동작한다. 문서 제목이나 본문 키워드로 Luna를 선택하지 않는다. 문서 작업도 테스트 단계는 기본 Sol이며 명시적인 simple 설정에만 Luna를 사용하고, 검토 단계는 선택한 검토 역할을 사용한다. 알 수 없는 역할/작업 종류/모델 옵션을 거부하며 모델 접근 실패 시 다른 모델로 재시도하지 않는다. 모델 변경은 사용자의 명시 요청을 반영한 설정 변경으로만 허용한다.

```powershell
./scripts/agents.ps1 enqueue -Issue 21 -TaskKind documentation
./scripts/agents.ps1 enqueue -Issue 24 -ReviewRole highRiskReview
# 이미 등록된 #21에는 enqueue를 반복하지 않는다.
./scripts/agents.ps1 stop
./scripts/agents.ps1 status
# worker.running=false 확인 후 (현재 역할 호출이 끝날 때까지 기다린다)
./scripts/agents.ps1 configure -Issue 21 -TaskKind documentation
./scripts/agents.ps1 start
```

`configure`는 워커 잠금 아래에서 queued 또는 blocked이며 실행 단계가 없는 job만 갱신한다. 기존 worktree, 이슈, 단계, 시도 횟수, 결과는 보존한다. blocked 작업은 설정 변경 후 원인 해결 여부를 확인하고 `retry`를 따로 실행한다. 실행 중 job JSON을 수동 변경하지 않는다. `-TaskKind code`와 `-ReviewRole review`로 기본 배정을 명시할 수 있다. `status`의 `roles`에는 단계별 선택 역할/모델/추론 수준/실제 thread ID가 표시된다. 프로세스가 세션 시작 전에 실패하면 thread ID는 null이다.

실제 모델 접근 확인은 주 대화가 검증 후 작은 read-only 호출로 수행한다. 모든 역할을 반복 호출할 필요 없이 세 모델의 대표 역할을 선택한다.

```powershell
./scripts/agents.ps1 smoke -Role implementation
./scripts/agents.ps1 smoke -Role debugging
./scripts/agents.ps1 smoke -Role documentation
```

`smoke` 기본 역할은 implementation이다. smoke도 모델 사용량을 소비하며 동일 home의 동시 smoke는 별도 잠금으로 배제한다. 가짜 Codex 테스트 통과는 실제 모델 접근 성공의 증거가 아니다. Astra high 및 반복 진단은 사용량을 더 소비할 수 있으므로 필요할 때 명시적으로 호출한다. 단순 입력·네트워크·권한 실패에 대한 자동 Astra escalation은 없다.

## 읽기 전용 Astra 진단

```powershell
./scripts/agents.ps1 diagnose -Issue 24
```

등록된 이슈와 기존 worktree가 필요하다. 진단은 `--sandbox read-only`, `-a never`로 실행되며 소스·테스트·job·커밋 변경을 허용하지 않는다. 작업 오류/단계/이전 검증 결과를 모델에 전달하고 소스·테스트를 읽어 원인·증거·회복 제안을 JSON으로 반환하도록 요청한다. 인증 파일, .env, 백업, Terraform state, 연결 문자열과 환경 전체는 읽거나 출력하지 않는다. 전용 `TEST_DATABASE_URL`은 기존 npm/Codex 자식 프로세스에 그대로 상속하며 프로세스 출력에 포함되면 로그/오류에서 가린다.

결과는 `.local/agent-workflow/diagnostics/<번호>/<시각>-<PID>/diagnostic-result.json`, 선택 모델·thread ID·분석 시점·파일/job 해시는 같은 폴더의 `diagnostic-metadata.json`, 실행 기록은 `diagnostic.log`에 저장된다. 스키마도 같은 폴더에 별도로 저장한다. 진단 잠금은 `.local/agent-workflow/diagnostics/<번호>/worker.lock`으로 기존 worker 잠금·스키마·결과와 분리된다. 같은 이슈의 진단끼리는 동시 실행을 거부하고 완료·실패 후 잠금을 해제한다. 모델 실패는 호출 1회와 실패 기록으로 종료하며 job을 재시도하거나 변경하지 않는다.

구현 워커와 동시에 실행할 수 있지만 결과는 시점 스냅샷이다. 실행 전후 Git 추적 파일 및 ignore되지 않은 파일의 내용·이름과 job JSON 해시를 비교해 변경되면 `stale=true`로 표시한다. 민감 경로는 파일 해시 읽기에서도 제외한다. 스냅샷은 원자적 파일시스템 복제가 아니므로 동시 편집이 있었거나 결과 작성 이후 편집했다면 다시 확인한다. stale 결과를 그대로 적용하거나 자동 회복하지 않는다.

이 변경은 현재 이슈 worktree에서만 구현한다. 별도 설치본/외부 root 지정/실행 중 워커 교체 경로는 도입하지 않았다. 검증 후 코디네이터가 배포·활성화를 담당하며 기존 큐·home·개인 계정 설정을 유지해야 한다. main 덮어쓰기나 자동 병합은 하지 않는다.

## #26 사용량 절감과 검증 증거

단순 정상·오류 입력 테스트만 명시적으로 `-TestComplexity simple`을 설정한다. 이때 tests 역할은 `gpt-6-luna medium`이다. 트랜잭션·동시성·복잡한 경계 테스트는 `complex`로 Sol을 유지하며, 기존 job의 미지정 분류도 Sol을 유지한다. 구현·검토·설계·진단 모델은 기존 승인 목록 그대로다. 기존 진행 중 작업을 제목·본문으로 재분류하지 않는다. 설정은 워커 종료 후 잠금 아래에서만 변경한다.

```powershell
./scripts/agents.ps1 enqueue -Issue 26 -TestComplexity complex -RequireDatabase true
# 브라우저가 완료 기준에 필수인 작업에만 -RequireBrowser true를 추가한다.
./scripts/agents.ps1 configure -Issue 26 -TestComplexity simple
./scripts/agents.ps1 handoff-tests -Issue 26
```

`handoff-tests`는 idle blocked job을 테스트 단계로 되돌린다. 기존 보호 SHA와 결과를 보존하고 테스트 역할이 정상 완료한 뒤 새 해시를 기록한다. 구현 에이전트가 해시를 수동 교체하거나 assertion을 약화해 우회하지 않는다. 테스트 추가·수정이 필요하면 주 대화에서 원인을 확인하고 이 경로를 사용한다.

모델 호출 전에 Node/npm/Git/Codex 버전, worker 잠금 소유권, worktree 브랜치/base, package/lockfile/node_modules 준비 상태를 검사한다. 필수 DB는 전달된 전용 `TEST_DATABASE_URL`만 사용하여 연결과 public의 다섯 앱 테이블·필수 컬럼을 조회한다. DB 생성·migration·credentials/.env 읽기를 수행하지 않는다. 문서 작업에는 명시하지 않은 DB·브라우저를 요구하지 않는다. `validationRequirements: { database: true, browser: true }`를 job에 저장하며 CLI의 `--require-database true|false`, `--require-browser true|false`로도 지정한다. 브라우저 필수 작업은 ignored 로컬 config에 `browserExecutable`과 문자열 배열 `browserCheckArgs`를 설정해야 한다. 버전 검사만으로 브라우저 완료 검증을 주장하지 않으며 호스트가 해당 검증 명령을 별도로 실행한다.

준비 실패는 `preflight` 구조와 `failureKind=environment`로 기록하며 해당 역할 모델은 0회 호출한다. 사전 검사는 설치를 수행하지 않고 권한을 바꾸지 않는다. 사전 검사 통과는 모델 샌드박스 내부의 도구 권한이나 완료 검증 통과를 보장하지 않는다. 호스트가 `npm run check`, staged/unstaged diff 검사, 명시된 DB·브라우저 검증을 수행하며 모델의 성공 보고로 대신하지 않는다. 문서 전용은 앱 테스트를 새로 만들지 않는다. 기존 전체 호스트 검사도 유지하며 필수 검사를 생략하지 않는다.

각 역할에는 원본 완료 기준과 base SHA, 변경 경로, 필요한 최근 결과 요약, 미해결 review 지적, CI 실패 조건을 전달한다. 해시 사전·전체 과거 결과·긴 CI 로그·진단 이력은 프롬프트에서 생략하고 안전한 `.local/agent-workflow/jobs/<번호>/job.json` 경로를 제공한다. handoff JSON은 최대 18,000자, 원본 이슈 JSON은 32,000자, 결과 summary는 4,000자이다. 원본 완료 기준과 중요한 실패·회귀 조건은 조용히 자르지 않는다. 중요 요약이나 CI 실패 조건이 한도를 넘으면 호출 전에 중단하고 해당 상세 경로를 안내한다. 전체 결과와 이전 역할 결과는 job/results 및 resultHistory에 보존하며 상세 프로세스·CI 출력은 별도 로그에 남긴다. 문자 수를 토큰 수라고 부르지 않는다.

재검토는 직전 검토의 파일 SHA 스냅샷과 비교한 delta 및 이전 미해결 지적을 우선 확인한다. 최초 검토, 기존 범위 밖 파일 변경, 보안·인프라·migration·실행기·패키지 변경, 요구사항/base/branch 변경 및 highRiskReview는 전체 검토를 수행한다. delta 검토도 전체 최종 diff와 ALL acceptance criteria 확인을 요구한다. 검토 도중 파일이 바뀌면 승인을 재사용하지 않는다. 독립 review는 구현 thread와 분리한다.

환경 복구 retry는 branch/base/요구사항/분류/원본 파일 fingerprint/보호 테스트 SHA가 승인된 검토 증거와 동일할 때만 verification부터 이어간다. delivery/ci 환경 복구도 verification을 거쳐 현재 검사 명령·환경 key를 확인한 뒤 일치한 성공 결과만 재사용한다. 그 외에는 기존 구현·독립 검토 경로를 거친다. review/CI 반려 수의 상한은 환경 retry로 초기화하지 않는다. 동일 호스트 검사 결과는 해당 소스 증거, 실행 명령, Node/도구 버전, 의존성 메타데이터, 전용 DB 환경 등 검사 key가 같고 이전 검사가 성공했을 때 재사용한다. 필수 DB 연결·스키마는 재사용 전에도 확인한다. 실패·환경·명령·파일 변경은 이전 결과를 무효화한다. 게시 직전 fingerprint 검사와 테스트 SHA 검사는 유지한다. CI 대기는 결정적 스크립트로 처리하며 모델을 추가 호출하지 않는다.

review 사전검사의 환경 실패도 완료된 구현 증거가 동일하면 review부터 재개한다. 구현 증거가 없는 기존 job이나 파일·요구사항·보호 테스트 등이 바뀐 job은 구현부터 다시 진행한다. npm 하위 도구의 EACCES/EPERM 및 Access is denied/Permission denied는 환경 실패로 구분한다. retry가 현재 오류를 초기화하기 전에 실패 단계·종류·내용을 `latestFailure`와 `resultHistory`에 보존하고 다음 역할 handoff에 전달한다. 실패 요약이 4,000자 한도를 넘으면 조용히 자르지 않고 상세 경로와 함께 retry를 중단한다. 하위 명령 실패는 stderr와 stdout 각각의 시작·끝을 보존하고, 생략한 구간은 truncation 표시와 전체 가림 처리 로그 경로로 안내한다. 로그를 지정하지 않은 호출은 전체 출력 미보관 사실을 명시한다.

로컬 `codex exec resume --help`에서 resume 명령은 확인했지만 해당 help에는 새 실행과 동일한 `--sandbox`/`--cd` 옵션이 표시되지 않았다. 저장된 thread의 모델·effort·권한·cwd 재결합을 이 변경에서 검증하지 않았으므로 resume은 사용하지 않고 짧은 handoff로 새 역할 실행을 유지한다. 자동 fallback이나 `--last`는 사용하지 않는다. 원본 thread ID는 감사용으로 보존한다.

`status`는 명시 분류, 필수 검증 설정, 최근 preflight, failureKind와 기존 역할별 모델/effort/thread를 표시한다. job의 `usage.jsonl`은 실제 모델 호출, CLI가 보고한 input/cached input/output 토큰, 환경 중단, 모델 실패, 수정 재시도와 수동 retry 사건을 누적한다. 실패 전에 보고한 usage도 stream에서 보존한다. 미제공 사용량은 추정하지 않으며 계정 전체 요금·구독 사용량 절감률로 환산하지 않는다. 진단 metadata에도 제공된 usage를 보존한다. 테스트 명령 실행·결과 집계·PR 템플릿·게시·CI 대기에 새 모델 호출을 추가하지 않았다.

`npm run test:agents`는 새 optimization 경계 테스트를 포함하며 기존 `npm run check`와 CI 경로로 실행한다. #26은 선행 #24/PR #25의 실행기와 진단 코드를 재사용한다. #25가 미병합이면 새 PR diff에 선행 변경이 보일 수 있으므로 사용자가 #25를 먼저 검토·병합해야 한다. 로컬 활성화는 독립 검토 후 코디네이터가 기존 큐/home/runtime/DB를 보존하여 수행한다.
