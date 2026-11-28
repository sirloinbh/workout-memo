# #529 Remove superset, warm-up and the plate calculator from the editor

- Issue: https://github.com/sirloinbh/workout-memo/issues/529 (epic #524)
- Branch: feat/529-remove-superset-warmup-plates

## What changed

- The set cards have no Superset, Warm-up or Plates toggles or panels. Deleted `plates.ts`, `warmup.ts`, `superset.ts`, `workspace/{plate-calculator,warmup-panel,superset-panel}.tsx`, `use-plate-settings.ts` and their tests (`plate-calculator.test.tsx`, `plates.test.ts`, `warmup.test.ts`, `superset.test.ts`, `backend/test/superset.test.ts`).
- `superset` is removed from `shared/contract.ts` (and the generated `backend/src/contract.ts`), the insert in `store/workouts.ts`, backup export and restore, the backup schema, the draft check, `docs/api.md` and `docs/openapi.json`.
- `GET /api/workouts` strips `superset` from each set (`to_jsonb(s) - 'superset'`).

## Choice for implementation

- **The `sets.superset` column and its old values are kept** (migration 023 stays; no destructive migration). New rows leave it NULL. Nothing reads it. Reverse: a later issue can add a numbered migration that drops it, after a backup.
- Restore stays tolerant: the backup schema strips unknown keys, so an old backup that contains `superset` parses and the value is ignored. A request body that still sends `superset` is accepted and the value dropped. Both have tests.
- The browser's stored plate settings (localStorage) are left unread.

## Verification

- `npm run check` without `TEST_DATABASE_URL`; CI runs the DB tests.
