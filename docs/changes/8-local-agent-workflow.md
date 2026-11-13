# #8 Local multi-agent work automation

- Issue: https://github.com/sirloinbh/workout-memo/issues/8
- Branch: feat/8-local-agent-workflow

## Work commit: feat: 로컬 에이전트 개발 워커 구축 (#8) (build the local agent development worker)

The user asked for a system in which they keep discussing requirements in the main conversation, while a background worker on the PC handles confirmed issues in this order: test, implementation, independent review, real checks, then commit, push, PR, and CI check.

## Changes

- Without adding dependencies, implemented with Node scripts an issue queue, atomic state saving, a PID lock, resuming after an interruption, and a requirements snapshot. When an issue is queued, a main-based branch and a worktree are prepared for it.
- Separated the test, implementation, and review steps into separate Codex runs, and hand over JSON results and files. The review is read-only, and the run stops if the implementer changes the tests of the test owner.
- The host runs the real check, and the file fingerprint is linked to the publish step. The commit intent is saved beforehand so an interruption right after a commit can be identified. Review and CI fixes are limited to a second failure, and the PR stays draft until CI completes. The user-only merge rule is kept.
- Added PowerShell commands for start, stop, status, register, retry, requirement update, and cancel, plus an operations doc and AGENTS instructions. The tests are connected to npm run test:agents, npm run check, and Linux/Windows CI.
- Fixed the problems found by a separate review agent: changes after verification, an interrupted commit, a lock reclaim race, the CI timer, staging verification, and a queue lookup race during registration.

## Actual verification

- The final npm run check passed: 4 app tests including the app build and DB integration, and 34 automation tests, all pass, skip 0. The automation tests verify state transitions, issue scope and change detection, review and CI retries, stopping the publish when a check fails, locks, storage, timeouts, literal argument pass-through, fingerprints, lookups during queue registration, cancel, and resuming after an interruption.
- With the pinned local Node 24.21.0 and npm 11.19.0, the app build and 4 tests (pass 4, skip 0) passed. The existing dedicated workout_test_4 DB was used.
- scripts/agents.ps1 doctor succeeded: confirmed the project GitHub account sirloinbh and origin.
- scripts/agents.ps1 smoke succeeded: confirmed a real read-only model call and the handover of the JSON Schema result file. Codex 0.144.4 on the PATH failed because of a model/cache compatibility problem, and the existing IDE's Codex 0.162.0-alpha.17.2, specified in an ignored local config, passed. The global Codex settings, authentication, and model were not changed.
- Starting the hidden worker, checking the PID lock, querying the status, stopping, and releasing the lock succeeded.
- Actually registered the setup issue #8 and confirmed that the feat/8-agent-task branch and an independent worktree were created. To avoid duplicate automatic work against the current implementation, that queue entry was cancelled, and the files and records were preserved.
- Put the real docs issue #9 in the queue and confirmed the test owner's expected failure and the implementation owner's docs writing and app check pass. It became blocked because of a Git ownership restriction, so without changing global settings, using git -c safe.directory for the working directory was added to the role instructions, and the run resumed from the implementation step.
- The Prettier check of the changed files and git diff --check passed.

## Limits

- The full run was verified with a docs task. The design of tests for real features and the implementation quality are checked in each issue's done criteria and the independent review.
- No startup program or service was installed. A start is needed after a reboot, and PC sleep, network, usage limits, and sandbox permission problems are checked through the blocked state or the worker error log.
- Requirements are handed over explicitly as issues. Automatic collection from chat and unattended completion notices back to chat were not implemented. When the user asks, the main agent queries the status.
- There is no screen feature or skill body change, so no separate browser test or skill validator was added.

## Work commit: docs: 실제 에이전트 실행 결과 기록 (#8) (record the real agent run result)

- The real docs issue https://github.com/sirloinbh/workout-memo/issues/9 completed test, implementation, independent review, host verification, commit, push, PR, and CI. The worker created https://github.com/sirloinbh/workout-memo/pull/11 and took it out of draft after all checks passed. The local state is done. The PR was not merged.
- The first implementation run became blocked because of a Git ownership restriction, and succeeded after the files were preserved and the run retried. Confirmed that the per-role Codex thread IDs and the verification results are saved in the local state file.
- The app verification, the Windows authentication check, and the Linux/Windows automation checks of the build PR #10 also all passed. Updating the record changes only docs, so the app tests were not repeated, and it was verified with the Prettier check of the changed docs and git diff --check.
- The worker is left running in the background waiting for the next queued task. After a reboot, run it again with start.

## Work commit: fix: 최신 개발 기준과 PR 충돌 해결 (#8) (resolve conflicts with the latest development baseline and PR)

- PR #5 was merged into main and conflicted with PR #10 in the scripts and dev dependencies of package.json. The latest origin/main was merged into the work branch, and main's pinned Node/npm, install script policy, and static check tools were preserved.
- npm run check now includes format, lint, types, app tests, agent tests, and build, in that order. The development baseline and the local worker guide in the README were kept as well.
- The command table in the development baseline doc now has the agent tests and the combined check order.
- At two lock error sites found by the new ESLint preserve-caught-error rule, the original exception is now linked as the cause. The existing lock and failure behavior tests were kept, and no separate duplicate test was added.
- npm ci and npm run check passed in the pinned Node 24.21.0 and npm 11.19.0 environment. Format, lint, types, 4 app tests, 34 automation tests, and frontend/backend builds succeeded, skip 0. DB verification used the existing dedicated workout_test_4.

## Work commit: fix: 새 main 문서와 통합 CI 포맷 정리 (#8) (clean up the format of the new main docs and the integration CI)

- After the first conflict resolution, PR #11 was also merged into main, so the branch push check succeeded, but Prettier in the PR integration check failed on two new docs.
- Merged the latest main again and formatted docs/agent-issue-template.md and docs/changes/9-agent-task.md to the existing Prettier standard. The doc content and verification baseline were kept.
- Re-ran npm run check with the latest main and it passed: format, lint, types, 4 app tests, 34 automation tests, and build, skip 0. Also confirmed the copyable code blocks of the formatted template and the 4 relative links. Past verification commands left in the work log are kept as what was run at the time.
