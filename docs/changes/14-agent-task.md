# #14 chore: separate the ghp command and connect the project's personal Codex profile

- Issue: https://github.com/sirloinbh/workout-memo/issues/14
- Branch: feat/14-agent-task

## Changes and verification

The work agent records the real changes and verification results.

## Test step (before implementation)

- Base SHA: `6835a02ea9dd35dd84067a08d84aad27d838a4ea`.
- Read `AGENTS.md`, `skills/workout-implementation/SKILL.md`, and `skills/workout-testing/SKILL.md`, and reused the existing issue and branch. Only the tests and this record were changed; no implementation, installed copy, login, commit, or remote work was done.
- Changed the existing expectations in `scripts/test/project-github-auth.test.mjs` to the #14 standard of separating company `gh` from personal `ghp`, and extended it to 14 tests in total.
- All authentication checks use only a temporary `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, a fake `gh.cmd` / `code.cmd`, and synthetic tokens. No real authentication store or installed copy is used. The fake gh checks, on an account query, that `sirloinbh` is named and that the inherited token is removed.
- Verification scope: the personal `gh-personal` settings; using the company gh and the personal ghp together in a terminal without a profile, and restoring the environment after the call; the initialized CODEX_HOME; the VS Code settings; the launcher's company GitHub / personal Codex combination; running without a personal login and the code exit code; preserving other projects' environment (including the existing project settings path and a path with spaces); passing through wrapper arguments, exit codes, and stdin; rejecting when the personal account is absent; restoring the parent environment after success, command failure, and account query failure.

### Real commands and results

- `npx prettier --write scripts/test/project-github-auth.test.mjs`: succeeded.
- `node --test scripts/test/project-github-auth.test.mjs`: exit code 1, of 14 tests 7 pass / 7 fail / 0 skip. All the failures below are differences from the requirements that were expected before implementation.
  - The personal wrapper settings are still in `gh-workout-memo` under LOCALAPPDATA, which differs from the expected `.config/gh-personal` under USERPROFILE.
  - The project launcher still injects the personal GitHub settings and token into the code process.
  - The terminal initialization still defines a gh function and does not provide ghp.
  - The VS Code terminal settings still use the personal GitHub path.
  - When the personal account query fails, the launcher does not call code, so it returns 1 instead of the code exit code 17.
  - When another project is opened, it erases the existing `gh-workout-memo` environment value, which differs from the preservation standard.
  - The ghp argument / exit code / environment restore checks fail because ghp is not defined.
- The existing wrapper's exit code, stdin pass-through, environment restoration after success and failure, rejection when the personal account is absent, and general other-project environment preservation passed.
- `npm run check`: exit code 0. Format, lint, frontend/backend type checks, backend tests 4 pass (including the dedicated test DB integration check, skip 0), local worker tests 34 pass, and frontend/backend builds passed. This command does not currently include the authentication test file, so the 7 failures above, run separately, are not replaced by the full check's success.

### Handover to the implementation step

- Keep the failing expectations, and re-run the authentication test and the full check after implementation.
- The CODEX_HOME explanation in the docs, the authentication principle in AGENTS.md, and the change record that replaces #12/#13 have to be written and reviewed in the implementation step. This step changed only the test file and this work record.

## Implementation step

- Applied `workout-implementation` and `workout-testing`, and reused the existing issue, branch, and tests. The SHA-256 of the test file matches the handed-over value `be0863d5fc92808db1f2d6440aea9bbac0f59275d2f27f483c2a4fcb1bbe0094`, and the assertions and skips were not changed. No earlier review finding was handed over.
- `project-terminal.ps1` does not redefine the company `gh` and provides only the personal `ghp`. It initializes the company settings path, the removal of inherited tokens, and the personal CODEX_HOME, so older VS Code settings use the same environment after the installed copy is applied.
- `gh-project.ps1` uses `.config/gh-personal` under USERPROFILE. The logic for the explicit sirloinbh lookup, blocking inherited tokens, restoring the parent environment, and passing through arguments, exit codes, and stdin was kept.
- The VS Code settings and the launcher use the company GitHub / personal Codex combination. Removed the launcher's personal token lookup and process-wide injection, the deletion of other projects' existing GitHub settings, and the automatic creation of the Codex settings file.
- Recorded in AGENTS.md and the authentication doc the principle of preferring ghp and the non-interactive wrapper, and the selection of the existing personal Codex home. Applied the `openai-docs` skill to look up and read the CODEX_HOME explanation in the official configuration docs, and linked the source in the authentication doc. It does not assume that a running company-account conversation switches automatically, and states that the ChatGPT app needs a separate account selection.
- Recorded in `docs/changes/14-personal-tools.md` the change that replaces #12 and PR #13, and the follow-up install work.

### Real commands and results

- `node --test scripts/test/project-github-auth.test.mjs`: exit code 0, 14 pass / 0 fail / 0 skip. Using only a temporary environment and a fake gh/code, the full handed-over behavior verification passed, including the company gh / personal ghp separation and restoration after failure.
- `npx prettier --write AGENTS.md .vscode/settings.json docs/project-github-auth.md docs/changes/14-personal-tools.md`: exit code 0, all passed with no format changes.
- `npm run check`: exit code 0. Format, lint, frontend/backend type checks, backend 4 pass / 0 skip (including the provided dedicated test DB integration check), local worker 34 pass / 0 skip, and frontend/backend builds passed. The authentication test is not included in this command, so it was verified separately with the command above. The DB connection value was not looked up or printed.
- Checked the read-only Git diff and the test file hash. Git showed a warning about access to the global ignore path, but the worktree status and diff checks completed. The global settings were not changed.
- After recording the results, `npx prettier --check docs/changes/14-agent-task.md docs/changes/14-personal-tools.md` and `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/14 diff --check`: both exit code 0.

### Handover and limits

- The changes are left uncommitted in this worktree. Issue creation, branch switching, commit, push, PR, approval, merge, and running extra agents were not done.
- The real authentication store, installed copy, and desktop launcher were not accessed or changed. Updating the installed copy and the launcher, and checking the real accounts, have to be done in the main conversation. The coordinator reflects the replacement relationship with #12/#13 in the independent review and the PR description.

## CI failure repair

- The supplied windows-auth log shows the first test finishing after 20,362ms with status null; the other 13 tests passed. This matches the original 20,000ms subprocess timeout and suggests initial Windows process startup exceeded the allowance. The original log did not include the spawn error, so the exact cause of the delay remains unconfirmed.
- All subprocesses now use a shared, bounded 60,000ms timeout. All existing assertions, skip conditions and 14 scenarios remain intact; no retries were added.
- Added assert.ifError(r.error) before every subprocess status assertion to expose errors such as ETIMEDOUT directly. Authentication rejection must also be a real command result rather than a spawn error. Product scripts and installed copies are unchanged.

### Actual commands and results

- Before repair: `node --test scripts/test/project-github-auth.test.mjs`: exit 0, 14 pass / 0 fail / 0 skip, about 5.2 seconds. The CI timeout did not reproduce locally.
- After repair: `node --test scripts/test/project-github-auth.test.mjs`: exit 0, 14 pass / 0 fail / 0 skip, about 6.2 seconds, using temporary environments and fake gh/code only.
- `npm run check`: exit 0. Formatting, lint, type checks, backend 4 pass / 0 skip (including the provided dedicated test DB integration test), worker 34 pass / 0 skip, and frontend/backend builds passed. Authentication tests were run separately.
- `npx prettier --check scripts/test/project-github-auth.test.mjs docs/changes/14-agent-task.md docs/changes/14-personal-tools.md`: exit 0.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/14 diff --check`: exit 0.
- Changes remain uncommitted. No remote operations, installed-copy updates or additional agents were used. The coordinator must review and deliver the changes, then rerun Windows CI; remote CI success has not yet been verified.

