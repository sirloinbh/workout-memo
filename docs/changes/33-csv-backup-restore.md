# #33 feat: CSV export and versioned backup and restore

- Issue: https://github.com/sirloinbh/workout-memo/issues/33
- Branch: feat/33-csv-backup-restore (reused the worktree the coordinator prepared; no new issue or branch was created)

## Purpose

Download workout records as a CSV for spreadsheet analysis, and restore them safely, with relationships preserved, from a versioned JSON backup in the app's own format. The CSV for analysis and the backup for restore are clearly separated. Importing CSVs from other apps and scheduled cloud backups are excluded.

## Changes

- `backend/src/backup.ts` (new): a CSV encoder (no external dependencies), the backup v1 schema (Zod) and reference validation, and the export, preview, and restore routes.
  - `GET /api/export/workouts.csv[?from&to]`: UTF-8 BOM, RFC 4180, CRLF, one row per set. A `'` is put before text values that start with a formula character (`=`, `+`, `-`, `@`, tab, CR). NULL is an empty cell.
  - `GET /api/backup`: `{ format: "workout-memo-backup", version: 1, exported_at, data: { brands, machines, workouts(sets nested), goals, routines } }`. It reads from a single REPEATABLE READ READ ONLY snapshot.
  - `POST /api/backup/preview` / `POST /api/backup/restore`: body `{ mode: merge|replace, backup, confirm? }`. It runs the same procedure in one transaction; preview does ROLLBACK and restore does COMMIT. An error midway rolls everything back and returns 500 `복원 중 오류가 발생해 전체 취소했습니다…` (An error occurred during restore, so everything was cancelled…).
- `backend/src/app.ts`: registered the backup routes before the app-wide 256kb JSON parser so only the backup allows up to 10MB (+64KB). Added the 413 error message.
- `frontend/src/backup.tsx` (new), `main.tsx`: the `백업·내보내기` (Backup and export) menu. CSV and JSON download links, a policy notice, file selection → size (10MB) and JSON parse check → server preview summary (added, skipped, conflicts, deleted) → `복원 실행` (Run restore). For a full replace, the button stays disabled until the confirmation text `전체 교체` (Replace all) is typed. The preview is recalculated when the mode changes, and the dashboard data is refreshed after completion. Added simple spacing styles to `style.css`.
- `database/README.md`, `README.md`: CSV columns, dates, kg, NULL, machine links, formula protection, the backup JSON structure, the restore policy, why `workout_requests` is excluded, and the role split with SQL backups.
- No migration (`010_backup.sql` is not needed).

## Policy

- Default `merge` (add only): no existing row is changed or deleted. Brands are linked by name and machines by brand + name. If a machine's base weight or memo differs, the existing value is kept and reported as a conflict, and restored sets are linked to the existing machine. Logs (including set contents and order), goals, and routines are skipped when the content is identical. It is a multiset comparison where one identical existing row absorbs only one incoming row, so restoring repeatedly adds nothing, and 2 originally identical logs are restored as 2.
- `replace` (full replace): deletes brands, machines, logs, sets, goals, and routines and fills them from the backup. If `confirm === "전체 교체"` is not met, it returns 400 and deletes nothing. The preview shows the deletion counts without the confirmation text.
- Validation order: format → version (v1 only) → schema (the same ranges as the existing domain constraints, and routine rules) → references (brand and machine exist, duplicate ids, duplicate brand names and per-brand machine names). On failure, 400 with up to 5 messages that include the path.
- `workout_requests` is excluded: it is a temporary duplicate-prevention record whose 7-day retry keys and response ids only make sense in the original DB. (Changed after review) In a full replace it is cleared in the same transaction. See the follow-up fix below.

## Judgment calls

- On restore, ids are not preserved and are issued anew (only relationships are preserved). A restored log has `version=1` and keeps `created_at`. (Withdrawn after review) The decision to leave retry keys after a full replace was withdrawn because of the problem of replaying deleted ids.
- The backup schema allows a log with 0 sets (the API requires at least 1). This is a conservative choice so that data created by manual SQL can also be exported and then restored.
- On a machine conflict, the existing value is kept instead of being overwritten (the principle of not changing existing records without user confirmation).
- The CSV headers are English snake_case for analysis tool compatibility, and the UI and docs explain them in Korean. The formula-protection `'` applies only to text columns, and number columns (always 0 or more) are left as they are.
- Count limits: brands 1000, machines 5000, logs 20000 (200 sets per log), goals 5000, routines 1000.

## Tests

