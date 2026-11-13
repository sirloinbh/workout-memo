# #17 feat: [MVP] View, statistics, and graphs of workout records by period

- Issue: https://github.com/sirloinbh/workout-memo/issues/17
- Branch: feat/17-agent-task

## Changes and verification

### Test phase — 2026-10-15

- Base SHA: `a0ce3245dddf8974f36054d01967ff21efbb5f29`.
- Read `AGENTS.md`, `workout-implementation`, and `workout-testing`, and reused the existing issue and branch. Changed only the tests and this record. Did not do any implementation, commit, push, or PR work.
- Added 18 behavior tests to the 4 existing tests. Did not add any new package or check command. The existing `npm test` runs the new tests.

#### Added verification

- `backend/test/period-ui.test.ts`: Transpiles the real frontend entry point with TypeScript and runs it in an isolated VM. Verifies displayed values and event handlers with a minimal React hook/element adapter and an in-memory API. It does not check the source text for a specific implementation shape.
- Compares the requested ranges against fixed expected dates for 1 day, a year-end week starting Monday/Sunday, a leap-year February and a year-end calendar month, and the last 28 days/84 days up to the reference date. Places data on the start and end dates of each range and on the days just before and after, and checks that the list, totals, and graph include or exclude it correctly.
- Checks the empty list, 0 days, 0 sets, 0 kg, and the 0 graph for every period. Several logs on the same day count as one day, and every set's total weight × reps is summed. Includes PostgreSQL numeric string forms and decimal weights.
- Changes the weight in the edit window, saves, and checks that the list data, statistics, and graph are refreshed. Deletes a record, including the last record, and checks that the day count, set count, volume, and empty state are refreshed.
- Checks that on a UTC device at `2026-10-14T15:30:00Z`, the reference date is the Seoul date `2026-10-15`.
- `backend/test/period-api.test.ts`: Verifies, with Express HTTP requests, an invalid calendar date, a YYYY-MM-DD format error, a missing end date, and a reversed range. An invalid range must be rejected with 400 before the repository is queried. The repository response is mocked, so this is not counted as DB integration verification.
- `backend/test/integration.test.ts`: When a dedicated DB is available, verifies a real API create → boundary query → date edit that moves the record out of the query range → delete. Checks the leap day, month end, year end, 28-day and 84-day boundaries, plus date strings and volumes. Cleans up only the IDs it created and does not delete all existing data.

#### Actual run results

