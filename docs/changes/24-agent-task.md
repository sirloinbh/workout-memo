# #24 feat: assign OpenAI models per role and add the Astra debugging worker

- Issue: https://github.com/sirloinbh/workout-memo/issues/24
- Branch: feat/24-agent-task

## Changes and verification

### Test phase (2026-10-15)

- Read `workout-implementation`, `workout-testing`, and AGENTS.md. Used the issue, branch, and worktree that were already prepared. Did not implement, commit, or make remote changes.
- Kept and reviewed the draft #24 tests that already existed in `scripts/test/agent-runtime.test.mjs` at the start. Added tests for enqueue input validation, safe configuration changes to an existing job, and lock release after a model access failure and after a diagnosis failure.
- The tests were added inside the existing `test:agents` target file, so no package.json/CI wiring change is needed. The existing 34 tests and the 35 #24 contract tests run together.
- The CLI and fake Codex/npm executors are copied into a temporary directory. Git/GitHub commands are replaced in the fixture, and the real queue, worktree, remote repository, and models are never touched. To check that the fake child process inherits the DB environment, only a synthetic marker is used instead of a real connection string.

Behavior verified:

- Explicit model and reasoning effort arguments for the 8 roles, read-only smoke, the default Sol task, and the explicit Luna documentation implementation / Astra high-risk review routing.
- Backward compatibility: Luna is not chosen from the document title or body alone. Unknown roles, models, and task kinds are rejected. A model access failure makes exactly one call and has no fallback.
- The role, model, effort, and actual event thread ID are shown in the success result and in status. The Codex/npm child processes inherit the dedicated DB environment, and the connection value is never printed.
- Astra diagnosis: read-only sandbox, never approval policy, error evidence and snapshot guidance, preservation of the existing job/source/tests/worker lock/schema, a separate lock and result files, exclusion of concurrent calls, lock release after a failure, and a stale marker when the source changes.
- PowerShell to Node enqueue passes the task kind and the diagnose issue number. Node enqueue stores the task/review selection and rejects invalid or missing options.
- The existing #21 documentation-mode change is handled by an explicit command that preserves the job state, result, and files, and it is rejected while the worker lock is active.

CLI contract handed to the implementation (test expectations that were not yet implemented):

- `node scripts/agents/cli.mjs smoke --role <role>`
- `node scripts/agents/cli.mjs enqueue <issue> --task-kind documentation --review-role highRiskReview`
- `node scripts/agents/cli.mjs configure 21 --task-kind documentation` — a proposed command for resetting the task kind. It updates the job only while the worker lock is released. Do not edit the JSON by hand while a job is running.
- `scripts/agents.ps1 enqueue -Issue <issue> -TaskKind documentation`
- `scripts/agents.ps1 diagnose -Issue <issue>`
- The explicit selection fields in the job JSON are `taskKind` and `reviewRole`. The selection fields in the result are verified as `role`, `model`, `reasoningEffort`, and `threadId`.

Actual runs and results:

