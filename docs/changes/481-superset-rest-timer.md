# Superset groups with one rest timer (#481)

Two or more exercises of one workout log can be grouped as a superset. With "Auto-start when a set is done" on, the rest timer starts only after the last exercise of a round, not after every set.

## Decision (user, 2026-11-25)

The group lives per workout log (not in routines), with two or more exercises per group. The rest timer starts after the last exercise of a round.

## Behavior

- Each set card has a "Superset" toggle in the header row (it shows "Superset N" when grouped). Its panel picks a group: not in a superset, or Superset 1 to 20 (the groups in use plus the next free one).
- A group needs at least two different exercises (names compared without case or surrounding spaces); several sets of the same exercise share the group. The server answers 400 on `sets.N.superset` otherwise, and the screen checks the same schema before saving.
- Order in the log decides the round: the last exercise to appear in the group is the one after which the timer starts. A group that has only one exercise yet behaves like no group, and a set outside a superset starts the rest as before.
- "Add set" copies the last set's group, so the next round stays grouped.

## Data

- Migration `023_set_superset.sql` adds `sets.superset smallint` (NULL = none, 1 to 20 by CHECK), safe to rerun. Nothing existing changes; old rows have NULL.
- `shared/contract.ts` (+ generated `backend/src/contract.ts`), `insertSets`, backup export, backup schema and restore (merge key) carry it. A backup made before this restores with no groups. `docs/api.md` and `docs/openapi.json` are updated.

## Files

- `frontend/src/superset.ts` (round rule), `frontend/src/workspace/superset-panel.tsx`, `workout-editor.tsx`, `use-workout-draft.ts` (the completion callback now also gets the sets and the index), `app.tsx`.
- Tests: `backend/test/superset.test.ts` (validation, DB round trip, CHECK), `frontend/src/superset.test.ts`, `frontend/src/superset-rest.test.tsx`.

## Production

Merging deploys to production and the deploy applies migration 023 (additive column).
