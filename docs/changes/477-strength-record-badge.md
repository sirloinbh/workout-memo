# Mark a new strength record when a set is saved (#477)

Saving a log now tells which sets beat the best earlier estimated 1RM of their exercise, and the screen shows a "New record" badge for them right after the save.

## Rule (user decision, 2026-11-25)

- A record is an estimated 1RM (Epley, the same `estimatedOneRepMax` as exercise analysis) above every earlier completed set of the same exercise name (case and outer spaces ignored).
- A tie is not a record.
- Sets on a machine with an unconfirmed (NULL) base weight have no estimate and are skipped, as are bodyweight and high-rep sets.
- "Earlier" means earlier by workout date, then set id, so editing an old log only compares with sets before it.
- The first estimate of an exercise has nothing to beat, so it is not a record (decision recorded here: otherwise every new exercise would get a badge).

## Change

| File                                                                                  | Content                                                                             |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `backend/src/records.ts`                                                              | `findNewRecords` (pure rule) and `newRecordsFor` (query)                            |
| `backend/src/routes/workouts.ts`                                                      | POST and PUT answer `{ id, version, records }`; a retry key replays the same answer |
| `backend/src/openapi.ts`, `docs/api.md`                                               | Response field documented                                                           |
| `frontend/src/workspace/new-records.tsx`                                              | The badge list shown after a save                                                   |
| `frontend/src/workspace/use-workout-draft.ts`                                         | Keeps the `records` of the last save                                                |
| `frontend/src/app.tsx`                                                                | Shows the list under the save status                                                |
| `backend/test/records.test.ts`, `records.integration.test.ts`, `new-records.test.tsx` | First set, tie, beaten record, NULL base, old-log edit, separate exercises          |

## Checks

See the PR for the `npm run check` result.
