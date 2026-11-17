# #331 Audit log rows and request IDs for workout changes

- Issue: https://github.com/sirloinbh/workout-memo/issues/331
- Branch: feat/331-audit-log
- Central: sirloinbh/project-standards#552 (request IDs), #553 (audit log)

## Changes

- `backend/src/app.ts`: `app.use(requestLog)` first, so every request, a 401 included, gets an `X-Request-Id` and one JSON log line.
- `database/migrations/017_audit_log.sql`: the `audit_log` table, a copy of the central scaffold migration.
- `backend/src/routes/workouts.ts`: saving, editing and deleting a journal write one `audit_log` row in the same transaction (`before`/`after`: date, title, version, and the set count after a save). Delete now runs in a transaction too, and a delete of a missing journal writes no row.
- `backend/test/audit.integration.test.ts`, `docs/api.md`.

## Verification

- Postgres 17 in a throwaway container, all 17 migrations applied with `src/migrate.ts`; `tsx --test test/*.test.ts` with `TEST_DATABASE_URL`: 389 pass, 0 fail, 0 skipped.
- Prettier, ESLint (`--max-warnings 0`) and `tsc -p tsconfig.check.json` on the changed files; `.standards/check.mjs` passed.

## Deploy

- Merging deploys: `deploy/remote-deploy.sh` backs up the DB and applies `017_audit_log.sql` before starting the new API, then the new routes write rows. The nightly backup deletes rows older than 365 days.
