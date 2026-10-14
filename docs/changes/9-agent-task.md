# #9 docs: 로컬 에이전트 요구사항 이슈 템플릿

- 이슈: https://github.com/sirloinbh/workout-memo/issues/9
- 브랜치: feat/9-agent-task

## 변경 및 검증

`docs/agent-issue-template.md`를 추가했다. 아래 단계별 기록에 실제 변경·검증 결과를 남긴다.

## 테스트 단계: 구현 전 문서 검증

- 목적: 이슈 #9의 완료 기준에 맞춰 문서 산출물을 검증한다. 문서 전용 작업이므로 앱 테스트와 구현 파일은 추가·수정하지 않았다.
- 적용 지침: `AGENTS.md`, `skills/workout-implementation/SKILL.md`, `skills/workout-testing/SKILL.md`. 이슈·브랜치·커밋·PR 작업은 코디네이터에게 맡긴다.
- 실제 명령: `Test-Path docs/agent-issue-template.md` → `False`; `Test-Path docs/changes/9-agent-task.md` → `True`.
- 실제 구현 전 검사 명령:

  ```powershell
  if (Test-Path docs/agent-issue-template.md) { Write-Output 'PASS: issue template exists'; exit 0 } else { Write-Output 'FAIL (expected before implementation): docs/agent-issue-template.md is missing'; exit 1 }
  ```

  결과: **예상 실패**, 종료 코드 1. 템플릿 문서가 아직 없으므로 본문·내부 링크 검증은 구현 후 수행해야 한다. 앱 테스트 실패를 재현한 결과가 아니다.
- 실제 명령: `git status --short` → `fatal: detected dubious ownership`로 실패. 저장소 소유자와 샌드박스 실행 사용자가 달라 Git 상태·변경 범위 확인이 제한되었다. `safe.directory`나 전역 설정을 변경하지 않았다.
- `npm run check`는 이 단계에서 실행하지 않았다. 이슈에 따라 호스트가 회귀 검사하며, 이 단계는 문서 산출물 검증만 담당한다. DB에 접근하지 않았다.
- 스킬 파일을 변경하지 않았으므로 `quick_validate.py`의 변경 스킬 검증 대상은 없다.
- 기록 자체 검증: `Get-Content -Raw -Encoding UTF8 docs/changes/9-agent-task.md`로 읽고 `.Contains()`로 테스트 단계 제목, 예상 실패, 종료 코드 1, 후속 완료 기준 제목, `npm run check`의 존재를 확인했다. 결과: PASS, 종료 코드 0.

### 구현 후 확인할 완료 기준

- `docs/agent-issue-template.md`에 한국어로 복사 가능한 GitHub 이슈 본문 예시가 있다.
- 사용자 요구, 범위, `완료 기준`, 검증 방법, 제외 범위, 요구사항 변경 처리 예시를 포함한다.
- 완료 기준은 파일 생성·표시 결과 등 관찰 가능한 결과로 작성한다.
- 예시의 이슈 번호나 특정 실제 기능의 구현 완료를 지어내지 않는다.
- PC 로컬 작업과 단계별 검증, 사용자의 최종 PR 병합을 설명한다.
- 상대 경로 링크를 문서 위치 기준으로 확인하고, 링크 대상 파일 및 필요한 앵커가 존재하는지 검토한다.
- 실제 변경과 최종 검증 결과를 이 기록에 추가한다. 최종 변경 범위가 문서로 한정되는지 코디네이터가 확인하고 호스트의 `npm run check` 결과를 별도로 기록한다.

## 구현 단계: 요구사항 이슈 본문 예시 작성

- 변경: `docs/agent-issue-template.md`에 복사 가능한 한국어 GitHub 이슈 본문을 추가했다. 사용자 요구, 범위, 체크리스트 형태의 완료 기준, 검증 방법, 제외 범위, 요구사항 변경 처리 예시를 포함한다.
- 완료 기준은 문서 파일·제목·실행 디렉터리 표시·README 링크처럼 관찰 가능한 결과로 작성했다. 예시의 경로와 실제 이슈 번호는 교체할 자리표시자로 두었고, 실제 기능의 구현 완료를 주장하지 않는다.
- PC 로컬 작업 트리에서 테스트·구현·검증·리뷰를 거쳐 코디네이터가 커밋·PR을 담당하고 사용자가 최종 병합하는 흐름을 설명했다. 검증 실패와 미실행은 성공과 구분하도록 안내했다.
- 전달된 이전 단계 결과는 구현 전 문서 부재에 따른 예상 실패다. 별도 리뷰 지적은 전달되지 않았다. 문서를 추가해 부재를 해소했다.
- 앱 코드·설정·기존 테스트·assertion은 수정하지 않았다. 문서 전용 작업이므로 새 앱 테스트를 추가하지 않았다. 스킬 변경도 없어 `quick_validate.py`의 변경 스킬 검증 대상은 없다.

### 실제 검증 명령과 결과

작업 디렉터리는 이슈 전용 작업 트리 루트다. 다음 PowerShell 검사를 실행했다.

