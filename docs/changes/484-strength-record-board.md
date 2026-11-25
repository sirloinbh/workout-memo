# Show a per-exercise strength record board (#484)

The analysis page has a "Record board" card listing, for each exercise, the best estimated 1RM and the heaviest set, each with the date it was first reached.

## Rules

- Same rules as the PRs of `/api/analysis` (#477 keeps the estimated 1RM definition): only completed sets up to today (Asia/Seoul), exercise names compared ignoring case and outer spaces, sets on a machine with an unconfirmed (NULL) base weight and bodyweight or high-rep sets have no 1RM estimate, a tie keeps the earliest date.
- An exercise is listed when it has a best estimated 1RM or a heaviest set. Strongest estimated 1RM first, then by name; exercises without an estimate go last.
- The board covers all saved history, not the selected analysis period.

## Change

| File                                                                                                | Content                                          |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `backend/src/records.ts`                                                                            | `recordBoard`, built on the shared `analyze`     |
| `backend/src/routes/analysis.ts`                                                                    | `GET /api/records`                               |
| `backend/src/openapi.ts`, `docs/openapi.json`, `docs/api.md`                                        | The new route                                    |
| `frontend/src/record-board.tsx`, `frontend/src/analysis.tsx`                                        | The board card above "PRs by exercise"           |
| `backend/test/records.test.ts`, `records.integration.test.ts`, `frontend/src/record-board.test.tsx` | Bests and dates, ordering, empty history, screen |

## Checks

See the PR for the `npm run check` result. Axe and responsive checks for the analysis page run in the CI e2e jobs (local e2e cannot bind port 3201 on this PC).