| Command                                                                                                                                               | Result                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test` (before the additions)                                                                                                                     | exit 0; pass 3, fail 0, skip 1                                                                                                                                                 |
| `npx prettier --write backend/test/period-ui.test.ts backend/test/period-api.test.ts backend/test/integration.test.ts`                                | exit 0; applied formatting to the test files                                                                                                                                   |
| `node node_modules/prettier/bin/prettier.cjs --write backend/test/period-ui.test.ts backend/test/period-api.test.ts backend/test/integration.test.ts` | exit 0; applied final test formatting                                                                                                                                          |
| `npm run typecheck`                                                                                                                                   | final exit 0; frontend and backend both pass. During authoring, a type inference error on a response variable in a test was fixed with an explicit `Response` type, then rerun |
| `npm run lint`                                                                                                                                        | exit 0                                                                                                                                                                         |
| `npm test` (after the additions)                                                                                                                      | exit 1; pass 18, fail 2, skip 2                                                                                                                                                |
| `npm run check`                                                                                                                                       | exit 1; format:check, lint, and typecheck passed, then stopped at the tests with pass 18 / fail 2 / skip 2. The later test:agents and build were not run by this command       |
| `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`                                | exit 0                                                                                                                                                                         |

#### Failures before implementation and handoff to the implementation phase

1. Today's date in Seoul time: on a UTC device the actual value is `2026-10-14` and the expected value is `2026-10-15`. The screen's default reference date uses the device's local time zone. The service time zone `Asia/Seoul` must be applied.
2. Reversed query range: for `from=2025-01-05&to=2024-12-30` the actual HTTP status is 200 and the expected status is 400. The server must validate that start date ≤ end date.

These two failures were not skipped and no assertion was weakened. The import and type errors that came up while writing the test adapter were fixed, and the only final failures are the two user behaviors above.

#### Blockers and verification limits

- `TEST_DATABASE_URL` was not provided, so both the existing DB tests and the new DB tests are skipped. Real DB verification is blocked and is not reported as complete. After the implementation, a dedicated test DB with the schema prepared must be provided, and `npm test` and the final `npm run check` must be run again.
- The screen tests run the real components' displayed values and event handlers, but they do not use a DOM, a browser, or the real React scheduler. Layout, keyboard/focus, browser network race conditions, and a review of the real screen's per-date display remain separate. A mock API's filtering success is not counted as PostgreSQL filtering success.
- The Node version observed in this environment is `v22.17.0`, which differs from the project standard `24.21.0`. The tests ran, but they must also be confirmed on the specified runtime at final verification.
- After the implementation is complete, rerun the same tests and accumulate the post-fix results in this document. Commit, push, PR, and independent review are the coordinator's job.

### Test phase rerun — 2026-10-15

- Reviewed the 18 prepared tests and the 4 existing tests and reran them against the current implementation. Preserved the existing files and did not modify the implementation.
- A dedicated `TEST_DATABASE_URL` was provided for this run. The value was not printed or recorded. The DB-not-provided blocker from the earlier run is resolved in this run.
- `npm test`: exit 1; **pass 20, fail 2, skip 0**. Both real PostgreSQL integration tests passed. They verified inclusion of the period start and end dates and exclusion of adjacent days, date strings, decimal-weight volume, moving out of the range by an edit, and the query after a delete.
- `npm run check`: exit 1; format:check, lint, and frontend/backend typecheck passed, then it stopped at the tests with the same **pass 20, fail 2, skip 0**. The later test:agents and build were not run.
- The 2 failures before implementation are the same as in the earlier run: HTTP 200 for a reversed query range (expected 400), and the default date `2026-10-14` on a UTC device (expected Seoul date `2026-10-15`). The test failures are kept as they are and handed to the implementation phase.
- The current runtime is `v22.17.0`. Verification on the project-specified Node `24.21.0` and in a real browser still remains.

### Implementation phase — 2026-10-15

- Reused the existing issue, branch, and tests. Did not change the test files or assertions, and modified only the implementation and docs in this worktree. Commit, push, PR, and independent review are handed off to the coordinator.
- `frontend/src/main.tsx`: Gets the default reference date from `Intl.DateTimeFormat` with the explicit `Asia/Seoul` time zone. Period boundaries, previous/next period navigation, and graph intervals are unified on UTC calendar arithmetic, which removes the influence of the device time zone and daylight saving time. The date label also shows the weekday of the same calendar date.
- `backend/src/app.ts`: If the query start date is later than the end date, it is rejected with HTTP 400 before the DB query. The existing date format and real calendar date validation are kept.
- Reused the existing behavior for the per-period list, statistics, graph, and re-query after edit/delete. The existing behavior tests confirmed the boundaries and empty state for 1 day, 1 week starting Monday, a calendar month, and the last 28 days/84 days, the summing of several logs on the same day, and the update of statistics/graph after an edit or delete.

#### Actual run results

| Command                                                                                                                | Result                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                                                                             | exit 0; pass 22, fail 0, skip 0. Includes the 2 dedicated-DB integration tests. Both failures from before the implementation are resolved                                    |
| `npm run check`                                                                                                        | exit 0; format:check, lint, and frontend/backend typecheck passed, app tests pass 22 / fail 0 / skip 0, test:agents pass 34 / fail 0 / skip 0, frontend/backend build passed |
| `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check` | exit 0                                                                                                                                                                       |

- Used only the provided `TEST_DATABASE_URL`. The value was not viewed, printed, or recorded. There is no DB-related blocker.
- The runtime used is Node `v22.17.0`. Did not run on the project-specified Node `24.21.0`, and did not verify real browser layout, focus, or network race conditions. The existing UI behavior tests verify component events in an isolated VM and are not counted as browser verification.

### Review finding fix — 2026-10-15

- Fixed the review's P2 finding (a late response for a previous period overwrote the currently selected period). In `frontend/src/main.tsx`, a request number that increases with every query is kept in a ref, and only the latest request updates the raw data, errors, and loading state of the list, statistics, and graph. The server API and the earlier period-calculation fix are kept.
- Added to `backend/test/period-ui.test.ts` an in-memory API control that can hold responses and complete them in any order. Kept the existing tests and assertions.
- Added 3 regression tests: an earlier successful response does not overwrite the latest list, statistics, and graph; an earlier failed response does not show an error on the current screen; and an earlier response does not clear the loading state of the latest query.
- In the reproduction before the fix, the latest March 1 value of 2,000kg was replaced by the earlier February 29 value of 1,000kg. The error and loading regressions also failed before the fix and passed after it.

#### Actual run results

- `node node_modules/tsx/dist/cli.mjs --test backend/test/period-ui.test.ts`: before the fix exit 1; pass 16, fail 3, skip 0. After the fix exit 0; pass 19, fail 0, skip 0.
- `node node_modules/prettier/bin/prettier.cjs --write frontend/src/main.tsx backend/test/period-ui.test.ts`: exit 0; no formatting changes.
- `npm run check`: exit 0; format:check, lint, and frontend/backend typecheck passed, app tests pass 25 / fail 0 / skip 0 (including the 2 dedicated-DB integration tests), worker tests pass 34 / fail 0 / skip 0, frontend/backend build passed.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`: exit 0.
- The tests used only the provided dedicated `TEST_DATABASE_URL`, and the value was not printed or recorded. There is no DB blocker.
- Verified by reversing the response order in the VM instead of in a real browser. Real browser and specified Node version verification is still not run. All changes are left uncommitted and handed to the coordinator for verification and independent review.