```powershell
$ErrorActionPreference = 'Stop'
$docPath = Join-Path (Get-Location) 'docs/agent-issue-template.md'
$body = Get-Content -Raw -Encoding UTF8 $docPath
$required = @('## 사용자 요구', '## 범위', '## 완료 기준', '## 검증 방법', '## 제외 범위', '## 요구사항 변경 처리', '## 로컬 작업 및 인계', 'PC 로컬', '사용자가 PR', 'npm run check', 'docs/changes/<실제 이슈번호>-agent-task.md')
foreach ($item in $required) { if (-not $body.Contains($item)) { throw "Missing required content: $item" } }
if ($body -notmatch '(?s)````markdown\r?\n.*## 완료 기준.*\r?\n````') { throw 'Copyable issue body is missing' }
$links = [regex]::Matches($body, '\[[^\]]+\]\(([^)]+)\)')
foreach ($link in $links) { $target = Join-Path (Split-Path $docPath) $link.Groups[1].Value; if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Broken link: $target" } }
Write-Output "PASS: required content, copyable body, $($links.Count) relative file links"
```

- 결과: PASS, 종료 코드 0。필수 내용·복사 가능한 본문·상대 파일 링크 4개를 확인했다. 링크에 앵커는 사용하지 않았다. 본문을 검토해 관찰 가능한 완료 기준, 변경 요청 예시, 사용자의 최종 병합 설명을 확인했다.
- `npm run check`: PASS, 종료 코드 0. frontend TypeScript·Vite 빌드와 backend TypeScript 빌드 성공. 기존 backend 테스트 4개 통과, 실패 0, skip 0. 단위 테스트 3개 및 PostgreSQL CRUD·날짜 범위·롤백·목표 판정·연쇄 삭제 통합 테스트 1개가 실행됐다. 기존 통합 테스트는 제공된 `TEST_DATABASE_URL`만 사용하며 연결값은 열람·출력·기록하지 않았다.
- `Get-Content -Encoding UTF8 backend/test/*.test.ts`: 기존 검증 내용과 전용 DB 환경변수 사용을 확인했다. 테스트는 변경하지 않았다.
- `git status --short`: FAIL, 종료 코드 128(Git 자체). 저장소 소유자와 샌드박스 실행 사용자가 달라 `fatal: detected dubious ownership`가 발생했다. `safe.directory` 설정이나 권한을 변경하지 않았다. Git을 통한 최종 diff·변경 범위 검증은 권한 제한으로 차단됐다.

### 인계와 제한

- 구현·문서 검증·기존 회귀 검사는 완료했다. 이 에이전트가 편집한 파일은 템플릿과 이 작업 기록 두 개다.
- 코디네이터는 정상 권한의 호스트에서 Git 상태와 최종 diff를 확인해 변경 범위가 문서로 한정되는지 검토해야 한다. 자동 리뷰와 최종 승인은 아직 수행하지 않았다.
- 사용자 지시에 따라 이슈 생성, 브랜치 전환, stage, 커밋, 푸시, PR 생성·승인·병합과 추가 에이전트 실행은 수행하지 않았다. 변경은 커밋하지 않은 상태로 인계한다.

## 구현 단계 재확인 (2026-10-14)

- 현재 작업 트리에 이미 작성된 템플릿을 읽고 보존했다. 복사 가능한 한국어 본문, 필수 제목 7개, 관찰 가능한 완료 기준 5개, 요구사항 변경 처리 예시, PC 로컬 단계별 검증과 사용자의 최종 PR 병합을 확인했다. 미발급 이슈 번호나 실제 기능 구현 완료 주장은 없다. 별도 리뷰 지적은 전달되지 않았다.
- Node의 `fs.readFileSync(file, 'utf8')`로 템플릿을 읽고 `node:assert/strict`로 코드 블록, 필수 제목·내용, 체크리스트 5개 및 상대 링크 4개의 실제 파일 존재를 검사했다. 실행은 PowerShell here-string을 `node`에 전달했다. 최초 실행은 한글 파이프 인코딩으로 검사 문자열이 변환되어 assertion 실패(종료 코드 1)했다. `$OutputEncoding = [System.Text.UTF8Encoding]::new($false)`를 설정한 뒤 같은 assertion으로 재실행해 PASS(종료 코드 0)했다. 출력: `PASS: copyable Korean issue body, 7 sections, 5 acceptance criteria, 4 relative links`.
- `npm run check`: PASS, 종료 코드 0. frontend TypeScript·Vite 및 backend TypeScript 빌드 성공. 기존 테스트 4개 통과, 실패 0, skip 0. PostgreSQL 통합 테스트도 통과했다. 연결값은 열람·출력하지 않았다.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/9 status --short`: PASS, 종료 코드 0. 미추적 파일은 템플릿과 이 작업 기록 두 개다. 사용자 홈의 Git ignore 읽기 권한 경고가 있었지만 상태 조회는 성공했다. 전역 설정은 변경하지 않았다. 이전 기록의 Git 소유권 차단은 지정 명령으로 해소됐다.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/9 diff --check`: PASS, 종료 코드 0. 두 문서는 미추적 상태이므로 이 명령의 diff 검사 대상에는 포함되지 않는다. 문서 내용과 링크는 Node 검사 및 직접 읽기로 확인했다.
- 작업 기록 추가를 위한 첫 Node here-string 명령은 중첩된 종료 구문으로 PowerShell 파싱에 실패했고 파일을 쓰지 않았다. `apply_patch`로 이 재확인 기록을 추가했다.
- 앱 코드·설정·기존 테스트·assertion 및 스킬은 수정하지 않았다. 문서 전용이므로 앱 테스트 추가 및 변경 스킬용 `quick_validate.py` 실행 대상은 없다. 이슈·브랜치·stage·커밋·푸시·PR·승인·병합·추가 에이전트 작업 없이, 미커밋 문서 두 개를 코디네이터의 최종 리뷰로 인계한다.
