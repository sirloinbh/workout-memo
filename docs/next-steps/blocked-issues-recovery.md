# Recovery procedure for blocked issues #17, #19 and #26

As of: 2026-10-15 (Asia/Seoul). Documentation work: [#38](https://github.com/sirloinbh/workout-memo/issues/38).

This document records how to recover. **This documentation work did not unblock any of the three issues or restart the worker.** The status is a snapshot from when it was checked; query it again before you act.

## Current status and priority

| Issue                                                                         | Priority | Cause of the block                                                                                                                | Next action                                          |
| ----------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [#17 Statistics](https://github.com/sirloinbh/workout-memo/issues/17)         | P0       | The implementation role added a regression test to a protected UI test file, which caused a hash mismatch                         | Formal re-review and handoff by the tests role       |
| [#19 Machine management](https://github.com/sirloinbh/workout-memo/issues/19) | P0       | Real browser verification is not finished, and Chrome control timed out earlier                                                   | Host browser verification and recording the evidence |
| [#26 Token optimization](https://github.com/sirloinbh/workout-memo/issues/26) | P1       | esbuild could not access a parent path in the restricted execution environment, and the latest fix needs an independent re-review | Full host check, then a high-risk independent review |

The recommended order is #17 → #19 → #26. #26 improves development cost and recovery efficiency, but it does not replace the MVP verification that is still unfinished.

## Common: checks before resuming

1. From the project root, check the current worker status, and request a stop before any command that changes state. A stop is not an immediate kill; it stops after the current step ends. Confirm that `worker.running` in status is false and that `running` of the job is null.
2. Keep each issue's existing worktree, branch, uncommitted implementation, tests and logs. Do not let another worker implement the same issue at the same time.
3. With the project wrapper for the personal account sirloinbh, compare the latest issue title, body, number, URL and updatedAt with the existing snapshot. updatedAt can change even when only a priority label changed.
4. If the actual requirements changed, formally hand off again from the test step with accept-requirements. Check identity even when only a label changed. To handle it with the current standard commands alone, use accept-requirements, which costs a test re-run. A coordinator recovery that updates only metadata needs an identity check and an audit record first.
5. Check Node 24.21.0, npm 11.19.0, the per-issue dependencies, and a dedicated test DB with migrations applied. Do not use the production DB or user data for verification. Do not record connection values in docs, PRs or logs.
6. An earlier pass is evidence for the change at that time. If the current source, tests or requirements changed, new verification is needed.

The current PC selects the verified installed runner as `.local/agent-workflow/agents.ps1`. It may differ in version from `scripts/agents.ps1`, so do not mix them. In an environment without an installed runner, follow the general procedure in the [local agent operations doc](../local-agent-workflow.md). The commands below are for **when you run the recovery**; they are not commands that were run while writing this document.

```powershell
./.local/agent-workflow/agents.ps1 status
./.local/agent-workflow/agents.ps1 stop
# Check worker.running=false and the target job's running=null in status, then continue
./.local/agent-workflow/agents.ps1 status
```

### #17: formal handoff of the protected tests

**Cause:** An earlier review pointed out that a stale period query overwrites the current statistics and graph when a delete or edit request finishes. The implementation role fixed this and added a regression test to `backend/test/period-ui.test.ts`. The runner's whole-file hash protection treats an added test as a change.

The current work record reports 27 app tests and 34 worker tests passing. That is a record from the time and not a result re-run for this documentation work. Tests were added after the earlier diagnosis, so do not copy the old hash as the current baseline.

Recovery steps:

1. Compare the current test diff with the earlier tests role's baseline and check that no existing assertion was deleted or weakened. Also review that the expected values of the new regression test match the fixed data.
2. Keep the prepared fix and the regression test, and hand off again from the tests role through the accept-requirements path of the currently installed runner. This command also picks up the latest issue snapshot.
3. The tests role reviews the extra regression test and the existing assertions and generates the formal baseline hash. After that, the implementation role does not edit the protected files again. If more reinforcement is needed, hand off to the tests role again.
4. With the specified Node/npm and the dedicated DB, run the full check, verify period selection, edit/delete and graph refresh in a real browser, and record it.
5. Proceed in the order independent review → final host check → commit, PR, CI.

```powershell
# After the common checks and confirming the worker has exited
./.local/agent-workflow/agents.ps1 accept-requirements -Issue 17
# The existing runner that passes the dedicated test DB on this PC
./.local/agent-workflow/start-with-test-db.ps1
```

**A plain retry does not solve it.** The currently installed version goes back to the implementation step and reuses the existing protected hash. Do not make it pass by replacing the hash by hand or by deleting tests. Do not assume that handoff-tests, which is being developed in #26, is an active command yet.

### #19: real browser verification

**Cause:** At that time `npm run check` passed the 12 app tests, 34 worker tests and the DB integration checks, but real Chrome control hung with a timeout. Screen verification cannot be marked complete just because the code checks passed.

In #16, browser verification succeeded with a profile separate from the user's Chrome, a host execution environment, a loopback verification app and a dedicated test DB. **That result does not replace the verification of #19 itself.** Use the change record of the [#16 PR](https://github.com/sirloinbh/workout-memo/pull/37) and apply the same method to the current build of #19.

Recovery steps:

1. Prepare the latest #19 build and migrations in a dedicated test environment. Do not use the user's browser profile or real workout records.
2. On the screen, check the flow: choose a brand → register a machine → save the base weight → edit → query again.
3. Check separately an unconfirmed NULL, a confirmed 0 kg, positive values and invalid input.
4. Link a machine to a workout set and check that the total weight is not added twice. After editing the base weight, compare that the total weight and volume of past sets stay the same.
5. Record the actual commands, results, the browser scope you verified, and the evidence in `docs/changes/19-agent-task.md`. If a new test is needed, hand off to the tests role again.
6. If the requirements snapshot matches, resume with retry. If it does not match, follow the common re-handoff procedure first.

```powershell
# After host browser verification is complete, the worker has exited and the snapshot matches
./.local/agent-workflow/agents.ps1 retry -Issue 19
./.local/agent-workflow/start-with-test-db.ps1
```

Clean up only the verification processes, and do not delete the production server, the user's browser, or the test DB volume.

### #26: host check and independent re-review

**Cause:** In the implementation sandbox, Vite/esbuild failed with Access is denied while reading a parent directory. The latest implementation record reports 40 app/DB tests and 137 worker tests passing, but that does not mean the full build/check succeeded. A host success on the earlier 128-test baseline also does not replace verification of later fixes.

Recovery steps:

1. In the coordinator's allowed host environment, check the dedicated test DB connection and the protected test hash of the current #26 worktree.
2. In that worktree, run `npm run check` with the specified Node/npm. Mark a build that did not run because an earlier step failed as not run. Instead of repeating runs for an unknown cause, classify environment failures and code failures.
3. Leave the verification result of the current change that passed in `docs/changes/26-agent-task.md`. If it fails, record the exact step, code and command, and recover only the environment that is needed. Do not work around it by widening ACLs or changing global security settings.
4. Independently re-review the fixes and regression tests for the three earlier review findings below.
   - Does it classify a permission failure during an npm check as an environment error?
   - Does it keep valid implementation evidence when a review precheck fails while the files have not changed?
   - Does retry keep the failure code and the regression condition in a bounded summary before it clears the error?
5. Keep the existing highRiskReview routing (Astra high). Do not approve on the implementation role's "fix complete" report alone.
6. After the requirements snapshot matches, proceed with retry through implementation check, independent review, host check and PR. If restricted-environment errors repeat, do not just repeat retries; review the current evidence and the boundary of host verification.
7. The coordinator activates the version that has finished PR verification and user review separately. Do not overwrite the current runner with an unreviewed working tree.

```powershell
# After the full host check is complete, the worker has exited and the snapshot matches
./.local/agent-workflow/agents.ps1 retry -Issue 26
./.local/agent-workflow/start-with-test-db.ps1
```

## Deciding that recovery is complete

- The actual cause of the block is resolved, and the needed test, DB and browser results are recorded against the current change.
- The original requirements, the protected tests, the independent review and the pre-publish checks are preserved.
- Distinguish the fact that the worker status left blocked from implementation being done, a PR being created and CI passing.
- Merge when the PR's required CI passes. If it conflicts with main, resolve it with a merge commit and get CI passing again.

There is no feature that turns a PR's follow-up recommendations into issues or worker jobs automatically. Manage required fixes in the current issue, and separate features in a new issue that has a purpose, completion criteria and dependencies. For #31 to #35 of the [service research backlog](../fitness-app-research-2026.md) too, distinguish being registered from starting implementation. The latest execution order is managed in [current next steps](README.md).
