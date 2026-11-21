# Mutations, targeted refetch and query loaders (#376)

Writes used hand-made flags and `refreshAll` refetched every query; four screens loaded data in `useEffect`.

## Change

| File                                                                    | Content                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.tsx`, `workspace/api.ts`                                           | `action()` runs through one `useMutation`. A write names what it changed (`changed.workouts`, `.goals`, `.machines`) and only those lists refetch. A backup restore still refreshes everything. Brands and official machine weights use `staleTime: Infinity` (a machine save refetches brands).                                  |
| `workspace/goals-page.tsx`, `machine-editor.tsx`, `workout-records.tsx` | Use the shared `WriteAction` type; goal and machine writes pass their keys.                                                                                                                                                                                                                                                       |
| `body.tsx`, `analysis.tsx`, `cardio-goals.tsx`                          | `useEffect` loaders became `useQuery` (the period or range is in the key; the old list stays while the next loads); saves and deletes go through `useMutation`. A saved cardio goal is no longer reported as failed when the list refetch fails. Saving body parts on the analysis page also refreshes `['exercise-body-parts']`. |
| `routines.tsx`                                                          | Plans, weight steps and machines use `useQuery`; machines share the journal's `['machines']` cache. After a save the plan is added to the cache at once and the list is re-read with `fetchQuery`, so a failed re-read is still shown.                                                                                            |
| `forms.test.tsx`                                                        | New: saving one goal refetches goals and not workouts.                                                                                                                                                                                                                                                                            |

## Not done

- React Hook Form: the decision (keep, adopt for simple forms, or remove both packages) is with the coordinator; no package was touched.

## Checks

- `npm run test -w frontend`: 87 files pass; no existing test was edited.
- `npm run check`: passes.