## Test step re-check (after the CI failure)

- At the start, the existing uncommitted changes already had the test's 60-second timeout, the subprocess error diagnostics, and the CI fix record above. Those changes and the existing 14 behavior checks were preserved, and no implementation file was changed in this step.
- The first check failure in the supplied CI log was `status=null` after 20,362ms, which matches the old 20,000ms timeout. The original log had no subprocess error, so the cause of the delay is not confirmed, and it was not reproduced locally. The record of the 7 failures expected before implementation is preserved in the first test step above.
- `node --test scripts/test/project-github-auth.test.mjs`: exit code 0, 14 pass / 0 fail / 0 skip, about 5.5 seconds. Only a temporary environment and a fake gh/code were used.
- `npm run check`: exit code 0. Format, lint, type checks, backend 3 pass / 1 skip, worker 34 pass / 0 skip, and frontend/backend builds passed. The dedicated `TEST_DATABASE_URL` was not provided in this run, so the DB integration check was skipped and is not reported as DB verification complete. The authentication test was verified with a separate command.
- Re-running the remote CI and confirming its success is the coordinator's follow-up work. This step did no commit, remote work, installed copy change, or extra agent run.
- `npx prettier --check scripts/test/project-github-auth.test.mjs docs/changes/14-agent-task.md docs/changes/14-personal-tools.md` and `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/14 diff --check`: both exit code 0.

## Implementation step re-check (after the CI failure)

- Reviewed and kept the existing uncommitted CI fix. All subprocesses have the 60-second timeout and `assert.ifError(r.error)`, and the existing behavior assertions and the 14 scenarios are unchanged. No further product code change was needed. The earlier independent review had no change requests.
- Re-checked the company gh / personal ghp separation, the wrapper's personal settings and parent environment restoration, and the launcher and VS Code settings. The installed copy and real authentication information were not accessed.
- `node --test scripts/test/project-github-auth.test.mjs`: exit code 0, 14 pass / 0 fail / 0 skip, about 5.5 seconds. Only a temporary environment and a fake gh/code were used, and the 20-second delay on the remote was not reproduced locally.
- `npm run check`: exit code 0. Format, lint, type checks, backend 3 pass / 1 skip, worker 34 pass / 0 skip, and frontend/backend builds passed. The dedicated `TEST_DATABASE_URL` was not provided, so the DB integration check was skipped. This change only adjusts the authentication test's timeout and diagnostics, so it does not require DB verification.
- The changes are left uncommitted. Commit, push, PR, approval, merge, and extra agent runs were not done. The coordinator's independent review and the Windows CI re-run remain, and it is not reported as remote CI passing.
- After updating the record, `npx prettier --check scripts/test/project-github-auth.test.mjs docs/changes/14-agent-task.md docs/changes/14-personal-tools.md` and `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/14 diff --check`: both exit code 0.
