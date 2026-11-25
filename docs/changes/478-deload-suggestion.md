# Suggest a deload after repeated misses (#478)

When an exercise of an auto routine misses its target three sessions in a row, the routine card suggests a deload weight or a smaller weight step. It is a suggestion only: nothing in the routine or the step setting changes unless I edit it myself.

## Rules (user decision, 2026-11-25)

- 3 misses in a row. Only judged sessions count (the routine's existing `achieved` / `missed` result per exercise); a hit resets the count, and a deload session or a session whose window is still open neither adds to nor breaks the run.
- Suggested deload: 10% below the missed weight, rounded to the exercise's weight step, and always lower than the missed weight (a result that did not go down drops one step; never below 0).
- Alternative: half the current weight step.
- Exercises are matched ignoring case and outer spaces. Manual routines are not judged, so they never show a suggestion.

## Choice made without asking

There is no Accept button. A deload would rewrite the routine's base weight and re-judge past sessions, and the weight step is a per-exercise global setting rather than a routine setting, so "accepting" had no clean meaning. To reverse: add an Accept that edits the weight step (`PUT /api/weight-steps`) or the routine plan.

## Change

| File                                                                  | Content                                       |
| --------------------------------------------------------------------- | --------------------------------------------- |
| `backend/src/stalls.ts`                                               | `findStalls` and `deloadSuggestion`           |
| `backend/src/routes/routines.ts`                                      | `stalls` added to the routine progress answer |
| `backend/src/openapi.ts`, `docs/openapi.json`, `docs/api.md`          | Field mentioned                               |
| `frontend/src/routine-stalls.tsx`, `progress.tsx`, `progress-data.ts` | The suggestion card in the routine goals      |
| `backend/test/stalls.test.ts`, `frontend/src/routine-stalls.test.tsx` | Detection, reset, suggested values, card      |

## Checks

See the PR for the `npm run check` result.
