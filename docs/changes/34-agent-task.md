# #34 feat: Keep log drafts, show save status, and retry safely

- Issue: https://github.com/sirloinbh/workout-memo/issues/34
- Branch: feat/34-agent-task

## Changes and verification

### Test phase (2026-10-19)

- Base: `c827abbe3a29d404ab42faa60a6a8f0c72ba9817`. No implementation files were changed. The issue and branch were the ones the coordinator prepared and were reused, and no commit or remote work was done.
- `backend/test/workout-draft-ui.test.ts`: reuses the React/VM adapter of the existing period UI test. It checks restoring or discarding after a refresh, restoring total weight and date, separating server statistics from the draft, duplicate submission while saving, an explicit retry after offline and timeout errors, replacing the key when the content is edited, keeping the key through a refresh after a lost response, cleanup after success, and start-up safety against storage errors and a corrupted draft.
- `backend/test/workout-retry.test.ts`: uses real Express HTTP requests and the provided dedicated `TEST_DATABASE_URL`. It checks resending after a response is dropped, concurrent duplicate requests, rejecting a different content under the same key, rejecting an invalid key, an old-version conflict, and preserving sets and the version when an update request is resent. Only the test logs created with a UUID prefix are cleaned up in finally. The connection string was not printed or recorded.
- The proposed API contract is a UUID `Idempotency-Key` header and an integer `version` that is returned by GET and included in the PUT body. The implementer may adjust the test adapter to a final contract that guarantees the same behavior. A response replay may be 200 or 201.

Actual run results:

- `node_modules/.bin/tsx --test backend/test/workout-draft-ui.test.ts backend/test/workout-retry.test.ts`: expected failure before implementation. Final run **0 pass / 16 fail / 0 skip / 0 cancelled**, exit 1. The 16 are 9 UI tests, 6 DB subtests, and 1 parent DB test that aggregates the failures.
- Failures actually confirmed on the DB: 2 logs created when resending after a lost response, different IDs returned for concurrent requests, 201 (expected 409) when a key is reused with changed content, 201 (expected 400) for an invalid key, and no version in the read response.
- Failures actually confirmed in the UI: the local draft is not kept, no discard option, 3 sends on a duplicate submit, the draft is not kept after a save failure, no retry key on a request with changed content, and no storage-error notice.
- `npm run typecheck -w backend`: pass.
- `npx eslint backend/test/workout-draft-ui.test.ts backend/test/workout-retry.test.ts --max-warnings 0`: pass.
- `npx prettier --write backend/test/workout-draft-ui.test.ts backend/test/workout-retry.test.ts`: pass.
- `npm run check`: fail (exit 1). After format, the full lint, and the frontend/backend type checks passed, `npm test` gave **118 pass / 16 fail / 0 skip / 0 cancelled**. All the failures are the tests added above. Because the command is chained with `&&`, the later `test:agents` and build were not run.
- On first writing, Korean passed through a PowerShell pipe was corrupted and the syntax check failed. After fixing it with a UTF-8 patch I re-confirmed the results above. The failure diagnostics of an assert with no message hung on Node 22, so I aborted 2 of those runs, and the final run with explicit messages added ended normally.

Limits and next steps:

- The execution environment is Node 22.17.0, which differs from the project-specified Node 24.21.0. The final verification must use the specified version.
- The UI adapter does not check DOM layout, focus, or real React scheduling. Mobile and PC browser verification was not run. The timeout test injects the transport's TimeoutError, so the actual time limit and AbortSignal behavior must be verified further after implementation.
- There is not yet a contract for the retention period and expired-key handling, nor a point to control time. In the implementation phase, add boundary tests for the period and key expiry and the user notice (storage location, period, device limits). The real DB migration of the server duplicate prevention and the integration tests after applying the new schema must also be re-run.
- I did not skip or weaken the red tests that occur because the new feature does not exist. After implementation, it must be confirmed that even the deep later assertions pass.

### Implementation phase (2026-10-19)

I applied `workout-implementation` and `workout-testing`. I reused the already prepared issue, branch, and worktree, and did not commit, push, open a PR, or run subagents. No separate earlier review findings were passed.

Changes:

- One local draft is saved synchronously on every input event. After a refresh, the user chooses restore or discard, and until the choice, entering a new record or editing another log is blocked so the draft is not overwritten. The draft remains even if the edit window is closed. Restoring does not automatically send to the server.
- The storage location is `localStorage` of this device and browser, and the retention period is 7 days from the last input; expired drafts are cleaned up at the next start. Restoring or retrying alone does not extend the period. The screen notes the limits of no sync across devices, deleting browser data, and private mode. Tabs of the same browser share one storage location.
- It shows the saving, saved-to-server, failed, and local-draft states. The error and save status are also shown inside the edit modal so they can be seen while actually editing. The draft is not cleared before the server's success response. While saving, input, closing, and duplicate submission are blocked, and a synchronous ref lock also blocks consecutive submissions before React re-renders.
- Every API request has a 15-second AbortController time limit. On failure, the input and the retry key are kept and an explicit retry button is provided. The same body, method, and target use the same UUID key even after a refresh, and changed content uses a new key. If the content is changed after a lost response, a notice says it is a separate request. If `randomUUID` is missing on a mobile device connected over local HTTP, a UUID v4 is made with `getRandomValues`.
- It handles read, write, and delete errors of the storage and corrupted JSON or structure. It warns about a local save failure while still allowing editing and saving to the server. The save-failure warning does not assert that persisting to disk succeeded.
- `003_workout_retries.sql`: adds `version=1` to existing logs and keeps the key, the SHA-256 fingerprint, the expiry time, and the response. The server serializes the same key with a DB advisory transaction lock. It commits the log, sets, and the retry result together, so even if only the response is lost, no duplicate is created.
- A key is valid for 7 days from the first successful save. If the normalized request content, target, or method under the same key differs or it has expired, it returns 409. Expired keys are kept so that reuse does not create a new record. A failed transaction does not consume the key. An existing POST client may omit the key, but duplicate prevention applies to requests that send a key.
- PUT requires the positive integer `version` that was read. If it differs from the version of the locked DB row, it returns 409 before deleting the sets, and a replay of a successful update returns the earlier response without increasing the version again. GET and the save response provide the version.
- Added to `database/README.md`: applying the migration to an existing volume, the key validity period and retention, the API version contract, and the limits of the draft. Initialization and CI still apply the migration files in order.

Test reinforcement:

- All the existing assertions of the test phase were kept. In the earlier goal, machine, and transaction tests, only the fixtures were reinforced so that update requests pass the current version. I gave the existing period UI adapter the browser storage, crypto, AbortController, and timer.
- `workout-draft-ui.test.ts`: added to the existing 9 the 7-day retention boundary, JSON with a corrupted structure, real AbortSignal cancellation and the connection to the 15-second timer, the conflict message and keeping the draft, and the UUID fallback path over local HTTP. There are 14 UI scenarios in total. This is not a check that substitutes for DOM layout or real browser scheduling.
- `workout-retry.test.ts`: added keeping existing data, versions, and keys when the migration is re-run and the DB-based 7-day default, key expiry, the format of the required version, concurrent execution of different requests under the same key, and concurrent edits of the same version from two devices. The original assertions for lost response, concurrent duplicate, conflict, and update replay all passed too. It cleans up only the current test's logs and keys.

Actual commands and results:

- I checked only whether the dedicated `TEST_DATABASE_URL` exists. The value was not printed. With Node/pg I read `database/migrations/003_workout_retries.sql` and applied it with `pool.query` on that dedicated DB: pass. No other DB or `.env` was used.
- `node_modules/.bin/tsx --test backend/test/workout-draft-ui.test.ts backend/test/workout-retry.test.ts`: first after implementation **16 pass / 0 fail / 0 skip**. After reinforcing the retention, cancellation, and conflict checks, **22 pass / 0 fail / 0 skip**. The last full check also included the final added scenarios.
- `npm test`: an intermediate run **138 pass / 0 fail / 0 skip**. In the first full check the existing tests failed because they did not pass a version, and I fixed them to pass the new update contract without changing what they verify. The migration period test failed once because of the clock difference between the host and the DB, so I fixed it to confirm exactly 604800 seconds based on the DB's `now()`.
- `node_modules/.bin/tsx --test backend/test/workout-draft-ui.test.ts backend/test/period-ui.test.ts`: UI-related **34 pass / 0 fail / 0 skip** (run before adding the final UUID test).
- I formatted the changed TS/TSX/CSS/Markdown with `npx prettier --write`. SQL has no default Prettier parser, so it was excluded from that step. I fixed the format warning of the first `npm run check`.
- Final `npm run check`: **fail (exit 1)**. Format, the full lint, and frontend/backend type checks passed. `npm test`: **144 pass / 0 fail / 0 skip / 0 cancelled**, including the dedicated-DB integration tests. `test:agents`: **86 pass / 0 fail / 0 skip / 0 cancelled**. In the last frontend build, Vite/esbuild failed with **Access is denied** while reading the parent directory `../../../../../../../..`. Resolving `vite.config.ts` also failed, and the following backend build did not run because of `&&`.
- `npm run build -w backend`: run separately, pass.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/34 diff --check`: pass. Git gave a warning about permission to read the user's global ignore, and I did not change the global settings.
- For browser verification, I tried to run an 8088 dev server using the dedicated test DB from the ignored `.local/34-browser/serve.mts`: `node_modules/.bin/tsx .local/34-browser/serve.mts`. The Vite dependency pre-bundling also failed with **Access is denied** reading the parent directory, and the server exited. I could not check the mobile and PC screens in Edge or produce screenshots. I did not escalate permissions or bypass the sandbox.

Blocks and the coordinator's remaining verification:

- **Permission block**: because Vite/esbuild was denied access to the parent directory, the full build and the real mobile/PC screen verification are incomplete. This state must not be reported as the full check succeeding or the browser check being done. In an allowed execution environment, `npm run check` and the draft restore, save status, and failure/retry modal at 390px mobile and 1440px PC must be checked.
- The Node provided now is **22.17.0**, and the project-specified **24.21.0** is not installed. It must also be verified in the project-specified Node/npm environment. I did not change any installation or global settings in this work.
- I did not apply this to the production DB in this phase. `003_workout_retries.sql` must be applied before deployment. Old PUT clients must be updated to the new required version contract.
- Draft sync across devices, simultaneous draft management across several tabs, and automatic background sending are not in the implementation scope. Input must be done in one tab of one browser. The expiry marker of a key is kept cumulatively to safely reject past replays, and the duplicate-prevention guarantee must be kept when a separate cleanup policy is introduced.

## Coordinator: formal re-handoff of protected tests — 2026-10-19

The worker stopped after detecting that the implementation role changed backend/test/workout-draft-ui.test.ts. The existing implementation, tests, and logs are preserved, and accept-requirements formally re-reviews starting from the tests role. It compares the earlier tests handoff and tests.log with the current diff and confirms that, without deleting or weakening the original assertions, the new version and retry contract, the time basis, and the UI adapter verify user behavior. Only the tests owner generates the formal hash. It is not bypassed by replacing the hash manually or skipping tests. The implementation role does not modify the protected tests after the re-handoff. Node 24.21.0 is installed at .local/node-v24.21.0-win-x64 in the project root, and the existing installed runner is used without changing global settings. The host full check and the real mobile/PC browser verification are not assumed to succeed.

### Protected test re-handoff: tests owner re-review (2026-10-19)

- I read `AGENTS.md`, `workout-implementation`, `workout-testing`, the existing work records, and the test-writing and run history of the earlier `jobs/34/tests.log`. The key assertions of the original 9 UI scenarios and 6 DB scenarios (restored values, separating server statistics, keeping before success, replay key, duplicate prevention, version conflict, set preservation) are kept. The tests added in the implementation phase verify real user results and DB boundaries, and I found no change that skips a failure or weakens an expected value.
- The UI adapter's `useRef`, AbortController, crypto fallback path, and controllable timer are changes to provide the current browser API contract. The 7-day default of DB time is rightly verified against PostgreSQL `now()` in the same transaction instead of the host clock. The change that added version to the existing update fixtures also passes the new server contract and keeps the existing domain assertions.
- This tests-owner reinforcement: I called the submit handler of the same render twice to check a duplicate click before React re-renders. I added the cases where reading works but the write quota is exceeded, where only the local delete fails after the server save, and where a restored edit requests with its original version even if a newer server record exists. In the DB I added the method and target binding of a key and the reuse of a key from a request rolled back by a foreign key error. I did not modify the implementation files.
- The red result before adding the tests keeps the earlier test phase's **0 pass / 16 fail / 0 skip** record. This time I received a work tree that was already implemented, so I did not revert or change the implementation to produce a new red result.
- Runner: I put the existing `.local/node-v24.21.0-win-x64` in the project root at the front of PATH for that command's process. `node --version`: **v24.21.0**. I did not change global settings or installed files. For `TEST_DATABASE_URL` I checked only whether it was provided, and used only the provided dedicated DB.
- `node node_modules/prettier/bin/prettier.cjs --write backend/test/workout-draft-ui.test.ts backend/test/workout-retry.test.ts`: pass.
- `node node_modules/tsx/dist/cli.mjs --test backend/test/workout-draft-ui.test.ts backend/test/workout-retry.test.ts`: **31 pass / 0 fail / 0 skip / 0 cancelled**, exit 0. 17 UI, 1 migration, 12 API subtests, and 1 parent aggregate. It cleans up only the test fixtures and does not print the connection string.
- First `npm run check`: failed at format:check (exit 1) because of an existing format warning at the end of the document. The later steps were not run. After formatting the document I re-run the full check.
- Re-run `npm run check` (Node 24.21.0): **fail (exit 1)**. Format, the full lint, and frontend/backend type checks passed. App/dedicated-DB tests **149 pass / 0 fail / 0 skip / 0 cancelled**, worker tests **86 pass / 0 fail / 0 skip / 0 cancelled**. The frontend Vite/esbuild build was blocked by `Cannot read directory "../../../../../../../..": Access is denied` and a failure to resolve `vite.config.ts`. The following backend build did not run because of `&&` in the command. Changing the Node version alone did not resolve the permission error.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/34 diff --check`: pass. I did not change the implementation, Git settings, work-state metadata, or the protected hash records. The values below are the handoff SHA-256 that the tests owner calculated from the final files, and the coordinator does the worker's formal state update.
  - `backend/test/workout-draft-ui.test.ts`: `97b80901bbb99e65ca04246cb6732ff5d95debf64f5aec0891d3a2a40dd3b60b`
  - `backend/test/workout-retry.test.ts`: `1b7147de5d79acef0b9b1f02b7a8f73eb9ea6abb3e50580d4ab30c59453f235e`
