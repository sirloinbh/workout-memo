# #16 feat: [MVP] Workout log and set entry, view, edit, and delete

- Issue: https://github.com/sirloinbh/workout-memo/issues/16
- Branch: feat/16-agent-task

## Changes and verification

The task agent records the actual changes and verification results.

### Test stage (2026-10-15)

- Base SHA: `a0ce3245dddf8974f36054d01967ff21efbb5f29`. Reused the existing issue and branch, and changed no implementation files. Did not perform any commit, push, or PR work.
- Read `AGENTS.md`, `skills/workout-implementation/SKILL.md`, and `skills/workout-testing/SKILL.md`, and applied them within the scope of the test role.
- `backend/test/workout-validation.test.ts`: checks that each set keeps its own independent note, that a total weight of 0 or a decimal is accepted, and that an unspecified machine is allowed. For each of POST and PUT, 15 invalid inputs (missing required values, empty title or exercise name, wrong date format or impossible date, negative or non-numeric weight, zero or decimal rep count, invalid machine ID) are checked for a 400 response and for no repository access.
- `backend/test/workout-persistence.test.ts`: on a dedicated DB, checks create/read/update of date, machine, total weight, set order, and log and set notes; exclusion from the previous date after a date change; rollback of the log and all sets when the second set fails with an FK error; no leftover log after a failed create; reads after recreating the API and the Pool; delete with set cascade; and 404 for updating or deleting a missing log. It cleans up fixtures isolated by UUID and does not use the production DB settings.

Actual run results:

- Existence check equivalent to `node -e "console.log(Boolean(process.env.TEST_DATABASE_URL))"`: `false`. The value was not read or printed.
- `npx prettier --write backend/test/workout-validation.test.ts backend/test/workout-persistence.test.ts`: succeeded.
- `npm test`: **failed**, out of 38 total: pass 35 / fail 1 / skip 2. The failure is `workout validation retains independent notes for each set`: the current `workoutSchema` strips set `notes`, so the notes of both sets are lost. This reproduced the failure expected before implementation. The 30 POST/PUT input-rejection cases passed.
- `npm run typecheck -w backend`: succeeded (exit 0).
- `npx eslint backend/test/workout-validation.test.ts backend/test/workout-persistence.test.ts --max-warnings 0`: succeeded.
- `npx prettier --check backend/test/workout-validation.test.ts backend/test/workout-persistence.test.ts`: succeeded.

Blockers and handoff to the implementation stage:

- **DB verification blocked**: the dedicated `TEST_DATABASE_URL` was not provided, so 2 DB integration tests (existing and new) were skipped. DB CRUD, rollback, and reconnect persistence are not counted as verified. Provide a dedicated DB with the schema prepared, then rerun `npm test`.
- Implementation gaps confirmed: set notes are missing from the server schema, the set INSERT, the DB set table, and the frontend set type and input. The implementation stage must fix storage, reading, and UI input and display together.
- The frontend date default uses `getFullYear/getMonth/getDate` in the browser's local time zone. The `Asia/Seoul` date boundary has not been verified yet. The total-weight guidance for left-right and one-sided machines, and real UI verification of create → read → update → delete and refresh, are also needed in the implementation stage.
- The new tests check the service API and DB connection recreation. They do not replace a real PostgreSQL process restart or a browser refresh. No browser test tool was added.
- The full `npm run check` was not run in the test stage, which leaves failures expected before implementation. The required full check, the dedicated DB integration check, and the UI verification are needed after implementation.

### Test stage resumed: after the dedicated DB was provided (2026-10-15)

- Kept the test files and records left by the previous run and continued verification. In this run `TEST_DATABASE_URL` exists (`true`), and the existing and new integration tests actually ran by connecting to the dedicated DB. The connection value, credentials, and `.env` were not printed or recorded in documents. The DB-not-provided blocker above is resolved in this run.
- Added to `backend/test/workout-persistence.test.ts` an update that reduces the sets from 3 to 2, and a check of the remaining DB set count. The update check covers changing the exercise name, machine, weight, rep count, and note, and changing the order.
- Added to `backend/test/workout-validation.test.ts` rejection of a missing title and of a negative rep count. It checks 17 input-error cases each for POST and PUT, 34 in total.

