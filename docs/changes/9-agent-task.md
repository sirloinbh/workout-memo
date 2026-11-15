# #9 docs: local agent requirements issue template

- Issue: https://github.com/sirloinbh/workout-memo/issues/9
- Branch: feat/9-agent-task

## Changes and verification

Added `docs/agent-issue-template.md`. The step-by-step records below hold the real changes and verification results.

## Test step: docs verification before implementation

- Purpose: verify the docs deliverable against the done criteria of issue #9. This is docs-only work, so no app tests or implementation files were added or changed.
- Instructions applied: `AGENTS.md`, `skills/workout-implementation/SKILL.md`, `skills/workout-testing/SKILL.md`. Issue, branch, commit, and PR work is left to the coordinator.
- Real commands: `Test-Path docs/agent-issue-template.md` gave `False`; `Test-Path docs/changes/9-agent-task.md` gave `True`.
- The real check command before implementation:

  ```powershell
  if (Test-Path docs/agent-issue-template.md) { Write-Output 'PASS: issue template exists'; exit 0 } else { Write-Output 'FAIL (expected before implementation): docs/agent-issue-template.md is missing'; exit 1 }
  ```

  Result: **expected failure**, exit code 1. The template doc does not exist yet, so the verification of its body and internal links has to be done after implementation. This is not a reproduction of an app test failure.

- Real command: `git status --short` failed with `fatal: detected dubious ownership`. The repository owner differs from the sandbox user, so checking the Git status and the change scope was limited. `safe.directory` and the global settings were not changed.
- `npm run check` was not run in this step. By the issue, the host does the regression check, and this step covers only the docs deliverable verification. The DB was not accessed.
- No skill file was changed, so there is no changed skill for `quick_validate.py` to check.
- Self-verification of this record: read `docs/changes/9-agent-task.md` with `Get-Content -Raw -Encoding UTF8` and used `.Contains()` to confirm the presence of the test step heading, the expected failure, exit code 1, the follow-up done criteria heading, and `npm run check`. Result: PASS, exit code 0.

### Done criteria to check after implementation

- `docs/agent-issue-template.md` has a copyable example of a GitHub issue body in Korean.
- It includes examples of the user requirement, the scope, the `완료 기준` (done criteria), the verification method, the out-of-scope items, and handling of requirement changes.
- The done criteria are written as observable results, such as a file being created or displayed.
- It does not invent an issue number or claim the implementation of a specific real feature.
- It explains the PC-local work, the per-step verification, and the user's final PR merge.
- Check relative path links against the doc's location, and review that the link target files and any needed anchors exist.
- Add the real changes and the final verification results to this record. The coordinator confirms that the final change scope is limited to docs and records the host's `npm run check` result separately.

## Implementation step: write the requirements issue body example

- Change: added a copyable Korean GitHub issue body to `docs/agent-issue-template.md`. It includes examples of the user requirement, the scope, done criteria in checklist form, the verification method, the out-of-scope items, and handling of requirement changes.
- The done criteria are written as observable results such as a doc file, a title, the displayed working directory, and a README link. The paths and real issue numbers in the example are left as placeholders to replace, and it does not claim that any real feature is implemented.
- It explains the flow in which the test, implementation, verification, and review run in the PC-local working tree, the coordinator handles the commit and PR, and the user does the final merge. It tells the reader to distinguish verification failures and non-runs from success.
- The result handed over from the earlier step is the expected failure from the doc not existing before implementation. No separate review finding was handed over. Adding the doc resolved the absence.
- App code, settings, existing tests, and assertions were not changed. This is docs-only work, so no new app tests were added. No skill changed either, so there is no changed skill for `quick_validate.py` to check.

### Real verification commands and results

The working directory is the root of the issue-specific working tree. The following PowerShell check was run. The Korean strings in the required list are the section headings of the Korean template, which the check matches on, so they are kept as they were: `사용자 요구` (user requirement), `범위` (scope), `완료 기준` (done criteria), `검증 방법` (verification method), `제외 범위` (out of scope), `요구사항 변경 처리` (handling requirement changes), `로컬 작업 및 인계` (local work and handover), `사용자가 PR` (the user ... PR), and `<실제 이슈번호>` (real issue number).

