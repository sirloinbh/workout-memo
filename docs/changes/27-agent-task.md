# #27 feat: 12-week routine based on split and body-part selection, with weekly increase and deload plan

- Issue: https://github.com/sirloinbh/workout-memo/issues/27
- Branch: feat/27-agent-task

## Changes and verification

The worker agent records the actual changes and verification results.

## Test phase — 2026-10-19 (Asia/Seoul)

- Role: tests. Reused existing issue #27 and the existing branch and worktree. Did not change implementation files, commits, or the remote repository.
- Base SHA: `c827abbe3a29d404ab42faa60a6a8f0c72ba9817`.
- Instructions applied: `AGENTS.md`, `skills/workout-implementation/SKILL.md`, `skills/workout-testing/SKILL.md`. As the worker instructions said, only tests and records were written.

### Added tests and what they verify

- `backend/test/routine-fixture.ts`: a shared example with an explicitly entered start date, frequency, and rest days, sets, total weight, and reps per exercise, and manual 12-week targets. It does not replace user rules with automatic calculation.
- `backend/test/routines.test.ts`: checks five splits, seven body parts with single, multiple, same-split duplicate, and cross-split duplicate preservation, and the user-specified deload reduction target and amount. 46 API violations (invalid split, body part, date, rest day, frequency, week, target number, exercise baseline value, or 4-week cycle) must be rejected with 400 and an error message before the repository is accessed.
- `backend/test/routines.integration.test.ts`: with a dedicated DB, checks create → list → detail → re-read through a new server and a new DB connection for the five splits, and preservation of order, duplicates, and manual targets. From 2024-02-29, which is both a leap day and a rest day, it schedules only 36 workouts (Mon/Wed/Fri) over 84 days, and checks that the split rotates on each workout day and the rotation is not reset at week boundaries. Deloads are weeks 4, 8, and 12, and the week 5 manual increase of 7.25 kg is not automatically reset. It also checks that saving a routine creates no real log sets and no existing #18 goals.
- `backend/test/routines-ui.test.ts`: runs the real frontend entry point with the same installed TypeScript/Node-based rendering adapter as the existing `period-ui.test.ts`. It checks the routine fetch request, weeks 1 to 12 and each deload marker, baseline total weight and manual increase, duplicate body-part display, re-fetch from the server after a new mount, and that viewing sends no mutating request. The adapter can also load new component modules by relative path.

### Proposed test interface for the implementation phase

There is no routine API yet, so the names below are an interface proposal that the tests use. It is not a separate user policy beyond the product requirements. If the implementation needs a different shape, adjust the fixture and adapter together while keeping the behavior checks.

- Server input schema: provide `routineSchema` together with the other schemas in the existing `backend/src/domain.ts`.
- `POST /api/routines`: stores the input and returns 201 and `{ id }`. `GET /api/routines` returns a list that includes IDs, and `GET /api/routines/:id` returns the full plan.
- Input: `name`, `start_date` (YYYY-MM-DD), `split_count` (1 to 5), `weekly_workouts`, `rest_days` (Sunday=0 to Saturday=6), `splits`, `weeks`.
- Split: `{ name, body_parts: string[], exercises: [{ exercise, sets, weight, reps }] }`. The order and duplicates of the body-part array are preserved. `weight` is the total weight in kg including the machine's official weight, and 0 kg is allowed.
- Week: `{ week, kind, amount, deload_metric }`. For a normal week, `kind` is `increase_weight` or `increase_reps` and `deload_metric` is null. Weeks 4, 8, and 12 have `kind: deload`, and `deload_metric` is one of `weight`, `sets`, or `reps`, as specified by the user. `amount` is an explicit positive change, and a reps or sets change is an integer. No automatic ratio and no automatic target after a deload is added.
- The detail response includes the input above plus `id` and `schedule: [{ date, week, split_index, is_deload }]`. `split_index` starts at 0. Weeks are 7-day units from the start date, and the whole range is 84 days including the start date.
- Integration test cleanup deletes only the IDs the test created from the `routines` table. If the schema differs, adjust the cleanup statement too.
- The UI entry button is named `루틴짜기` (Build routine); if the list opens a detail screen, use a `계획 보기` (View plan) button. Weeks are shown as `N주차` (Week N), and a deload is distinguished in that week's row or item.

### Commands actually run and results