- Remaining block: the full build and the real mobile/PC screen verification are needed in an allowed host environment. These UI tests are a VM event/render adapter and do not substitute for verification of the DOM, layout, or real React scheduling. I do not report that the real screen check is done. The tests and docs were left uncommitted, and I did not commit, push, open a PR, approve, merge, or run subagents.

## Coordinator (Claude Code): host verification, independent review, real-browser check — 2026-10-19

- Claude Code took over the work that stopped when the Codex tokens ran out. It did not change the test or implementation files.
- `npm run check` on the host (Node 24.21.0 / npm 11.19.0, dedicated test DB): **exit 0**. App and DB **149 pass / 0 fail / 0 skip**, worker **86 pass / 0 fail / 0 skip**, format, lint, types, and frontend/backend builds passed. The sandbox's Vite/esbuild access denial was not reproduced on the host.
- Independent review (read-only): no blocking findings. Confirmed same-key serialization with an advisory lock, the request fingerprint, version comparison and `FOR UPDATE`, expired-key tombstones, and migration idempotency. Notes (P3): `DELETE` does not check the version, the original error can be hidden if ROLLBACK fails, and there is no key cleanup — outside the issue scope, a follow-up decision.
- Real browser (Playwright, dev server connected to the dedicated test DB):
  - Mobile 390×844: input → refresh → "초안 복구" (Restore draft) notice → on restore the date, title, exercise name, 62.5kg, and 8 reps are kept → on save the status is "서버 저장 완료" (Saved to server), the localStorage draft is deleted, the server read has 1 record, and there is no horizontal scrolling.
  - POST twice with the same Idempotency-Key: both responses are 201 with the same id, 1 record. PUT twice with version 1 (different keys): the first 200 (version 2), the second a 409 conflict notice.
  - PC 1440×900: the input modal layout and the save status notice are normal.
  - Observation: in the first attempt, which auto-filled several fields in a row right after opening the modal, only the title was empty after restore. When I repeated the same procedure, the title was saved and restored and it did not reproduce. It looks like an automation timing problem, but I recommend checking in the PR review whether it is a defect in real user input.

## Resolving the merge conflict with main — 2026-10-19

- After PR #46 (#27 routine) and #42 (#26) were merged, I merged main into this branch. I resolved the 3 conflicts as follows.
  - `frontend/src/main.tsx`: kept main's routine page branch (title and main buttons shown only when `page !== 'routines'`) and added only this work's `disabled` condition that blocks the new-record button on the log screen while a draft restore is pending.
  - `frontend/src/style.css`: kept both this work's `fieldset.workout-fields` and main's `.routine-page` rules.
  - `backend/test/period-ui.test.ts`: kept main's module loader (`sandbox`, local module loading) and added the `localStorage`, `crypto`, `AbortController`, and timer this work needs to the sandbox.
- After the merge, 17 `workout-draft-ui.test.ts` tests failed because they could not handle the `./routines` import newly added on main. This test renders only the log screen, so I replaced the routines module with an empty component. The routine screen is verified by #27's own UI test. I did not change the existing assertions.
- Merge result, host `npm run check`: **exit 0** — app and DB **209 pass / 0 fail / 0 skip**, worker **162 pass / 0 fail / 0 skip**, build passed. For migrations, main's `004_routines.sql` and this work's `003_workout_retries.sql` coexist with no number collision.
