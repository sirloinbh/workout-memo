# #251 Suggest the next goal when a cardio goal is achieved

- Issue: [#251](https://github.com/sirloinbh/workout-memo/issues/251)
- Branch: `feat/251-cardio-goal-suggestion`
- Depends on: #116 (cardio goals and judging)
- Design: user decisions N1 to N4 on 2026-11-08 ([#251 comment](https://github.com/sirloinbh/workout-memo/issues/251#issuecomment-6721368187))

## Purpose

When a cardio goal is achieved, the server suggests the next goal so that the user can set the next goal right away. As with the next goal suggestion for strength goals (#86), it does not save anything and only fills the form.

## Change — feat: server-side suggestion calculation

- `backend/src/cardio-goals.ts`: `suggestCardioGoal(goal, today)` (testable without a DB).
  - N1 and N2: it raises from the target value of the achieved goal (not based on the actual records).
    - Total distance and longest distance: +10%, in 0.1 km units (swimming 0.05 km = 50 m)
    - Total time: +10%, in 1 minute units
    - Count: +1 time
    - Record time: target time -3%, in 5 second units. The distance stays the same.
  - If rounding leaves it the same or changes it less, it moves to the next unit (for example 0.3 km → 0.4 km, 61 seconds → 2 minutes, 5 km 30:00 → 29:05).
  - N4: the type, exercise kind, and period unit are the same, the start date is today (Seoul), and the end date has the same length as the original goal.
  - If it goes over the allowed range (distance 10000 km, time 31 days, count 1000, record time at least 1 second), it is `null`.
- `backend/src/routes/cardio-goals.ts`: `GET /api/cardio-goals/:id/suggestion` → `{ goal_id, suggestion }`. 404 for a goal that does not exist, 400 for an invalid ID. It is calculated whether or not the goal is achieved (same as the strength suggestion).
- `docs/api.md` (endpoint table, rules), `backend/src/openapi.ts` → `npm run openapi`.

## Change — feat: My goals screen

- `frontend/src/cardio-goals.tsx`
  - N3: only on an "달성 완료" (achieved) card, it loads the suggestion and shows a button "다음 목표: 러닝 5 km 29:05 이내" (next goal: running 5 km within 29:05). If there is no suggestion or loading fails, no button is placed.
  - When the button is pressed, the add cardio goal dialog is filled with the suggested values (swimming distance in m, time in minutes and seconds). Saving is done after the user confirms.
- The `frontend/src/cardio/*` files were not changed.

## Tests

- Added: 2 tests in `backend/test/cardio-goals.test.ts` (no DB). They check the increase for each type, rounding and at least one unit, swimming 50 m, the date length, that the suggestion passes the API schema, and that it is `null` when over the range. 11 pass.
- Added: `backend/test/cardio-goals.integration.test.ts` (PostgreSQL). It checks the suggested values and dates for a saved goal, and the 404 and 400.
- Added: 1 test in `frontend/src/cardio-goals.test.tsx`. It checks that only an achieved card has the suggestion button (no request is made for a goal that is not achieved), that pressing it fills the form, that nothing is sent before saving, and that saving sends the suggested values as they are. 6 pass.
- api-contract and openapi tests, `typecheck` (backend and frontend), eslint and prettier (changed files): passed.
- The integration tests are confirmed in CI because this PC has no PostgreSQL. I did not run the local full `npm run check` and e2e because of low memory.
- `e2e/support/ui-fixtures.ts` (shared e2e helper): I added that `/api/cardio-goals/:id/suggestion` is answered with the real `suggestCardioGoal`. Without it, it is a 404 and the button is not shown.
- Visual baselines: the achieved 5 km record goal in the fixed data gets a "다음 목표" (next goal) button, so I expect 4 goals images to change. I update them after checking the CI images.

## First review

- No required comments. I confirmed that over a wide input range (distance 0.001 to 20 km in 1 m steps, records 1 to 4000 seconds, the whole range of total time), the suggestion fits the unit and passes the schema.
- Applied (optional):
  - When the record time was not in 5 second units, it was reduced less (102 seconds → 100 seconds). As decision N1 says "reduce by at least 5 seconds", it now reduces by at least one unit (102 seconds → 95 seconds). I added a test. I also corrected the wording in the document that the raised value is at least the next unit boundary.
  - If the date changed while the screen stayed open, a suggestion that starts with yesterday's date remained. When the date changes, it is loaded again.

## Change — test: update visual baselines

- In the CI `e2e-visual` of `876b0e6`, only 4 goals images and 1 goal-editor 768px image failed, and the other 86 passed.
- I checked the 390px and 768px images. The achieved "러닝 5 km 30:00 이내" (running 5 km within 30:00) card got a "다음 목표: 러닝 5 km 29:05 이내" button (in the 768px two-column layout, it wraps to two lines), the other cards do not have it, and nothing overflows. The goal-editor 768px changed because the button is visible in the background behind the modal. I updated 5 images with the `visual-baselines` artifact.