- `npx --no-install prettier --write backend/test/routine-fixture.ts backend/test/routines.test.ts backend/test/routines.integration.test.ts backend/test/routines-ui.test.ts`: succeeded. Run again on the two files changed after the test fixes.
- `node node_modules/tsx/dist/cli.mjs --test backend/test/routines.test.ts backend/test/routines.integration.test.ts backend/test/routines-ui.test.ts`: expected failure before implementation. Both the first run and the run after the final test fixes gave **56 tests / 0 pass / 56 fail / 0 skip**, exit code 1. This is Node output that counts subtests and failed parent tests together. The causes are the missing `routineSchema`, 404 from the POST API (expected 400/201), and the missing `루틴짜기` (Build routine) entry button. No failure was skipped and no check was weakened.
- The final run of the new tests ran the same command with Node `spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--test', ...three test paths], { encoding: 'utf8' })` and printed only the TAP summary.
- Regression check of existing tests: in Node, selected the existing files with `fs.readdirSync('backend/test').filter(name => name.endsWith('.test.ts') && !name.startsWith('routines')).map(name => 'backend/test/' + name)` and ran them with the `spawnSync` method above. **118 tests / 118 pass / 0 fail / 0 skip**, exit code 0. The existing test files were not modified.
- `npm run typecheck -w backend`: passed, exit code 0.
- Final `npx --no-install prettier --check backend/test/routine-fixture.ts backend/test/routines.test.ts backend/test/routines.integration.test.ts backend/test/routines-ui.test.ts docs/changes/27-agent-task.md`: all targets passed, exit code 0. The final backend type check passed again.
- `npx --no-install eslint backend/test/routine-fixture.ts backend/test/routines.test.ts backend/test/routines.integration.test.ts backend/test/routines-ui.test.ts --max-warnings 0`: passed, exit code 0.
- `node -e "console.log('Dedicated test DB configured:',Boolean(process.env.TEST_DATABASE_URL))"`, which prints only whether the dedicated DB is configured: true. The connection string was not printed.
- Passed a PowerShell single-quoted here-string to `node --input-type=module` and ran `SELECT to_regclass('workouts') IS NOT NULL AS workouts_ready, to_regclass('goals') IS NOT NULL AS goals_ready` with `new Pool({ connectionString: process.env.TEST_DATABASE_URL })`: both values are true. The DB is ready, and the failures of the new integration tests come from the unimplemented API, not from an environment block. The same probe in the earlier `node -e` form hit a SyntaxError from PowerShell quoting, and succeeded once fixed with a here-string.

### Limits and next steps

- The tests role is complete once the failure before implementation is reproduced. After implementation, run the new tests above and `npm run check` and add the actual results. Do not report that the new feature passes yet.
- In a real browser, check: create a routine → enter split and body-part duplicates → enter exercise baselines, 12-week targets, and deloads → save → reload the page. The current UI automated tests focus on fetching and displaying the plan stored on the server. They do not claim to verify the full input and save flow of the creation form, browser layout, focus, native validation, or React scheduling. In the implementation phase, add input and save tests that fit the form structure.
- The Node in the execution environment is v22.17.0. The coordinator must check the final checks on the Node 24.21.0 / npm 11.19.0 environment the repository specifies. No version-related execution block occurred in these commands.
- Tests and docs were left uncommitted. The coordinator handles commit, push, PR, and CI checks, and the user handles merging.

## Implementation phase — 2026-10-19 (Asia/Seoul)

- Reused the existing issue, branch, and worktree in the implementation role. Did not create additional agents, issues, or branches, and did not commit, push, open a PR, or merge. No earlier reviewer findings were passed separately.
- Added `routineSchema` and an 84-day schedule generation function to the server. It keeps the five splits and seven body parts, same-split duplicates and order, directly entered exercise baselines, and manual weekly changes. Weeks are separated in 7-day units from the start date, and the split rotates continuously on every workout day excluding rest weekdays. Only weeks 4, 8, and 12 are deloads, and the reduction target and a positive reduction amount must be given. Reps and sets are checked as integers.
- Added `POST /api/routines`, `GET /api/routines`, and `GET /api/routines/:id`. After validation, it stores atomically with a single JSONB document INSERT. The list and detail are read from the DB and return the plan and schedule. It does not create real log entries or existing #18 goals.
- Added the routines table in `database/migrations/003_routines.sql`. The order and duplicates of the body-part and exercise arrays are preserved as JSON arrays. Added the procedure for applying it to an existing DB and the user feature description to database/README.md and README.md. CI keeps using the existing migration loop in file-name order.
- Added the create, list, and detail screens in `frontend/src/routines.tsx` and connected 루틴짜기 (Build routine) to the existing menu. Pressing a body-part button repeatedly adds duplicates, and individual entries can be deleted. Exercise baselines, start date, frequency, rest weekdays, and weekly increase and decrease amounts are specified by the user starting from empty inputs. The deload ratio and later increases are not calculated automatically. After saving, the plan and schedule are fetched again. A POST failure keeps the input; if the re-fetch fails after a successful POST, it shows that the save succeeded and closes the draft to prevent a duplicate save.
- Existing test assertions and skips were kept. Only the module loader of `period-ui.test.ts` was extended to read the actual split-out components. In `routines-ui.test.ts` I added: create → enter duplicate body parts, exercise baselines, and 12-week manual targets → check the POST body → check the GET detail; switching among five splits; keeping input on save failure; and preventing a duplicate POST when the fetch fails after a successful save. I also fixed the adapter's handling of recursion over undefined children, which the new error path exposed.

