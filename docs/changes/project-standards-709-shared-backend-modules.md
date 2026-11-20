# Adopt the shared db and rate-limit modules (project-standards#709, part 1)

- Every hand-written BEGIN/COMMIT/ROLLBACK block (analysis, cardio replace and import, routine transaction, workout save and delete, backup snapshot and restore) runs through `src/transaction.ts`, a small wrapper over the managed `withTransaction`. A route that must not change anything on a refusal (404, 409 replay, preview) still rolls back, through the `commit` predicate. A response is now sent after the commit, not inside the transaction.
- The backup snapshot sets `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY` as its first statement instead of `BEGIN ISOLATION LEVEL ...`.
- `src/pool.ts` (`connectPool`): the managed `createPool` plus a per-connection `error` listener. The server had no error listener before.
- `app.ts` uses the managed `apiRateLimit(app)` (new here: 600 per minute per client IP, health not counted), after `requestLog` and before the shared sign-in.
- Not in this PR: the OpenAPI builder.
- Verification: typecheck, eslint, prettier, non-DB tests (281 pass). DB tests run in CI.
