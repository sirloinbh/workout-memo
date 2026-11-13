# #58 Migration history, feature-based backend structure, and REST contract document

- Issue: [#58](https://github.com/sirloinbh/workout-memo/issues/58) (roadmap [#3](https://github.com/sirloinbh/workout-memo/issues/3), step 2: structure and contract)
- Branch: `chore/58-structure-contracts`

## Purpose

- There was no migration history, so we could not tell which files had been applied to an existing volume. The user ran a psql command for each file by hand, and the Windows PowerShell pipe corrupted Korean text (#55).
- Most API routes were in one file, `backend/src/app.ts` (590 lines). The request and response contract was scattered across the README and database/README.

## Change — 2026-10-20

### Migration history

- `backend/src/migrations.ts`
  - It checks the file name format (`NNN_name.sql`) and duplicate numbers.
  - The checksum is computed with SHA-256, ignoring differences in CRLF and the UTF-8 BOM.
  - The planning stage picks the files not yet applied and finds these errors: changed content, a missing file, and a new file with a number lower than one already applied.
  - The execution stage takes an advisory lock and applies one file and its history row in one transaction. The status query is read-only and does not create the history table.
- The `backend/src/migrate.ts` CLI and npm scripts
  - Run from the root with `npm run db:migrate` and `npm run db:migrate -- --status`.
  - The backend script is `tsx --env-file-if-exists=../.env src/migrate.ts`. An already set `DATABASE_URL` takes priority over `.env`.
- History table: `schema_migrations(name, checksum, applied_at)`.
- The existing 001 to 009 are all safe to re-run. So on an existing DB with no history, the first run applies everything again and records it as the baseline. Existing data does not change.
- Empty volumes keep the Docker `docker-entrypoint-initdb.d` initialization as it is. Instead, I wrote the rule that new migrations must also be written to be safe to re-run into database/README and AGENTS.md.
- CI prepares the schema with `npm run db:migrate` instead of a per-file psql loop.

### Feature-based backend structure

- I moved the routes of `app.ts` into these modules. `app.ts` handles only the registration order.
  - `backend/src/routes/routines.ts`
  - `machines.ts`
  - `workouts.ts`
  - `body-measurements.ts`
  - `goals.ts`
  - `analysis.ts`
  - `shared.ts` (`id`, `seoulTodaySql`, and common error handling)
- Not changed: the route registration order, the order of registering the backup route before the JSON parser, the SQL, the responses, and the error messages.
- Before the move, I mechanically compared that every line of `app.ts` is in the new modules. The only remaining differences are the import lists and the declarations with `export` added.
- `backup.ts` has its logic and route in one file and tests import it directly, so I kept its location.

### REST contract document

- In `docs/api.md` I organized: the common rules (JSON, dates `YYYY-MM-DD` and Asia/Seoul, total weight in kg and NULL), the error format `{ error }` and status codes, a table of 30 endpoints, the main request bodies, and the change procedure.
- `backend/test/api-contract.test.ts` reads the actually registered methods and paths from the Express router stack and compares them with the document table in both directions.

### Documents

- I reflected the migration procedure in these documents: database/README (apply, status, failure recovery, and writing rules), README (run and verification procedure), and AGENTS.md (verification commands, and schema and route change rules).
- I recorded the adoption status in `skills/workout-foundation/references/stack.md` and updated `.claude/skills/` with `npm run skills:sync`.

## Tests

Tests added:

- `backend/test/migrations.test.ts` (5 unit tests)
  - The checksum ignores line endings and the BOM and detects a content change
  - The repo migration file names and order, and reading Korean UTF-8
  - Rejecting bad names and duplicate numbers
  - Classifying only the files after the applied history as pending
  - Reporting the errors of changed content, a missing file, and an earlier number
- `backend/test/migrations.integration.test.ts` (3 DB tests, each creating a temporary schema and dropping it afterward)
  - Empty schema: the status query does not create the history table, applying everything and recording the history, the Korean seed, and 0 files on a re-run
  - Existing schema with no history: after recording the baseline, the total weight, RPE, and completion state of existing sets are kept
  - Failure: it stops on a checksum change, a failed file leaves no table or history, and the advisory lock is released
- `backend/test/api-contract.test.ts` (2 tests): the document table and the registered routes match in both directions, and every path is under `/api`

Run results:

- Environment: Node 24.21.0 / npm 11.19.0, a dedicated test DB (`workout-memo-agent-test-db`, 127.0.0.1:55434)
- Running only the tests above: 8 migration tests and 2 contract tests all pass
- `npm run db:migrate` on the test DB: it recorded 001 to 009 as the baseline on the existing DB with no history. The result of the second run was "적용할 마이그레이션이 없습니다." (there are no migrations to apply).
- `npm run check`: **EXIT=0**
  - format:check, lint, typecheck, and build pass
  - App and DB tests **349 pass / 0 fail / 0 skip**
  - Worker tests **212 pass / 0 fail / 0 skip**
  - Skill tests **4 pass / 0 fail / 0 skip**
- There is no screen change, so I did not do a browser check.
- I could not run the skill-creator `quick_validate.py`. Python has no PyYAML, so it failed at the import step, and I did not install the package. The only change on the skills side is one paragraph of `references/stack.md`, and I did not change the SKILL.md frontmatter. The match between the source and the copies is confirmed by `test:skills` 4 pass.

## Limits and follow-up

- I did not run `db:migrate` on the user's real local DB (`workout-memo-db-1`). After the merge, check the status with `npm run db:migrate -- --status` and run `npm run db:migrate`, and the baseline is recorded.
- The following need new npm packages, so they are left as follow-up issues: generating OpenAPI docs, and a shared Zod contract package for the frontend and backend. The frontend structure is handled in roadmap step 3.
- Empty volume initialization is still done by Docker initdb without history. The first `db:migrate` re-applies the same files and records them, so the re-run safety of migrations remains a prerequisite.