- `backend/test/backup.test.ts` (unit, 6): commas, quotes, LF/CR, and a Korean round trip; neutralizing 7 kinds of formula start characters and not changing normal text and numbers; NULL as an empty cell; a normal v1 backup; rejecting another format, a string version, and v2; and rejecting reference errors, duplicate ids, duplicate names, invalid dates, reps, goal periods, routine rules, and a missing table.
- `backend/test/csv-reader.ts`: a minimal RFC 4180 reader for tests (checks the BOM).
- `backend/test/backup.integration.test.ts` (DB, 8): inside the dedicated test DB, each test creates its own schema, applies the migrations, and DROPs it in finally (so a full replace does not erase the data of other tests running at the same time). Export → restore into an empty DB equivalence (compared by natural keys), preview changes nothing and preview = run summary, repeated restore and self-restore change nothing, 2 identical logs preserved, the CSVs of the two DBs are identical; a machine conflict keeps the existing one and links; full replace rejects 4 kinds of confirmation text, the preview deletion counts, and exact mirroring; a corrupted JSON, another format, an unsupported version, a missing data, machine/brand reference errors, and a duplicate id (400 for both preview and restore), over 10MB 413, and an invalid mode 400, all with no change; for each of merge/replace, a forced failure at the goals INSERT step gives 500 and no change overall (ROLLBACK including deletes); CSV header, BOM, escaping, formula protection, NULL, period filter, and an invalid period 400; no retry keys included, and after a full replace a retry does not replay a deleted id (follow-up fix).
- `backend/test/backup-ui.test.ts` (UI 4, existing vm adapter method): separate CSV/JSON links and policy text; when a file is selected, only the merge preview is requested, the summary is shown, and it cannot be re-sent after running; full-replace re-preview, the delete warning, disabled until the confirmation text, and sending confirm; and no restore request for a corrupted or over-10MB file or a server rejection.
- `backend/test/workout-draft-ui.test.ts`: added 1 line for the new `./backup` import stub (the same way as the existing `./routines` stub). No assertion changed.
- Run before implementation: `tsx --test test/backup.test.ts test/backup-ui.test.ts` → **0 pass / 5 fail** (expected failure because the module and menu are missing).

### Actual commands and results (2026-10-19, Node 24.21.0)

- `issue-check.ps1 -Issue 33 -Migrate` (apply 001 to 004 to the dedicated DB `workout_test_33`, then `npm run check`, connection string not printed): **EXIT=0**.
  - format:check pass, lint pass, typecheck (frontend/backend) pass.
  - `npm test`: **227 pass / 0 fail / 0 skip / 0 cancelled** (including DB integration, with the 18 new backup tests).
  - `test:agents`: **162 pass / 0 fail / 0 skip**. `test:skills`: **4 pass / 0 fail**.
  - build: frontend (vite) pass, backend (tsc) pass.
- Failures along the way and fixes: on the first run the existing `workout-draft-ui` adapter rejected the new `./backup` import (added a stub); on the test side I fixed the filename quote expectation, the BOM removal in `response.text()`, and the formula fixture position error in the new tests. Replaced the use of `any` in lint with a type.

## Limits and follow-up

- A real browser (file selection dialog, download, mobile and PC layout) is not verified. The coordinator's browser check is needed.
- Restore is a row-by-row INSERT, so a large backup near the limit can be slow. There is no progress display.
- If the data changes between the preview and the run, the run's result summary may differ from the preview (the run result is shown again).
- This is a personal API with no authentication, so the backup download also follows the same network access scope.

## Follow-up fix: reset retry keys on a full replace (2026-10-19)

Independent review P2: the `workout_requests` keys of the logs deleted by a full replace remained, so retrying a POST whose response was lost with the same key could replay the 201 response of a deleted id and be mistaken for saved (the same for replaying a PUT with an old version).

- `backend/src/backup.ts`: in replace mode, after locking the data tables, also lock `workout_requests` as `EXCLUSIVE` and run `DELETE FROM workout_requests` in the same transaction. Added `retry_keys_cleared` to the summary (the preview is a ROLLBACK, so nothing is really deleted). Merge mode does not touch the keys.
- UI: the full-replace policy text and the preview warning show "진행 중이던 저장 재시도 기록도 초기화됩니다(N건)" (Save-retry records in progress are also reset (N)).
- `database/README.md`: updated the policy. I did not add a new `Get-Content | psql` pipe command (the existing line was already on main and is not changed in this scope).
- Tests: replaced the existing "keys preserved after a full replace" assertion to fit the new policy. Regression test `a retried save after a replace restore never claims a deleted workout id`: POST with key K → after a merge restore the replay returns the same id (key kept) → a replace preview keeps the key → replace restore → the response id for a retry of K is not the deleted id and points to the log actually saved, `retry_keys_cleared=1`. Added the warning-text assertion to the UI test.