| Command                                                                   | Result                                                                                                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:agents` (checking the draft)                                | exit 1; of 62, pass 35 / fail 27 / skip 0                                                                                                             |
| `npx --no-install prettier --write scripts/test/agent-runtime.test.mjs`   | exit 0                                                                                                                                                |
| `npm run test:agents` (after the additions, with a summary output filter) | exit 1; of 69, pass 35 / fail 34 / skip 0                                                                                                             |
| `npm run check` (with a summary output filter)                            | exit 1; format/lint/typecheck passed, backend pass 4 / fail 0 / skip 0, agent pass 35 / fail 34 / skip 0; build not run because of the agent failures |

The 34 failures are the expected pre-implementation failures: missing model/effort arguments, missing selection storage/status, ignored unknown options, unsupported diagnose/configure, and unsupported PowerShell passing. The existing 34 tests and 1 synthetic npm environment inheritance test passed. The backend tests that ran with the dedicated TEST_DATABASE_URL included 1 DB integration test, and it was not skipped. The connection value was neither read nor recorded.

Among the helper commands, `require.resolve('npm/bin/npm-cli.js')` failed to find the local module, so it was not used. Checks were then done with real `npm run ...` commands. The `rg backend/test/*.test.ts` glob is not supported on Windows, so it was rechecked with `rg ... backend/test`.

The last `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/24 diff --check` and `npx --no-install prettier --check scripts/test/agent-runtime.test.mjs docs/changes/24-agent-task.md` both exited 0. Git status showed only the test file and this record as changes. Git status printed a warning about read permission on the user's global ignore file, but the check finished, and the global configuration was not changed.

What remains to verify: rerun the full check after implementation, review the operations docs and the AGENTS role table and commands, and run the three real-model read-only smoke tests in the main conversation. The fake executor results are not evidence of successful real model access. If a root outside the project or an install/activation path is added, tests for repository/remote/account rejection and for queue/home preservation will also be needed. That optional path was neither introduced nor verified in this phase.

### Implementation phase (2026-10-15)

- Applied `AGENTS.md`, `workout-implementation`, and `workout-testing`. Used only the existing issue, branch, and worktree, and did not do any sub-agent, commit, remote change, or PR work. The previous review role's findings were not in the input.
- Split the model/effort for the 8 approved roles and the input validation into `scripts/agents/models.mjs`. Every Codex run states the model/effort explicitly as array arguments. The default is Sol, an explicit documentation implementation uses Luna, and a high-risk review uses Astra. There is no automatic fallback or escalation.
- Implemented the task/review options of `enqueue`, the PowerShell passing, and `configure`, which changes only queued/blocked jobs under the worker lock. Recorded in the operations docs the procedure for safely switching the existing #21 to documentation mode. A running job is not modified.
- The selected role/model/effort/thread ID is kept in the phase result and in status. The selection information is kept even when a model run fails, and the thread ID is null when the failure happens before the session starts. Status also shows the latest diagnosis metadata.
- `diagnose` runs with Astra high/read-only/never. It stores a separate lock and per-run schema/result/log/metadata in an ignored diagnosis-only path, and it does not change the job, tests, source, the existing worker lock, or the schema. If the file list/contents or the job hash differ before and after the analysis, it is marked stale. A failure is also recorded in the metadata, the lock is released, and the call is not retried.
- Kept the child process inheritance of `TEST_DATABASE_URL`. If the connection value appears in process output/logs/errors, it is masked, including a value that spans a pipe chunk boundary. Sensitive paths are excluded from the fingerprint. No real connection value or credential file was read or printed.
- The added regression test `scripts/test/agent-models.test.mjs` verifies rejection of inherited object names and wrong routing, the default/documentation routing, and that the synthetic DB marker is not exposed across chunk boundaries. It is wired into package.json and into the actual run list of the Windows/Linux worker CI.
- Recorded in `AGENTS.md` and the operations docs the role table, the commands, the usage caution, the ban on changing models without an explicit user request, and the principle of keeping the current chat/global settings. Searched and read the official CLI docs: [Codex developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli). The model names use the user-specified values as they are, and no claim is made that account access succeeded.
- Did not introduce or do the external root option, a separate installed copy, global configuration changes, or real worker activation. Activating the current worktree implementation after verification is the coordinator's job.

Actual commands and results:

| Command                                                                                                                | Result                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:agents` (after implementing the existing contract)                                                       | exit 0; pass 69 / fail 0 / skip 0                                                                                                                                                     |
| `npx --no-install prettier --write scripts/agents/cli.mjs scripts/agents/models.mjs scripts/agents/process.mjs`        | exit 0                                                                                                                                                                                |
| `npx --no-install prettier --write scripts/test/agent-models.test.mjs AGENTS.md docs/local-agent-workflow.md`          | exit 0                                                                                                                                                                                |
| `npm run check`                                                                                                        | exit 1; format/lint/typecheck passed, backend pass 4 / fail 0 / skip 0, agent pass 71 / fail 0 / skip 0; permission failure below while loading the Vite config in the frontend build |
| `npx --no-install prettier --write scripts/agents/cli.mjs` (after strengthening status/argument validation)            | exit 0                                                                                                                                                                                |
| `npm run test:agents` (final executable code)                                                                          | exit 0; pass 71 / fail 0 / skip 0                                                                                                                                                     |
| `npm run lint` (final executable code)                                                                                 | exit 0                                                                                                                                                                                |
| `npm run build -w backend`                                                                                             | exit 0                                                                                                                                                                                |
| `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/24 diff --check` | exit 0                                                                                                                                                                                |
| Checked the relative link targets of AGENTS/operations docs with Node fs                                               | All exist                                                                                                                                                                             |

The prepared `scripts/test/agent-runtime.test.mjs` was not modified in the implementation phase, and its SHA256 matches the handed-over value `eed238241a1d5a1e3829a5a02968a519a4f3422daba6e3022dd2795e1cd2e5e7`. No existing assertion/skip was changed. The backend check that received the dedicated TEST_DATABASE_URL included the PostgreSQL integration tests, and all 4 passed.

Blocker: in the frontend build of `npm run check`, esbuild tried to read the `../../../../../../../..` directory and failed with `Access is denied`. It then reported that it could not resolve `frontend/vite.config.ts`. Access to parent directories is restricted in the current sandbox, and I did not work around it, extend permissions, or change global settings. I did not widen the scope of this issue by changing app code/build configuration. The coordinator needs to recheck the full check/build in an allowed execution environment.

Remaining handoff: the full frontend build/check in an allowed environment without permission limits, an independent review, the three real-model read-only smoke tests in the main conversation, and activating the verified worker if needed. Do not read the 71 passes of the fake executor as verification of a real model connection. All changes are left uncommitted.

After writing the work record I ran `npx --no-install prettier --write docs/changes/24-agent-task.md`, `npm run format:check`, and `git ... diff --check`, and all exited 0. The final Git status printed a warning about read permission on the user's global ignore file but exited normally. Apart from the prepared tests, only files within this implementation scope are changed, and the global Git configuration was not modified.

### Fixes for independent review findings (2026-10-15)

- Fixed the two P1 findings and one P2 finding from the earlier review. Kept the prepared issue/branch/worktree and did not commit, push, open a PR, or run additional agents.
- Applied the recursive masking of the shared security module to JSON reading/saving. Nested results and the errors/status of existing jobs no longer expose the dedicated DB value. The Codex last-message file is masked at the success/failure boundary, and a successful result is saved again as sanitized JSON. The diagnosis does not modify the original job. The regression tests use only synthetic markers instead of real secrets.
- The thread.started event on stdout is parsed per chunk and saved immediately to the phase result or the diagnosis metadata. The threadId is kept in failure and timeout errors too, and an ID that was already received is kept even if later output gets long.
- Separated the sensitive-path exclusion of the diagnosis fingerprint from the validation for publishing. The publishing fingerprint and changedPaths use the same rejection rule, so connection.json, container.env, credentials, .codex, and the existing environment/backup/state paths are rejected before their contents are read or staged. This removes the path where a sensitive path added after verification was silently excluded from the fingerprint.
- Added 13 regression tests to the separate scripts/test/agent-review-regressions.test.mjs and wired them into package.json and the Windows/Linux CI. They verify masking in the structured files and status on success/failure, preservation of the existing job, thread IDs on failure/timeout, and rejection of sensitive paths before publishing. The protected test scripts/test/agent-runtime.test.mjs was not modified and keeps SHA256 eed238241a1d5a1e3829a5a02968a519a4f3422daba6e3022dd2795e1cd2e5e7.

Actual runs and results:

- node --test scripts/test/agent-review-regressions.test.mjs: exit 0, pass 13 / fail 0 / skip 0.
- node node_modules/prettier/bin/prettier.cjs --write scripts/agents/security.mjs scripts/agents/store.mjs scripts/agents/process.mjs scripts/agents/cli.mjs scripts/test/agent-review-regressions.test.mjs package.json .github/workflows/local-agent-workflow.yml: exit 0.
- npm run test:agents: exit 0, pass 84 / fail 0 / skip 0.
- npm run check: exit 0, format/lint/typecheck passed, backend pass 4 / fail 0 / skip 0 (including the PostgreSQL integration tests of the provided dedicated DB), agents pass 84 / fail 0 / skip 0, frontend/backend build passed. The frontend build permission failure from the earlier implementation phase did not reproduce in this run.

Remaining handoff: the coordinator's final host verification and independent re-review, the read-only smoke of the three real models owned by the main conversation, and worker activation if needed. Do not report a pass of the synthetic executor as successful real model access. All changes are uncommitted.

After writing the record, Prettier --check on the changed files above and the work doc, and git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/24 diff --check, also exited 0. I again confirmed with Node crypto that the protected test SHA256 equals the handed-over value above.

### Fix for the existing environment template fingerprint regression (2026-10-15)

- Fixed the P1 from the independent re-review. The problem was that applying the publishing rejection rule to the full tracked file list blocked verification even for the existing `.env.example`.
- The publishing fingerprint first rejects changed sensitive paths through `changedPaths`, and in the full list it excludes existing sensitive paths without reading their contents. This check runs before and after verification and right before delivery, so a sensitive path added or changed after verification is also blocked. The read-only exclusion rule of the diagnosis is kept.
- While keeping the assertions of the existing regression tests, the fake Git's responses for the full list and the changed list were separated per actual command. Added a regression test that reflects the filename list of the real repository's `git ls-files -z` into a synthetic worktree, and a test that rejects a changed tracked environment template. Sensitive files are not created even in the synthetic worktree, so the test fails if any content read happens. The contents of real sensitive files were not read.
- Before the fix, `node --test --test-name-pattern='repository tracked inventory' scripts/test/agent-review-regressions.test.mjs`: exit 1, pass 0 / fail 1 / skip 0. It reproduced `Sensitive path cannot be published: .env.example`.
- After the fix, `node --test scripts/test/agent-review-regressions.test.mjs`: exit 0, pass 15 / fail 0 / skip 0.
- `node node_modules/prettier/bin/prettier.cjs --write scripts/agents/cli.mjs scripts/test/agent-review-regressions.test.mjs`: exit 0.
- `npm run check`: exit 0. format/lint/typecheck passed, backend pass 4 / fail 0 / skip 0 (including the dedicated DB integration tests provided), agents pass 86 / fail 0 / skip 0, frontend/backend build passed.
- Confirmed the protected test SHA256 `eed238241a1d5a1e3829a5a02968a519a4f3422daba6e3022dd2795e1cd2e5e7` with Node crypto. The existing test file was not changed.

Worked only in the existing issue/branch/worktree, and the changes are uncommitted. The coordinator's independent re-review remains. Real model smoke and worker activation were not done.

### Coordinator final confirmation (2026-10-15)

- The main conversation ran the final `npm run check` in an allowed host environment. exit 0: format/lint/typecheck, backend 4 pass / 0 skip including the real dedicated PostgreSQL integration tests, worker 86 pass / 0 skip, and the frontend/backend build all passed. The connection value was not printed or recorded in the docs.
- In the main conversation's real Codex smoke with no file access, `gpt-6-astra`, `gpt-6.1-sol`, and `gpt-6-luna` all returned `READY`. This is confirmation of real account access, distinct from the fake executor results. The per-role CLI arguments and reasoning effort were verified separately in the worker tests.
- A separate `gpt-6.1-sol` high read-only review returned a final `approved=true`. It confirmed that the earlier findings (structured result masking, failed session ID, publishing path check, existing environment template regression) were resolved and that the protected test SHA was kept. The worker's own independent re-review also passed, so it moved on to the verification phase. This is not approval to merge the PR.
- When applying the verified code to the current operating worker, copy the execution modules into the ignored `.local/agent-workflow/runtime/<commit>/` and separate only the code location and the existing project root binding. Record the hashes of the original/installed files in the manifest, and keep the existing queue, worktree, personal account, and dedicated DB connection. Do not overwrite the version-controlled files on `main` or auto-merge the PR. Keep the activation and restart records in the ignored local operations record.