`````powershell
$ErrorActionPreference = 'Stop'
$docPath = Join-Path (Get-Location) 'docs/agent-issue-template.md'
$body = Get-Content -Raw -Encoding UTF8 $docPath
$required = @('## 사용자 요구', '## 범위', '## 완료 기준', '## 검증 방법', '## 제외 범위', '## 요구사항 변경 처리', '## 로컬 작업 및 인계', 'PC 로컬', '사용자가 PR', 'npm run check', 'docs/changes/<실제 이슈번호>-agent-task.md')
foreach ($item in $required) { if (-not $body.Contains($item)) { throw "Missing required content: $item" } }
if ($body -notmatch '(?s)````markdown\r?\n.*## 완료 기준.*\r?\n````') { throw 'Copyable issue body is missing' }
$links = [regex]::Matches($body, '\[[^\]]+\]\(([^)]+)\)')
foreach ($link in $links) { $target = Join-Path (Split-Path $docPath) $link.Groups[1].Value; if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Broken link: $target" } }
Write-Output "PASS: required content, copyable body, $($links.Count) relative file links"
`````

- Result: PASS, exit code 0. Confirmed the required content, the copyable body, and 4 relative file links. No anchors are used in the links. Reviewed the body and confirmed the observable done criteria, the change request example, and the explanation of the user's final merge.
- `npm run check`: PASS, exit code 0. The frontend TypeScript and Vite build and the backend TypeScript build succeeded. The 4 existing backend tests passed, 0 failed, 0 skipped. 3 unit tests and 1 PostgreSQL integration test (CRUD, date range, rollback, goal judgment, cascade delete) ran. The existing integration test uses only the provided `TEST_DATABASE_URL`, and the connection value was not read, printed, or recorded.
- `Get-Content -Encoding UTF8 backend/test/*.test.ts`: confirmed the existing verification content and the use of the dedicated DB environment variable. The tests were not changed.
- `git status --short`: FAIL, exit code 128 (from Git itself). `fatal: detected dubious ownership` occurred because the repository owner differs from the sandbox user. The `safe.directory` setting and permissions were not changed. The final diff and change scope verification through Git was blocked by the permission limit.

### Handover and limits

- Implementation, docs verification, and the existing regression check are done. The files this agent edited are two: the template and this work record.
- The coordinator must check the Git status and the final diff on a host with normal permissions and review that the change scope is limited to docs. The automatic review and final approval have not been done yet.
- As the user instructed, issue creation, branch switching, staging, commit, push, PR creation, approval, and merge, and running extra agents were not done. The changes are handed over uncommitted.

## Implementation step re-check (2026-10-14)

- Read and preserved the template already written in the current working tree. Confirmed the copyable Korean body, the 7 required headings, 5 observable done criteria, the change handling example, the PC-local per-step verification, and the user's final PR merge. There is no unissued issue number or claim that a real feature is implemented. No separate review finding was handed over.
- Read the template with Node's `fs.readFileSync(file, 'utf8')` and used `node:assert/strict` to check the code block, the required headings and content, 5 checklist items, and that the 4 relative links point to real files. The run passed a PowerShell here-string to `node`. The first run failed an assertion (exit code 1) because the check strings were converted by the Korean pipe encoding. After setting `$OutputEncoding = [System.Text.UTF8Encoding]::new($false)`, the same assertions were re-run and passed (exit code 0). Output: `PASS: copyable Korean issue body, 7 sections, 5 acceptance criteria, 4 relative links`.
- `npm run check`: PASS, exit code 0. The frontend TypeScript and Vite and the backend TypeScript builds succeeded. The 4 existing tests passed, 0 failed, 0 skipped. The PostgreSQL integration test also passed. The connection value was not read or printed.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/9 status --short`: PASS, exit code 0. The untracked files are the template and this work record. There was a warning about read permission for the Git ignore in the user's home, but the status query succeeded. The global settings were not changed. The earlier record's Git ownership block was resolved with the specified command.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/9 diff --check`: PASS, exit code 0. The two docs are untracked, so they are not covered by this diff check. The doc content and links were confirmed with the Node check and by reading directly.
- The first Node here-string command for adding to the work record failed to parse in PowerShell because of a nested terminator, and wrote no file. This re-check record was added with `apply_patch`.
- App code, settings, existing tests, assertions, and skills were not changed. It is docs-only, so there is no app test to add and no changed skill for `quick_validate.py`. Without any issue, branch, stage, commit, push, PR, approval, merge, or extra agent work, the two uncommitted docs are handed to the coordinator's final review.