Actual commands and results:

- `npm test` (before the additions): exit 1, 43 total / pass 38 / fail 5 / skip 0. The dedicated DB integration tests ran and reproduced the loss of set notes in create, update, and reconnect reads.
- `npx prettier --write backend/test/workout-validation.test.ts backend/test/workout-persistence.test.ts`: exit 0, no formatting changes in either file.
- `npm test` (final, after the additions): exit 1, 47 total / pass 42 / fail 5 / skip 0. The 5 failures are 1 set-note schema check, 3 DB sub-checks for create, update, and reconnect reads, and 1 parent check that aggregates those sub-failures. All come from the same implementation gap, where `notes` is missing. No expected failure was skipped and no assertion was weakened.
- The existing DB CRUD integration check, the new DB rollback and delete sub-checks, and the 34 input-error cases passed. The check that the DB set count is 2 after the update also passed before the note assertion. After reconnecting, the equality of the full read result passed, but the read that includes the expected set notes failed.
- `npm run typecheck -w backend`: exit 0.
- `npx eslint backend/test/workout-validation.test.ts backend/test/workout-persistence.test.ts --max-warnings 0`: exit 0.
- `npx prettier --check backend/test/workout-validation.test.ts backend/test/workout-persistence.test.ts docs/changes/16-agent-task.md`: exit 0.

Handoff to the implementation stage:

- The test stage has no external blocker. Implementation files were not changed and all files were left uncommitted.
- After adding set notes to the server, DB, and UI, run `npm test` and `npm run check`. A set-note migration that applies to the existing DB is also needed.
- Verification of the `Asia/Seoul` date boundary, the total-weight guidance for left-right and one-sided machines, browser CRUD and refresh, and a real PostgreSQL restart is still pending. The currently installed test tools have no browser or component runner, so none was added in this stage. The API and DB Pool recreation checks are not reported as a real DB process restart.
- The full `npm run check` was not run in the test stage, where the expected set-note failures remain. The required full check will run in the final implementation stage.

### Implementation stage (2026-10-15)

- Kept the prepared issue, branch, and worktree. Did not commit, push, open a PR, merge, or run additional agents. No separate earlier review result was passed on.
- Added an optional `notes` (up to 4000 characters, default empty string) to the server set schema and included it in the set INSERT inside the existing transaction. Requests from existing clients that send no notes are still accepted. Reused the existing create, update, delete, and rollback structure.
- `database/migrations/002_set_notes.sql`: adds the note column while preserving existing sets. Recorded the apply command for existing data in `database/README.md` and changed CI to apply all SQL files in order. The initial Docker volume runs both SQL files through the existing migrations directory mount.
- Added to the UI per-set note input and editing, and an expandable set record (exercise name, total weight, reps, machine, note). Weight display keeps up to two decimal places. Added guidance that for left-right simultaneous exercises the total is the sum of both sides, and for one-sided exercises it is the total weight moved on that side, plus a note prompt for an unconfirmed base weight.
- The default date is now calculated in `Asia/Seoul` regardless of the browser time zone. The period shift for the selected date keeps the existing calendar calculation.
- Did not modify the two test files received from the test stage. Confirmed that each SHA-256 matches the handoff value. No assertion was deleted or weakened and no skip was added.
- `backend/test/service-date.test.ts`: verifies the date functions the real UI uses just before and after Seoul midnight, at the year boundary, and at the leap-day boundary.
- `backend/test/set-notes.test.ts`: verifies the default when the note is omitted, its type and length limit, and that the migration preserves existing rows and preserves notes when reapplied. The DB checks use temporary tables and a transaction in the dedicated DB session.

Actual commands and results:

- `node -e "console.log('Dedicated test DB provided: '+Boolean(process.env.TEST_DATABASE_URL))"`: `true`. The connection value was not printed.
- `node --input-type=module -e "import {Pool} from 'pg'; import fs from 'node:fs'; if(!process.env.TEST_DATABASE_URL) { console.error('Dedicated TEST_DATABASE_URL missing'); process.exit(1); } const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL}); try { await pool.query(fs.readFileSync('database/migrations/002_set_notes.sql','utf8')); console.log('002_set_notes applied to dedicated test DB'); } catch {console.error('Dedicated test DB migration failed');process.exitCode=1;} finally {await pool.end();}"`: exit 0. Applied the new migration only to the provided dedicated test DB.
- `npx prettier --write backend/src/domain.ts backend/src/app.ts frontend/src/main.tsx frontend/src/date.ts frontend/src/style.css backend/test/service-date.test.ts database/README.md .github/workflows/ci.yml`: exit 0.
- `npm run check`: **exit 1**. Formatting, lint, and frontend/backend type checks passed, app tests **48 pass / 0 fail / 0 skip**, agent tests **34 pass / 0 fail / 0 skip**. After that, the frontend build failed while loading the Vite config, where esbuild reported `Cannot read directory "../../../../../../../..": Access is denied` and `Could not resolve .../frontend/vite.config.ts`. This is not reported as a successful full check.
- `npx prettier --write backend/test/set-notes.test.ts`: exit 0.
- `npm test` (after adding the migration regression test): **exit 0, 50 pass / 0 fail / 0 skip**. The dedicated DB CRUD, log and set notes, update rollback, delete cascade, reads after API and Pool recreation, and the new migration test all actually ran. The 5 note-related failures received in the handoff are resolved.
- `npm run build -w backend`: exit 0.
- `npm run lint`, `npm run typecheck`: exit 0 each.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/16 diff --check`: exit 0.
- After the final weight display and document updates, `npx prettier --write frontend/src/main.tsx docs/changes/16-agent-task.md`, `npm run format:check`, `npm run lint`, `npm run typecheck`: all exit 0. The last `diff --check` was also exit 0. The implementation and tests are uncommitted.

Blockers and remaining verification:

- **Full check blocked**: during the frontend build, esbuild's access to a parent directory is denied in the current filesystem sandbox. No attempt was made to change permissions or bypass the restriction. `npm run check` must be rerun in the coordinator's permitted verification environment.
- Real browser CRUD and refresh with screen evidence, and persistence after a PostgreSQL process restart, were not verified. No browser automation tool was provided and the Playwright dependency is not installed. No real DB service control was done. The passing API/Pool recreation tests are not reported as a substitute for browser or DB process restart verification.
- The existing production volume needs `002_set_notes.sql` applied before the new API runs. This task did not access the production DB, environment files, or credentials.

### Implementation stage resumed: final full check (2026-10-15)

- Reviewed the remaining implementation, tests, and documents as preserved. No separate earlier review finding was passed on. No further implementation change was needed, and this run did only the final verification and this record update.
- Read and applied `AGENTS.md`, `skills/workout-implementation/SKILL.md`, and `skills/workout-testing/SKILL.md` as UTF-8. Reused the prepared issue and branch, and did not commit, push, open a PR, merge, or run additional agents.
- Checked the two delivered test files with Node `fs.readFileSync` and `crypto.createHash('sha256')`. `workout-persistence.test.ts` is `496033317a704f3cafb32d668a8a29deac1e352e682b86b7ae1bf819536ebca0` and `workout-validation.test.ts` is `655115edce0e2d60852ec80ce89e52d978fd8641bf1f929e6acb777b49d16be8`, and both match the handoff values. Assertions and skip conditions were not changed.
- Existence check equivalent to `node -e "console.log('Dedicated test DB provided: '+Boolean(process.env.TEST_DATABASE_URL))"`: `true`. The connection value and credentials were not printed. This run used the already prepared dedicated DB and did not reapply the migration.
- `npm run check`: **exit 0**. Formatting, lint, frontend/backend type checks, app tests including the dedicated DB **50 pass / 0 fail / 0 skip**, agent tests **34 pass / 0 fail / 0 skip**, and frontend/backend production builds all succeeded. The esbuild parent directory access error recorded earlier did not reproduce in this run, and the full-check blocker is resolved. Permissions and build settings were not changed.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/16 diff --check`: exit 0.
- Real browser CRUD, refresh, screen evidence, and PostgreSQL process restart verification are still not done. No browser tool was provided, and the passing API/Pool recreation is not reported as real browser or DB process restart verification. The coordinator's final verification must confirm them. All changes were left uncommitted.
- After the record update, `npx prettier --check docs/changes/16-agent-task.md` and the `git diff --check` above: exit 0 each.