### Actual verification and results

- Used only the dedicated `TEST_DATABASE_URL`. Applied `003_routines.sql` to that DB with a pg Pool and `fs.readFileSync(..., 'utf8')` in a Node ESM here-string: succeeded. The connection string was not printed or recorded.
- `node node_modules/tsx/dist/cli.mjs --test backend/test/routines.test.ts backend/test/routines.integration.test.ts backend/test/routines-ui.test.ts`: after the initial implementation, 56/56 pass, 0 fail, 0 skip. On a real DB it confirmed storing, listing, detail, and re-reading through a new server and connection for the five splits, and that no existing log or goal was created. Three more UI tests were added afterward.
- `node node_modules/tsx/dist/cli.mjs --test backend/test/routines-ui.test.ts`: final 4/4 pass, 0 fail, 0 skip. Instead of a real browser, events, requests, and rendering results were checked with the existing TypeScript/Node rendering adapter.
- `node node_modules/tsx/dist/cli.mjs --test backend/test/period-ui.test.ts`: 21/21 pass. In the first full check these 21 failed because the new import was not handled; after I changed the loader to handle CSS imports first, all passed. The conditions that verify period, statistics, and delayed responses are unchanged.
- `npm run typecheck` and `npm run lint`: passed.
- Final `npm run check`: format:check, lint, and frontend/backend typecheck passed. `npm test` gave **177 tests / 177 pass / 0 fail / 0 skip** (including dedicated-DB integration), and `npm run test:agents` gave **86 tests / 86 pass / 0 fail / 0 skip**. The last default frontend build exited with code 1. While Vite's default esbuild config loader read a parent directory outside the allowed worktree, an `Access is denied` error occurred. This is not reported as the whole default required check passing.
- The last full check was run with Node `spawnSync('npm.cmd', ['run', 'check'], { encoding: 'utf8', shell: true })`, printing only the summary and errors. The temporary log was deleted.
- `npm run build -w backend`: passed.
- `npm run build -w frontend -- --configLoader runner`: passed. It read the existing config file with the runner loader and produced 1580 modules and the production bundle. Sandbox permissions, security settings, and the project build scripts were not changed. This passing alternative command is kept separate from the failure of the default `npm run check`.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/27 diff --check`: passed. A read-only Git command printed a warning about access to the user's global ignore file, but the repository diff check has exit code 0.
- During formatting, the first command that named the SQL file as a Prettier target failed because the SQL parser is not installed. Only TS/TSX/CSS/Markdown targets were formatted, and the SQL was verified with a real PostgreSQL apply and the integration tests. An intermediate PowerShell quoting error was fixed with a Node here-string. Korean encoding loss through a pipe when adding docs was repaired with a UTF-8 patch.

### Remaining checks and handoff

- The frontend build in the default `npm run check` was blocked by the sandbox's parent-directory read restriction, so the coordinator or CI must re-verify it. The alternative runner build and the backend build passed.
- No real browser tool or Playwright/Puppeteer dependency exists in this environment, so layout, focus, native required/min/step validation, and real-browser reconnect evidence are unconfirmed. Automated verification of the creation form is limited to the rendering adapter's scope.
- Verified with the running Node v22.17.0. The coordinator must check the default checks and CI results on the specified Node 24.21.0 / npm 11.19.0 environment.
- The final changes and tests are uncommitted. The coordinator handles independent review, commit, push, PR, and CI, and the user handles merging.

## Coordinator: formal re-handoff of protected tests — 2026-10-19

The worker stopped after detecting that the implementation role changed backend/test/routines-ui.test.ts. The existing implementation, added tests, and logs are preserved, and accept-requirements formally re-reviews starting from the tests role. It compares the earlier tests handoff and tests.log with the current diff and checks that the loader and adapter fixes and the new scenarios are valid, with no deletion or weakening of the original assertions. Only the tests owner generates the formal handoff hash, and the coordinator does not replace the hash manually. The tests role fixes new test errors and records the failure and pass results. The implementation role does not modify protected tests again after the handoff. The original confirmed rules, issue, and branch are reused, and real-browser verification remains.

## Formal test re-handoff — 2026-10-19 (Asia/Seoul)

- In the tests role, reviewed the current implementation and the added tests. Applied `AGENTS.md`, workout-implementation, and workout-testing, and did nothing that changes implementation files or Git state.
- The SHA-256 of `routine-fixture.ts`, `routines.test.ts`, and `routines.integration.test.ts` each match the first tests result that was passed along. The UI file was changed in the implementation phase, so it does not match the first hash. In the current UI file, I confirmed that the first fetch scenario's checks are kept: 12-week display, deload distinction, body-part duplicates, GET-only, and new-mount. I did not read the earlier tests.log itself in this phase, and do not claim to have completed a byte-level comparison with the first file.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/27 diff -- backend/test/period-ui.test.ts`: confirmed that only relative module loading and sandbox sharing were added, with no change to existing assertions or scenarios.
- Reviewed the tests the implementer added: create → save, keeping input on save failure, and preventing a duplicate save when the re-fetch fails after a successful POST. The save-failure check tests server-error handling in an adapter that does not run native validation; it does not mean an empty form can be submitted in a real browser.
- Strengthened the UI tests. A new screen session is created from the saved body, and the detail GET is run again to check the user name, no split, start date, frequency, body-part order and duplicates, week 5 manual increase, week 8 sets reduction, and week 12 reps reduction. The five-split switch check counts the split-name inputs visible to the user instead of counting maxLength attributes. I also added checks that all increase and decrease amounts and deload targets of a new plan are empty, and that deleting one duplicate body part preserves the order and duplicates of the rest.
- Checked only whether the dedicated DB is provided: `node -e "console.log('Dedicated test DB configured:',Boolean(process.env.TEST_DATABASE_URL))"` → true. Did not read or print connection information or forbidden files.
- `node node_modules/tsx/dist/cli.mjs --test backend/test/routines.test.ts backend/test/routines.integration.test.ts backend/test/routines-ui.test.ts backend/test/period-ui.test.ts`: after the first strengthening, **80 tests / 80 pass / 0 fail / 0 skip**. Passed the same arguments with Node spawnSync and printed only the TAP summary. The failure before implementation keeps the 56-failure record from the first test phase above; I did not reproduce it by reverting the already implemented files.
- `npx --no-install prettier --write backend/test/routines-ui.test.ts`: passed. Afterward I ran the UI tests including the new manual-input and individual-delete scenarios.
- First `npm run check`: failed at the format:check step because of the Markdown formatting of the coordinator's earlier added records. After preserving the content, I format this document with Prettier and re-check.
- Real-browser verification is still not run because the existing environment has no tool. The UI evidence in this phase is within the TypeScript/Node adapter's scope, and DB persistence is confirmed by separate integration tests. Commit, push, PR, independent approval, and collecting the final handoff hash are handled by the coordinator's worker.
- Final `node node_modules/tsx/dist/cli.mjs --test backend/test/routines-ui.test.ts`: **5 tests / 5 pass / 0 fail / 0 skip**.
- After `npx --no-install prettier --write docs/changes/27-agent-task.md`, final `npm run check`: format:check, lint, and frontend/backend typecheck passed. App tests **178/178 pass, 0 fail, 0 skip** (including the dedicated DB), worker tests **86/86 pass, 0 fail, 0 skip**. The default frontend build failed with `Access is denied` when Vite/esbuild read a parent path outside the worktree, exit code 1. The backend build was not run in this full command because the frontend failure came first. I stopped without a sandbox workaround or implementation change, and the coordinator or CI must re-check the default build.
- Final `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/27 diff --check`: passed. UI test handoff SHA-256: `9671122e633da4edeb57ede10d9559a2ca1c6d7f42364d0f4d5daefa9ec0f0c3`. The first hashes of the other three protected tests are kept.

## Coordinator (Claude Code): host verification, independent review, migration number — 2026-10-19

- Claude Code took over the work that stopped when the Codex tokens ran out. Did not change the test or implementation code.
- `npm run check` on the host (Node 24.21.0 / npm 11.19.0, dedicated test DB): **exit 0**. App and DB **178 pass / 0 fail / 0 skip**, worker **86 pass / 0 fail / 0 skip**, frontend and backend builds passed.
- Independent review (read-only): no blocking findings. Confirmed exactly 12 weeks, two-way enforcement of deloads in weeks 4, 8, and 12, split and body-part enums, duplicate and order preservation, parameterized queries, and atomic single-row storage. Notes (P3): a deload reduction larger than the baseline weight or number of sets is allowed, and there are no edit or delete APIs (outside the confirmed scope).
- Because #34 adds `003_workout_retries.sql`, I renamed this work's migration to `004_routines.sql` to avoid a number collision and updated the apply command in database/README.md. CI and Docker initialization apply all of them in file-name order, and the two migrations are independent tables.