Actual results:

- Before the fix, `issue-check.ps1 -Issue 33 -Migrate -Script test`: **227 pass / 1 fail**, the failure `Must not replay the deleted id`, EXIT=1.
- After the fix, `issue-check.ps1 -Issue 33 -Migrate` (the whole `npm run check`): **EXIT=0**. Format, lint, and typecheck pass, `npm test` **228 pass / 0 fail / 0 skip**, `test:agents` **162 pass**, `test:skills` **4 pass**, build pass.

## Coordinator review and real-browser check — 2026-10-19

- Independent high-risk review (read-only): no P0/P1. **1 P2**: even after a full-replace restore, the `workout_requests` retry keys remained, so resending a save whose response was lost with the same key could return a deleted log id as "saved". Fixed with the `fix: clear stale retry keys on replace restore` above (the regression test failed before the fix). I also confirmed that replace is impossible without the confirmation text, the preview rollback, the single-client transaction, reference validation and id remapping, the 10MB body limit, CSV escaping, and parameterized queries.
- Real browser (Playwright, dev server on the dedicated DB `workout_test_33`):
  - Saved with the title `백업 "검증", 쉼표` (Backup "verification", comma), memo `줄1\n줄2` (line 1 / line 2), exercise name `=SUM(1,2)`, and set memo `-메모` (-memo) → CSV: UTF-8 BOM (EF BB BF), `text/csv; charset=utf-8`, doubled quotes, and cells with commas and line breaks quoted, and `'=SUM(1,2)` and `'-메모` prevent formula execution.
  - Downloaded backup v1 → selecting the file on screen: "미리보기 · 추가만 (아직 변경되지 않았습니다)" (Preview · add only (not changed yet)), and identical items are shown as skipped.
  - Full replace selected: the deletion counts and the warning "진행 중이던 저장 재시도 기록도 초기화됩니다(1건)" (Save-retry records in progress are also reset (1)); with the confirmation text empty or `전체교체` (no space), the run button is disabled, and the server records stay after the preview. After typing exactly `전체 교체` and running, the records were restored with the same content (including quotes, line breaks, and special characters).
  - API: a replace without the confirmation text 400, and an unsupported version (v99) 400.
  - No horizontal scrolling at mobile 390px.

## Integration of the latest main and conflict resolution — 2026-10-20

- To resolve the PR conflict state, I merged the current `main` (`6e339ab`) into the issue branch. In `backend/src/app.ts` I kept the backup routes together with main's routine progress and exercise analysis routes.
- In `frontend/src/main.tsx` I merged the icon and screen imports and the screen branches to keep the analysis, routine, and backup screens. I also kept the backup and analysis styles together in `frontend/src/style.css`.
- In `backend/test/workout-draft-ui.test.ts` I kept the backup and analysis import stubs together, and I updated `backend/test/set-completion-ui.test.ts` so that the latest main's set-completion UI test also mocks the new backup import.
- Verification: `npm run check` passed with Node 24.21.0 / npm 11.19.0 on the dedicated test DB (`127.0.0.1:55434/workout_agent_test`). Format, lint, typecheck, and build passed, app/DB tests 306 pass, 0 fail, 0 skip, worker tests 162 pass, skills tests 4 pass. The focused set-completion UI test: 8 pass, 0 fail.
- I did not re-verify in a real browser after the conflict merge. The scope of the earlier #33 browser verification is limited to what is recorded above.

## Re-merge of the latest main after merges — 2026-10-20

- After the user merged PRs #48, #49, and #54, the latest `main` was updated to `1ec8902`, and I confirmed that PR #53 had a new conflict.
- I kept `backend/src/app.ts` and the auto-merged API and domain changes, and re-resolved the conflicts in `backend/test/workout-draft-ui.test.ts`, `frontend/src/main.tsx`, and `frontend/src/style.css`.
- I kept backup and export, body records, exercise analysis, and routines together in the screens and the test loader. I also kept the body-record styles together with the existing backup screen styles.
- Because #54's `009_official_machine_weights.sql` added a default brand, 2 fixed brand-count expectations in the backup integration tests failed. I linked the delete and skip expectations to the number of brands in the backup payload, which strengthens the regression that includes the new default brand.
- After applying `009_official_machine_weights.sql` to the dedicated test DB, `npm run check` on Node 24.21.0 / npm 11.19.0: **EXIT=0**. `format:check`, lint, typecheck, and build passed. App and DB tests **339 pass / 0 fail / 0 skip**, worker tests **212 pass / 0 fail / 0 skip**, skills tests **4 pass / 0 fail / 0 skip**.
- I did not verify in a real browser after the new conflict merge. The scope of the earlier browser results is the same as recorded above.