### Test phase recheck — 2026-10-15

- At the start of this test phase, the response-order protection implementation and the 3 regression tests were already in the working tree. Preserved the existing tests, assertions, and implementation, and did not add duplicate tests. The only change in this phase is this run record, and no commit, push, or PR work was done.
- The existing regression tests verify, respectively, that an earlier successful response does not overwrite the list, statistics, and graph, that an earlier failed response does not show an error, and that an earlier response does not clear loading while the latest request is pending. The failures before the fix are recorded in the phase above, and this run did not revert the implementation to reproduce them.
- `npm test`: exit 0; **pass 25, fail 0, skip 0**. The 3 response-order regressions and the 2 dedicated PostgreSQL integration tests all passed. The provided dedicated `TEST_DATABASE_URL` was used only to run the tests, and the value was not viewed, printed, or recorded.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`: exit 0 (before the doc was added).
- Because there are no implementation or test changes, did not repeat the already recorded full `npm run check`. This phase did not verify in a real browser or on the specified Node version. There was no execution blocker.

### Implementation phase recheck — 2026-10-15

- Confirmed that the earlier review's P2 fix and the 3 response-order regression tests already exist. The latest request number protects the successful data, the error, and the loading state. Preserved the existing implementation, tests, and assertions without modification. This phase only added the verification record.
- `npm run check`: exit 0; format:check, lint, and frontend/backend typecheck passed, app tests pass 25 / fail 0 / skip 0 (including the 2 dedicated PostgreSQL integration tests and the 3 response-order regressions), worker tests pass 34 / fail 0 / skip 0, frontend/backend build passed.
- `node node_modules/prettier/bin/prettier.cjs --check docs/changes/17-agent-task.md` and `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`: exit 0.
- The tests used only the provided dedicated TEST_DATABASE_URL, and the value was not viewed, printed, or recorded. There was no execution blocker.
- Did not verify in a real browser or on the project-specified Node version in this phase. All changes are kept uncommitted, and independent review, commit, push, and PR are left to the coordinator.

### Second review finding fix — 2026-10-15

- P2 finding: if the reference date was changed after a delete request was sent, then when the delete completed, the previous period's `refresh` got a new request number and overwrote the current list, statistics, and graph. Saving an edit used the same shared `action` and had the same problem.
- `frontend/src/main.tsx`: In the period query effect, the latest `refresh` is kept in a ref, and that latest function is called after a mutation request completes. It keeps the existing response-number protection and re-queries the currently selected period after a delete or save.
- `backend/test/period-ui.test.ts`: Added an in-memory API control that can hold PUT/DELETE completion, and 2 regression tests. They verify a date change while a delete is pending, and a date and period change while an edit save is pending. After completion they check the re-query of the current period, the list, workout days, set count, volume, the graph, and that there is no error. Preserved the existing tests and assertions.
- Before the fix, both tests failed because they re-queried the previous `2024-02-29`. After the fix, they query the daily or March monthly range for the currently selected `2024-03-01`.

#### Actual run results

- `node node_modules/tsx/dist/cli.mjs --test backend/test/period-ui.test.ts`: before the fix exit 1; pass 19, fail 2, skip 0. Right after the implementation fix exit 1; pass 20, fail 1, skip 0. The remaining failure was the new monthly test wrongly expecting the individual log volume of 3,000kg instead of the total of 5,000kg for the same graph interval. Corrected that expected value to the fixed data's total of 5,000kg, and did not change any existing assertion.
- `node node_modules/prettier/bin/prettier.cjs --write frontend/src/main.tsx backend/test/period-ui.test.ts`: exit 0; no formatting changes.
- First `npm run check`: exit 1; format:check, lint, and typecheck passed, app pass 26 / fail 1 / skip 0 (the new graph expectation error above), worker and build not run.
- Final `npm run check` after the expected-value fix: exit 0; format:check, lint, and frontend/backend typecheck passed, app **pass 27 / fail 0 / skip 0** (including the 2 dedicated PostgreSQL integration tests and the 2 new regressions), worker **pass 34 / fail 0 / skip 0**, frontend/backend build passed.
- After the doc update, `node node_modules/prettier/bin/prettier.cjs --check docs/changes/17-agent-task.md` and `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`: exit 0.
- The tests used only the provided dedicated `TEST_DATABASE_URL`, and the value was not viewed, printed, or recorded. There was no execution blocker.
- `node --version`: `v22.17.0`. Did not verify in a real browser or on the specified Node `24.21.0`. The VM's event and response-order verification is not counted as browser verification.
- The changes were kept uncommitted in this worktree. Did not create an issue or branch, commit, push, open a PR, approve or merge, or run additional agents.

### Test phase final recheck — 2026-10-16

- Read `AGENTS.md`, `workout-implementation`, and `workout-testing`, and reused the prepared issue, branch, and tests. Tests for period boundaries, the empty state, statistics, graph, edit/delete, and response order already exist, so did not add duplicates. In this phase did not change the implementation or tests and only added the run record.
- Confirmed the 2 regression tests that re-query the currently selected period after a delayed delete or edit completes. Also kept the existing 3 response-order regressions. The failures before the fix are the observation record of the implementation phase above, and this phase did not revert the implementation to reproduce them.
- `npm test`: exit 0; **pass 27, fail 0, skip 0**. The 2 new regressions and the 2 real PostgreSQL integration tests all passed. The tests used only the provided dedicated `TEST_DATABASE_URL`, and the value was not viewed, printed, or recorded. There was no execution blocker.
- `node node_modules/prettier/bin/prettier.cjs --check docs/changes/17-agent-task.md`: exit 0. `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`: exit 0 both before and after the doc was added.
- Because there are no implementation or test changes and the previous implementation phase's full check passed, this phase did not repeat `npm run check`. Did not verify in a real browser or on the specified Node version. All changes were kept uncommitted.

### Implementation phase final recheck — 2026-10-16

- Confirmed that the fix for the earlier P2 finding is already applied in the prepared implementation. When a mutation completes, the currently selected period is re-queried with `latestRefresh.current()`, and the query response number prevents an earlier success, failure, or loading completion from overwriting state. No further implementation change was needed, so the existing code and assertions were preserved.
- Checked the hashes of the 3 test files with Node's SHA-256, and all were identical to the test-phase hashes that were handed over. The only change in this phase is this work record.
- `npm run check`: exit 0; format:check, lint, and frontend/backend typecheck passed, app **pass 27 / fail 0 / skip 0** (including the 2 dedicated PostgreSQL integration tests and the 5 response-order regressions), worker **pass 34 / fail 0 / skip 0**, frontend/backend build passed.
- Used only the provided dedicated `TEST_DATABASE_URL` in the tests, and did not view, print, or record the value. There was no DB, dependency, or execution-permission blocker. A read-only Git status query showed a warning about access to the global ignore file, but the query completed with exit 0 and no setting was changed.
- The runtime confirmed with `node -e` is `v22.17.0`. Did not verify in a real browser or on the specified Node `24.21.0`. The changes are uncommitted, and independent review, commit, push, and PR are the coordinator's job.
- After the doc update, `node node_modules/prettier/bin/prettier.cjs --check docs/changes/17-agent-task.md` and `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/17 diff --check`: both exit 0.

### Review follow-up after PR creation — 2026-10-16

- The user approved the browser verification and the PR description correction that were suggested in the additional code review of PR #40. Did not change the app code, tests, or skills.
- App commit verified: `1a7c6483c591f46c8190dce53b05d517e57a6322`. Used that commit's production build, a dedicated PostgreSQL test DB, a loopback server, and headless Chrome separated from the user profile.
- `node .local/agent-workflow/browser-check-17.mjs` (repository root, ignored checker): final exit 0. On PC 1440×1000 and mobile emulation 390×844, confirmed on the real screen the period boundaries for 1 day, 1 week starting Monday, a leap-year February, and the last 28 days/84 days, the cumulative volume and graph, and no horizontal overflow. At mobile size, confirmed that after editing 200→250 kg the volume changed 3,000→3,500 kg and the graph updated, that it was preserved after a reload, that it was 1,000 kg after a delete, and that an empty date showed 0 statistics and an empty graph.
- In the first run, all screen checks passed, but in the cleanup step it exited with 404 because it deleted again a fixture that had already been deleted through the UI. Allowed a 404 on the cleanup DELETE in the ignored checker, cleaned up the remaining fixtures, and reran the whole thing, which passed. It is not counted as an app error. Deleted only the fixtures this check created.
- Kept the screen captures `browser-desktop.png` and `browser-mobile.png` in the ignored `.local/agent-workflow/jobs/17/` and checked them directly. Verification on a real mobile device, Safari, Firefox, touch, and focus movement is not included. The captures and the checker are local evidence and were not uploaded to GitHub.
- The PR body is updated to reflect the final publication/CI state and the verification scope above. The earlier phases' records of being uncommitted and not browser-verified are kept as the history of that time. The user merges the PR.
- Host final recheck: `npm run check` exit 0 with the specified Node `24.21.0`, npm `11.19.0`, and the dedicated `TEST_DATABASE_URL`. Format, lint, and type checks, app **27 pass / 0 fail / 0 skip** (including the 2 DB integration tests), worker **34 pass / 0 fail / 0 skip**, and frontend/backend builds all passed. Log: ignored `.local/agent-workflow/jobs/17/post-review-check.log`. Because only docs were added, no new app test code was added.

### Latest main conflict resolution and merge request — 2026-10-16

- The user explicitly requested conflict resolution and an agent merge for this PR. This request applies as merge approval for PR #40 and is not extended to other PRs.
- Integrated the latest `origin/main` (`af45c3885d5a884e631391733419db6243454069`) into the working branch. In `frontend/src/main.tsx`, the only conflict, kept together main's shared `seoulDate()` and #17's UTC calendar arithmetic and latest-query-response protection. Also preserved main's set memo and two-decimal-place display.
- Connected the UI tests' module adapter so it reads the real `frontend/src/date.ts` in the isolated VM. Also handled a checker recursion problem where a child element omitted in main's memo UI restarted the root traversal. Did not delete or weaken any existing assertion or test. UI regression tests 21 pass / 0 fail / 0 skip.
- The first full check stopped on a formatting difference. After the formatting cleanup, the check reproduced the UI traverser recursion error, and after the fix the UI check and the final full check were run again. The intermediate failures are not hidden behind the final success.
- Final host `npm run check`: exit 0 with the specified Node 24.21.0 / npm 11.19.0 and the dedicated DB. App **109 pass / 0 fail / 0 skip**, worker **86 pass / 0 fail / 0 skip**, and format, lint, type, and frontend/backend builds passed. This also includes the increase in tests brought in from main. Log: ignored `.local/agent-workflow/jobs/17/merge-check.log`.
- `node .local/agent-workflow/browser-check-17.mjs` on the new integrated build: exit 0. The five periods, statistics, graph, and screen width for PC and mobile emulation, and mobile edit, reload, delete, and empty state passed again. Verification on a real mobile device is not included.
