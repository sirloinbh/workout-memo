# Drop number-or-string handling for fields the API now returns as numbers (#443)

After #364 (PR #430) the machine and official-weight endpoints return numbers.

## Change

| File                                       | Content                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/workspace/model.ts`          | `official_raw_value`, `official_weight_kg`, and the official weight's `raw_value` / `weight_kg` are `number \| null`; `officialLabel` no longer wraps them in `Number()`. |
| `frontend/src/workspace/machines-page.tsx` | The machine editor takes `base_weight` as it is (it was already typed `number \| null`).                                                                                  |

## Not changed

- Workout set weights (`SetRow.weight`, `body.tsx`) and the routine plan fields still allow `number | string`: `GET /api/workouts` and `/api/routines` were not part of #364 (workouts belong to lane-1, routines to lane-2). They can follow when those endpoints return numbers.
- `Goal.target_weight` was already a number.

## Checks

- `npm run typecheck` passes; `npm run check`: passes.