### Coordinator verification and P0 resumption (2026-10-15)

- At the user's request to assign importance and start implementation, applied priority:P0 to P3 labels to the 14 open issues. #16, #17, #19, and the MVP parent #20 are P0, and the actual implementation order is #16 → #17 → #19. #20 is a roll-up card and is not implemented separately.
- Kept the #16 worktree and the protected tests, and ran the host `npm run check` using only the dedicated test DB. App 50 pass / 0 fail / 0 skip, agent 34 pass / 0 fail / 0 skip, and formatting, lint, types, and frontend/backend builds all passed. The full log is in the ignored `.local/agent-workflow/jobs/16/coordinator-check.log`.
- Checked the real React screen using headless Chrome separated from the user's Chrome profile and a loopback verification app. Browser control, which had been the cause of the earlier review block, worked in the host execution environment. No new dependency was installed and the user's browser was not changed.
- ignored `.local/agent-workflow/browser-check-16.mjs create`: creating a log on screen (exercise, 42.5kg, 8 reps, set and log notes), reading after refresh, and checking the API-stored values after editing to 45kg, 9 reps and a set note all passed. The real app used the production build created in this full check.
- Actually restarted the verification API process and the dedicated PostgreSQL container `workout-memo-agent-test-db`. The first readiness check right after preparing the DB failed, and the API was rerun after confirming accepting connections. The data volume was preserved and the production DB was not accessed.
- ignored `.local/agent-workflow/browser-check-16.mjs persist-delete`: after the restart, confirming on the real screen that the edited values and set note were kept, and the on-screen delete and the API's delete confirmation, passed. Only the test log created by this checker was cleaned up. The earlier on-screen check failure before the server was ready was resolved by rerunning after the server was ready.
- This browser verification is limited to desktop Chromium. Mobile, other browsers, and screen capture evidence were not added. This is not a result of replacing real service restart with API/Pool recreation.
- For the issue updatedAt changed by applying the priority labels, after confirming that the title, body, number, URL, and state are identical to the previous snapshot, only the metadata was updated together with an audit record. Test hashes, review results, and stages were not manually approved or deleted. The implementation, independent review, host check, and PR stages resume through the standard retry procedure.

### Implementation stage resumed: response to the earlier review hold on verification (2026-10-15)

- The earlier review withheld approval with no code defect, because browser CRUD and refresh and real service restart verification were incomplete. Confirmed that the coordinator verification record above now adds the results of real Chromium create, read, update, and delete, refresh, and data preservation after restarting the API and the dedicated PostgreSQL container. This is not reported as a result of this implementation agent controlling the browser or services again. The independent review must judge this additional evidence.
- Re-reviewed the server, UI, migration, and related tests. Found no defect that needs a further implementation fix, so the existing changes were preserved and only the verification record was updated. Applied `AGENTS.md` and the implementation and testing skills, and did no issue, branch, commit, push, PR, approval, merge, or additional agent work.
- Checked only the existence of the dedicated `TEST_DATABASE_URL` with `node -e`: `true`. The connection value, credentials, and environment files were not printed or accessed.
- SHA-256 check using Node `fs` and `crypto`: the protected `backend/test/workout-persistence.test.ts` and `backend/test/workout-validation.test.ts` each matched the handoff hash. Assertions and skip conditions were not changed.
- `npm run check`: **exit 0**. Formatting, lint, frontend/backend type checks, app tests including the dedicated DB **50 pass / 0 fail / 0 skip**, agent tests **34 pass / 0 fail / 0 skip**, and frontend/backend builds all passed.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/16 diff --check`: exit 0. All changes were left uncommitted. The final approval decision is left to the independent review role.
